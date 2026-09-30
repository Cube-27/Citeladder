import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  activationSchema,
  resolvedQuoteSchema,
  planChangeSchema,
} from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { policy } from '../config.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { ApiError, notFound } from '../errors.ts';
import {
  amount,
  identitySchema,
  conflict,
  digest,
  type Identity,
  type Pending,
  type Account,
} from './contracts.ts';
import { catalog } from './catalog.ts';
import { baseIntent, packIntent, quoteIntent, roundedRatio, type Intent } from './quotes.ts';
import {
  checkoutAvailable,
  RazorpayProvider,
  ProviderError,
  type BillingProvider,
} from './razorpay.ts';
import { frozenTermsSchema, scheduledSchema } from './settlement.ts';

const nullableState = z.string().trim().nullable().default(null);
export const baseRequest = z
  .object({
    catalog_key: z.enum(['tier_1', 'tier_2', 'tier_3']),
    credential_mode: z.enum(['byok', 'funded']),
    country_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/u),
    billing_name: z.string().trim().min(1).max(160),
    billing_address_line1: z.string().trim().min(1).max(240),
    billing_city: z.string().trim().min(1).max(100),
    billing_postal_code: z.string().trim().toUpperCase().min(1).max(24),
    billing_state_code: nullableState.refine(
      (value) => !value || identitySchema.shape.state_code.safeParse(value).success,
    ),
    customer_gstin: nullableState.refine(
      (value) =>
        !value || identitySchema.shape.customer_gstin.safeParse(value.toUpperCase()).success,
    ),
    export_eligibility_attested: z.boolean().default(false),
    trial_requested: z.boolean().default(false),
  })
  .strict();
export const packRequest = z
  .object({ catalog_key: z.string().trim().min(1).max(64), quantity: amount.min(1) })
  .strict();
export const changeRequest = z
  .object({ catalog_key: z.enum(['tier_1', 'tier_2', 'tier_3']) })
  .strict();
export function idempotencyKey(raw: string | undefined) {
  const key = raw?.trim();
  if (
    !key ||
    key.length < policy.billing.contracts.idempotency_key_min_length ||
    key.length > policy.billing.contracts.idempotency_key_max_length ||
    /\s/u.test(key)
  )
    throw new ApiError(400, 'idempotency_key_required');
  return key;
}

