import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { planChangeSchema } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import { policy, type ServiceConfig } from '../config.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { ApiError } from '../errors.ts';
import { refuse } from './refusals.ts';
import { identitySchema } from './contracts.ts';
import { digest } from '../crypto-text.ts';
import { catalog } from './catalog.ts';
import { baseIntent, quoteIntent, roundedRatio } from './quotes.ts';
import { onCheckoutAllowList } from './checkout-access.ts';
import {
  checkoutAvailable,
  configured,
  RazorpayProvider,
  ProviderError,
  type BillingProvider,
} from './razorpay.ts';
import { frozenTermsSchema, scheduledSchema } from './settlement-terms.ts';
import { activationResponse, createPending, dispatch, workspaceAccount } from './purchases.ts';

async function scheduleDowngrade(
  db: Database,
  {
    accountId,
    subId,
    periodEnd,
    key,
    targetKey,
    terms,
    now,
  }: {
    accountId: string;
    subId: string;
    periodEnd: Date;
    key: string;
    targetKey: string;
    terms: z.infer<typeof frozenTermsSchema>;
    now: Date;
  },
) {
  const effective = periodEnd.toISOString();
  const response = planChangeSchema.parse({
    direction: 'downgrade',
    catalog_key: targetKey,
    status: 'requested',
    effective_at: effective,
    activation: null,
  });
  await db
    .insertInto('idempotency_records')
    .values({
      id: randomUUID(),
      billing_account_id: accountId,
      idempotency_key: key,
      operation: 'subscription.change',
      request_fingerprint: digest({ targetKey }),
      state: 'completed',
      response_body: JSON.stringify(response),
      response_status: 200,
      expires_at: periodEnd,
      created_at: now,
      updated_at: now,
    })
    .execute();
  await db
    .updateTable('billing_subscriptions')
    .set({
      scheduled_change: JSON.stringify({
        direction: 'downgrade',
        catalog_key: targetKey,
        effective_at: effective,
        state: 'requested',
        source: key,
        terms,
      }),
      updated_at: now,
    })
    .where('id', '=', subId)
    .execute();
  return response;
}

async function refusedFromKey(db: Database, accountId: string, key: string) {
  const sub = await db
    .selectFrom('billing_subscriptions')
    .select('scheduled_change')
    .where('billing_account_id', '=', accountId)
    .where('is_current', '=', true)
    .executeTakeFirst();
  if (!sub?.scheduled_change) return false;
  const scheduled = scheduledSchema.parse(sub.scheduled_change);
  return scheduled.source === key && scheduled.state === 'provider_rejected';
}

