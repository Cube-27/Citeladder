/** Plan changes on a current base subscription: paid upgrades and scheduled downgrades. */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { planChangeSchema } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { ApiError } from '../errors.ts';
import { identitySchema, conflict, digest } from './contracts.ts';
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
import { frozenTermsSchema, scheduledSchema } from './settlement.ts';
import { activationResponse, createPending, dispatch, workspaceAccount } from './purchases.ts';

export const changeRequest = z
  .object({ catalog_key: z.enum(['tier_1', 'tier_2', 'tier_3']) })
  .strict();

/** Commits a downgrade for the period end; the provider switch follows the commit. */
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

async function replayedPlanChange(db: Database, accountId: string, key: string, targetKey: string) {
  const prior = await db
    .selectFrom('pending_activations')
    .selectAll()
    .where('billing_account_id', '=', accountId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
  if (prior) {
    if (prior.activation_kind !== 'upgrade' || prior.catalog_key !== targetKey)
      conflict('idempotency_key_reused');
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
      conflict('idempotency_key_reused');
    return {
      pending: null,
      response: planChangeSchema.parse(replay.response_body),
      fresh: false,
      subId: null,
    };
  }
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
      sub.status !== 'active' ||
      sub.cancel_at_period_end ||
      sub.current_period_end <= new Date() ||
      sub.provider !== 'razorpay' ||
      sub.provider_mode !== config.razorpay.mode
    )
      conflict('plan_change_unavailable');
    if (sub.scheduled_change) {
      const scheduled = scheduledSchema.parse(sub.scheduled_change);
      if (
        scheduled.direction === 'downgrade' &&
        scheduled.catalog_key === targetKey &&
        scheduled.state !== 'provider_rejected'
      )
        return {
          pending: null,
          fresh: false,
          subId: sub.id,
          response: planChangeSchema.parse({
            direction: 'downgrade',
            catalog_key: targetKey,
            status: scheduled.state,
            effective_at: scheduled.effective_at,
            activation: null,
          }),
        };
      if (scheduled.state !== 'provider_rejected') conflict('plan_change_pending');
    }
    if (
      await trx
        .selectFrom('pending_activations')
        .select('id')
        .where('billing_account_id', '=', account.id)
        .where('activation_kind', '=', 'upgrade')
        .where('status', '=', 'pending')
        .executeTakeFirst()
    )
      conflict('plan_change_pending');
    if (targetKey === sub.catalog_key) conflict('plan_change_same_plan');
    const published = await catalog(trx);
    const plan = published.payload.plans.find((row) => row.key === targetKey);
    if (!plan) conflict('catalog_key_unknown');
    const now = new Date();
    const identity = identitySchema.parse(account.billing_profile);
    // A plan change keeps the subscription's mode; switching mode is a new plan.
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
    if (current.currency !== terms.currency) conflict('plan_change_unavailable');
    const difference = target.quote.base_price.amount_minor - current.quote.base_price.amount_minor;
    // The checkout switch stops new charges; a downgrade charges nothing and
    // needs only the provider that already bills this subscription.
    if (
      !(difference > 0
        ? checkoutAvailable(
            config.billing,
            config.razorpay,
            target.region,
            await onCheckoutAllowList(trx, workspaceId),
          )
        : configured(config.razorpay)) ||
      plan.regional_prices[mode][target.region]?.provider_mode !== sub.provider_mode
    )
      conflict('checkout_unavailable');
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
    if (prorated < config.billing.minimumUpgrade) conflict('plan_change_unavailable');
    const intent = quoteIntent(config.billing, {
      kind: 'upgrade',
      mode,
      key: targetKey,
      quantity: 1,
      country: account.billing_country,
      identity,
      currency: terms.currency,
      unitAmount: prorated,
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
    // The refused change stays replaceable; a retry with the same key re-requests it.
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
    throw new ApiError(502, 'provider_rejected');
  }
  return state === 'scheduled' ? { ...prepared.response, status: state } : prepared.response;
}

/** Push a requested change to the provider; returns the state it recorded. */
export async function pushChange(db: Database, id: string, provider: BillingProvider) {
  const sub = await db
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  // An ending subscription never renews onto the new plan.
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