export async function workspaceAccount(db: Database, workspaceId: string) {
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (!account) conflict('billing_account_unavailable');
  return account;
}
export async function workspaceActivation(db: Database, workspaceId: string, id: string) {
  const pending = await db
    .selectFrom('pending_activations')
    .innerJoin('billing_accounts', 'billing_accounts.id', 'pending_activations.billing_account_id')
    .selectAll('pending_activations')
    .where('pending_activations.id', '=', id)
    .where('billing_accounts.workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (!pending) throw notFound('Activation');
  return pending;
}
export function activationResponse(pending: Pending) {
  return activationSchema.parse({
    activation_id: pending.id,
    kind: pending.activation_kind,
    catalog_key: pending.catalog_key,
    quantity: pending.quantity,
    status: pending.status,
    quote: resolvedQuoteSchema.parse(pending.quote),
    checkout_url: null,
    expires_at: pending.expires_at.toISOString(),
    failure_code: pending.failure_code,
  });
}

type Purchase = {
  kind: 'base' | 'addon' | 'topup';
  key: string;
  quantity: number;
  mode: string;
  country?: string;
  identity?: Identity;
};
function requestIdentity(request: Purchase, account: Account) {
  return {
    kind: request.kind,
    key: request.key,
    quantity: request.quantity,
    mode: request.mode,
    country: request.country ?? account.billing_country,
    identity: request.identity ?? identitySchema.parse(account.billing_profile),
  };
}
function matches(pending: Pending, request: ReturnType<typeof requestIdentity>) {
  const snapshot = z.object({ customer: identitySchema }).parse(pending.tax_snapshot);
  return (
    pending.activation_kind === request.kind &&
    pending.catalog_key === request.key &&
    pending.quantity === request.quantity &&
    pending.credential_mode === request.mode &&
    pending.country_code === request.country &&
    digest(snapshot.customer) === digest(request.identity)
  );
}

async function createPending(
  db: Database,
  account: Account,
  intent: Intent,
  key: string,
  mode: string,
) {
  const now = new Date();
  const fingerprint = digest({
    kind: intent.kind,
    accountId: account.id,
    key: intent.key,
    quantity: intent.quantity,
    country: intent.country,
    customer: intent.taxSnapshot.customer,
  });
  return db
    .insertInto('pending_activations')
    .values({
      id: randomUUID(),
      billing_account_id: account.id,
      activation_kind: intent.kind,
      catalog_key: intent.key,
      catalog_revision: intent.quote.catalog_revision,
      quantity: intent.quantity,
      credential_mode: 'byok',
      country_code: intent.country,
      region: intent.region,
      status: 'pending',
      quote: JSON.stringify(intent.quote),
      tax_snapshot: JSON.stringify(intent.taxSnapshot),
      change_terms: intent.changeTerms ? JSON.stringify(intent.changeTerms) : null,
      external_reference: null,
      external_price_id: intent.priceRef || null,
      provider: 'razorpay',
      provider_mode: mode,
      checkout_url: null,
      idempotency_key: key,
      request_fingerprint: fingerprint,
      expires_at: new Date(intent.quote.expires_at),
      activated_at: null,
      failed_at: null,
      failure_code: null,
      reconciliation_attempts: 0,
      reconciliation_lease_token: null,
      reconciliation_lease_expires_at: null,
      reconciliation_next_at: null,
      settled_by: null,
      settled_authority_id: null,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function dispatch(db: Database, pending: Pending, provider: BillingProvider) {
  // The intent transaction has committed. Never retry uncertain creation here.
  let reference: string;
  try {
    reference = await provider.create(pending);
  } catch (error) {
    if (error instanceof ProviderError && !error.uncertain) {
      await db
        .updateTable('pending_activations')
        .set({
          status: 'failed',
          failed_at: new Date(),
          failure_code: 'provider_rejected',
          updated_at: new Date(),
        })
        .where('id', '=', pending.id)
        .where('status', '=', 'pending')
        .execute();
    }
    throw new ApiError(502, 'provider_unavailable');
  }
  await db
    .updateTable('pending_activations')
    .set({ external_reference: reference, updated_at: new Date() })
    .where('id', '=', pending.id)
    .where('external_reference', 'is', null)
    .execute();
  return db
    .selectFrom('pending_activations')
    .selectAll()
    .where('id', '=', pending.id)
    .executeTakeFirstOrThrow();
}

export async function purchase(
  db: Database,
  config: ServiceConfig,
  workspaceId: string,
  request: Purchase,
  key: string,
  provider?: BillingProvider,
) {
  const prepared = await db.transaction().execute(async (trx) => {
    const account = await workspaceAccount(trx, workspaceId);
    await lockAccount(trx, workspaceId, account.id);
    const identity = requestIdentity(request, account);
    const prior = await trx
      .selectFrom('pending_activations')
      .selectAll()
      .where('billing_account_id', '=', account.id)
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    if (prior) {
      if (!matches(prior, identity)) conflict('idempotency_key_reused');
      return { pending: prior, fresh: false };
    }
    if (
      await trx
        .selectFrom('idempotency_records')
        .select('id')
        .where('billing_account_id', '=', account.id)
        .where('idempotency_key', '=', key)
        .executeTakeFirst()
    )
      conflict('idempotency_key_reused');
    if (request.mode !== 'byok') conflict('checkout_unavailable');
    const current = await trx
      .selectFrom('billing_subscriptions')
      .selectAll()
      .where('billing_account_id', '=', account.id)
      .where('is_current', '=', true)
      .executeTakeFirst();
    const pending = await trx
      .selectFrom('pending_activations')
      .select(['activation_kind', 'catalog_key'])
      .where('billing_account_id', '=', account.id)
      .where('status', '=', 'pending')
      .execute();
    if (request.kind === 'base') {
      if (current && policy.billing.contracts.live_subscription_statuses.includes(current.status))
        conflict('subscription_already_active');
      if (pending.some((row) => row.activation_kind === 'base')) conflict('subscription_pending');
    } else {
      if (
        !current?.current_period_end ||
        current.current_period_end <= new Date() ||
        !policy.billing.contracts.live_subscription_statuses.includes(current.status)
      )
        conflict('base_subscription_required');
      if (
        request.kind === 'addon' &&
        pending.some((row) => row.activation_kind === 'addon' && row.catalog_key === request.key)
      )
        conflict('addon_pending');
    }
    const frozen = await catalog(trx);
    let intent: Intent;
    const now = new Date();
    if (request.kind === 'base') {
      const plan = frozen.payload.plans.find((row) => row.key === request.key);
      if (!plan) conflict('catalog_key_unknown');
      intent = baseIntent(
        config.billing,
        plan,
        identity.country,
        identity.identity,
        frozen.revision,
        now,
      );
      const price = plan.regional_byok_prices[intent.region];
      if (price?.provider_mode !== config.razorpay.mode) conflict('checkout_unavailable');
    } else {
      const item = (request.kind === 'addon' ? frozen.payload.addons : frozen.payload.topups).find(
        (row) => row.key === request.key,
      );
      if (!item) conflict('catalog_key_unknown');
      intent = packIntent(
        config.billing,
        item,
        request.kind,
        request.quantity,
        current!.catalog_key,
        identity.country,
        identity.identity,
        frozen.revision,
        now,
      );
    }
    if (!checkoutAvailable(config.billing, config.razorpay, intent.region))
      conflict('checkout_unavailable');
    if (request.kind === 'base')
      await trx
        .updateTable('billing_accounts')
        .set({
          billing_country: identity.country,
          country_verification: 'declared',
          billing_profile: JSON.stringify(identity.identity),
          updated_at: now,
        })
        .where('id', '=', account.id)
        .execute();
    return {
      pending: await createPending(trx, account, intent, key, config.razorpay.mode),
      fresh: true,
    };
  });
  const pending = prepared.fresh
    ? await dispatch(
        db,
        prepared.pending,
        provider ?? new RazorpayProvider(config.billing, config.razorpay),
      )
    : prepared.pending;
  return activationResponse(pending);
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
    const prior = await trx
      .selectFrom('pending_activations')
      .selectAll()
      .where('billing_account_id', '=', account.id)
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
    const replay = await trx
      .selectFrom('idempotency_records')
      .selectAll()
      .where('billing_account_id', '=', account.id)
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
    const target = baseIntent(
      config.billing,
      plan,
      account.billing_country,
      identity,
      published.revision,
      now,
    );
    if (
      !checkoutAvailable(config.billing, config.razorpay, target.region) ||
      plan.regional_byok_prices[target.region]?.provider_mode !== sub.provider_mode
    )
      conflict('checkout_unavailable');
    const terms = frozenTermsSchema.parse({
      catalog_key: targetKey,
      catalog_revision: published.revision,
      credential_mode: 'byok',
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
    const effective = sub.current_period_end.toISOString();
    if (difference <= 0) {
      const response = planChangeSchema.parse({
        direction: 'downgrade',
        catalog_key: targetKey,
        status: 'requested',
        effective_at: effective,
        activation: null,
      });
      await trx
        .insertInto('idempotency_records')
        .values({
          id: randomUUID(),
          billing_account_id: account.id,
          idempotency_key: key,
          operation: 'subscription.change',
          request_fingerprint: digest({ targetKey }),
          state: 'completed',
          response_body: JSON.stringify(response),
          response_status: 200,
          expires_at: sub.current_period_end,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await trx
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
        .where('id', '=', sub.id)
        .execute();
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
  if (prepared.pending && prepared.fresh)
    return {
      ...prepared.response,
      activation: activationResponse(await dispatch(db, prepared.pending, adapter)),
    };
  if (prepared.subId && prepared.fresh) await pushChange(db, prepared.subId, adapter);
  return prepared.response;
}

export async function pushChange(db: Database, id: string, provider: BillingProvider) {
  const sub = await db
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  if (!sub.scheduled_change || sub.provider !== 'razorpay' || sub.provider_mode !== provider.mode)
    return;
  const change = scheduledSchema.parse(sub.scheduled_change);
  if (change.state !== 'requested') return;
  let state: 'scheduled' | 'provider_rejected' = 'scheduled';
  try {
    await provider.change(sub.external_subscription_id, change.terms.price_ref);
  } catch (error) {
    if (!(error instanceof ProviderError) || error.uncertain) return;
    state = 'provider_rejected';
  }
  await db
    .updateTable('billing_subscriptions')
    .set({ scheduled_change: JSON.stringify({ ...change, state }), updated_at: new Date() })
    .where('id', '=', id)
    .where('scheduled_change', '=', JSON.stringify(change))
    .execute();
}