async function replayedPlanChange(db: Database, accountId: string, key: string, targetKey: string) {
  const prior = await db
    .selectFrom('pending_activations')
    .selectAll()
    .where('billing_account_id', '=', accountId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
  if (prior) {
    if (prior.activation_kind !== 'upgrade' || prior.catalog_key !== targetKey)
      refuse('idempotency_key_reused');
    const frozen = z.object({ effective_at: z.string() }).parse(prior.change_terms);
    return {
      pending: prior,
      response: planChangeSchema.parse({
        direction: 'upgrade',
        catalog_key: targetKey,
        status: 'payment_required',
        effective_at: frozen.effective_at,
        activation: activationResponse(prior),
      }),
      fresh: false,
      subId: null,
    };
  }
  const replay = await db
    .selectFrom('idempotency_records')
    .selectAll()
    .where('billing_account_id', '=', accountId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
  if (replay) {
    if (
      replay.operation !== 'subscription.change' ||
      replay.request_fingerprint !== digest({ targetKey })
    )
      refuse('idempotency_key_reused');
    if (await refusedFromKey(db, accountId, key)) {
      // The process died between the refusal and the record's delete; finish that
      // delete so this retry re-requests the change, as a post-refusal retry does.
      await db.deleteFrom('idempotency_records').where('id', '=', replay.id).execute();
      return null;
    }
    return {
      pending: null,
      response: planChangeSchema.parse(replay.response_body),
      fresh: false,
      subId: null,
    };
  }
  return null;
}

function replayedScheduledDowngrade(scheduledChange: unknown, subId: string, targetKey: string) {
  if (!scheduledChange) return null;
  const scheduled = scheduledSchema.parse(scheduledChange);
  if (
    scheduled.direction === 'downgrade' &&
    scheduled.catalog_key === targetKey &&
    scheduled.state !== 'provider_rejected'
  )
    return {
      pending: null,
      fresh: false,
      subId,
      response: planChangeSchema.parse({
        direction: 'downgrade',
        catalog_key: targetKey,
        status: scheduled.state,
        effective_at: scheduled.effective_at,
        activation: null,
      }),
    };
  if (scheduled.state !== 'provider_rejected') refuse('plan_change_pending');
  return null;
}

export async function changePlan(
  db: Database,
  config: ServiceConfig,
  workspaceId: string,
  targetKey: string,
  key: string,
  provider?: BillingProvider,
) {
  const prepared = await db.transaction().execute(async (trx) => {
    const account = await workspaceAccount(trx, workspaceId);
    await lockAccount(trx, workspaceId, account.id);
    const replayed = await replayedPlanChange(trx, account.id, key, targetKey);
    if (replayed) return replayed;
    const sub = await trx
      .selectFrom('billing_subscriptions')
      .selectAll()
      .where('billing_account_id', '=', account.id)
      .where('is_current', '=', true)
      .forUpdate()
      .executeTakeFirst();
    if (
      !sub?.current_period_start ||
      !sub.current_period_end ||
      sub.status !== policy.billing.subscription_status.active ||
      sub.cancel_at_period_end ||
      sub.current_period_end <= new Date() ||
      sub.provider !== 'razorpay' ||
      sub.provider_mode !== config.razorpay.mode
    )
      refuse('plan_change_unavailable');
    const scheduledReplay = replayedScheduledDowngrade(sub.scheduled_change, sub.id, targetKey);
    if (scheduledReplay) return scheduledReplay;
    if (
      await trx
        .selectFrom('pending_activations')
        .select('id')
        .where('billing_account_id', '=', account.id)
        .where('activation_kind', '=', 'upgrade')
        .where('status', '=', 'pending')
        .executeTakeFirst()
    )
      refuse('plan_change_pending');
    if (targetKey === sub.catalog_key) refuse('plan_change_same_plan');
    const published = await catalog(trx);
    const plan = published.payload.plans.find((row) => row.key === targetKey);
    if (!plan) refuse('catalog_key_unknown');
    const now = new Date();
    const identity = identitySchema.parse(account.billing_profile);
    const mode = sub.credential_mode === 'funded' ? 'funded' : 'byok';
    const target = baseIntent(
      config.billing,
      plan,
      mode,
      account.billing_country,
      identity,
      published.revision,
      now,
    );
    const terms = frozenTermsSchema.parse({
      catalog_key: targetKey,
      catalog_revision: published.revision,
      credential_mode: mode,
      quantity: 1,
      price_ref: target.priceRef,
      currency: target.quote.total_price.currency,
      quote: target.quote,
      tax_snapshot: target.taxSnapshot,
      grant_specs: plan.grants.map((row) => [row.key, row.value]),
    });
    const current = frozenTermsSchema.parse(sub.frozen_terms);
    if (current.currency !== terms.currency) refuse('plan_change_unavailable');
    const difference = target.quote.base_price.amount_minor - current.quote.base_price.amount_minor;
    if (
      !(difference > 0
        ? checkoutAvailable(
            config.billing,
            config.razorpay,
            target.region,
            await onCheckoutAllowList(trx, config, workspaceId),
          )
        : configured(config.razorpay)) ||
      plan.regional_prices[mode][target.region]?.provider_mode !== sub.provider_mode
    )
      refuse('checkout_unavailable');
    const effective = sub.current_period_end.toISOString();
    if (difference <= 0) {
      const response = await scheduleDowngrade(trx, {
        accountId: account.id,
        subId: sub.id,
        periodEnd: sub.current_period_end,
        key,
        targetKey,
        terms,
        now,
      });
      return { pending: null, fresh: true, subId: sub.id, response };
    }
    const totalSeconds = Math.floor(
      (sub.current_period_end.getTime() - sub.current_period_start.getTime()) / 1000,
    );
    const leftSeconds = Math.min(
      totalSeconds,
      Math.max(0, Math.floor((sub.current_period_end.getTime() - now.getTime()) / 1000)),
    );
    const prorated = roundedRatio(BigInt(difference) * BigInt(leftSeconds), BigInt(totalSeconds));
    if (prorated < config.billing.minimumUpgrade) refuse('plan_change_unavailable');
    const intent = quoteIntent(config.billing, {
      kind: 'upgrade',
      mode,
      key: targetKey,
      quantity: 1,
      country: account.billing_country,
      identity,
      currency: terms.currency,
      unitAmount: prorated,
      taxRate: target.taxSnapshot.tax.tax_rate,
      priceRef: target.priceRef,
      revision: published.revision,
      now,
      changeTerms: { subscription_id: sub.id, effective_at: effective, terms },
    });
    const pending = await createPending(trx, account, intent, key, sub.provider_mode);
    return {
      pending,
      fresh: true,
      subId: null,
      response: planChangeSchema.parse({
        direction: 'upgrade',
        catalog_key: targetKey,
        status: 'payment_required',
        effective_at: effective,
        activation: activationResponse(pending),
      }),
    };
  });
  if (!prepared.fresh) return prepared.response;
  const adapter = provider ?? new RazorpayProvider(config.billing, config.razorpay);
  if (prepared.pending)
    return {
      ...prepared.response,
      activation: activationResponse(await dispatch(db, prepared.pending, adapter)),
    };
  const state = prepared.subId ? await pushChange(db, prepared.subId, adapter) : null;
  if (state === 'provider_rejected') {
    await db
      .deleteFrom('idempotency_records')
      .where('idempotency_key', '=', key)
      .where('operation', '=', 'subscription.change')
      .where(
        'billing_account_id',
        '=',
        db.selectFrom('billing_accounts').select('id').where('workspace_id', '=', workspaceId),
      )
      .execute();
    throw new ApiError(502, 'The payment provider declined this plan change.', {
      code: 'provider_rejected',
    });
  }
  return state === 'scheduled' ? { ...prepared.response, status: state } : prepared.response;
}

export async function pushChange(db: Database, id: string, provider: BillingProvider) {
  const sub = await db
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  if (
    !sub.scheduled_change ||
    !sub.is_current ||
    sub.cancel_at_period_end ||
    sub.provider !== 'razorpay' ||
    sub.provider_mode !== provider.mode
  )
    return null;
  const change = scheduledSchema.parse(sub.scheduled_change);
  if (change.state !== 'requested') return null;
  let state: 'scheduled' | 'provider_rejected' = 'scheduled';
  try {
    await provider.change(sub.external_subscription_id, change.terms.price_ref);
  } catch (error) {
    if (!(error instanceof ProviderError) || error.uncertain) return null;
    state = 'provider_rejected';
  }
  const updated = await db
    .updateTable('billing_subscriptions')
    .set({
      scheduled_change: sql`jsonb_set(scheduled_change, '{state}', to_jsonb(${state}::text))`,
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .where(sql<string>`scheduled_change->>'source'`, '=', change.source)
    .where(sql<string>`scheduled_change->>'state'`, '=', 'requested')
    .executeTakeFirst();
  return updated.numUpdatedRows > 0n ? state : null;
}
