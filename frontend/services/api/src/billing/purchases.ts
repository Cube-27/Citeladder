import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { activationSchema, resolvedQuoteSchema } from '@citeladder/contracts/billing';
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
  type Subscription,
} from './contracts.ts';
import { catalog } from './catalog.ts';
import { baseIntent, packIntent, type Intent } from './quotes.ts';
import { onCheckoutAllowList } from './checkout-access.ts';
import {
  checkoutAvailable,
  RazorpayProvider,
  ProviderError,
  type BillingProvider,
} from './razorpay.ts';

const credentialMode = z.enum(['byok', 'funded']);

const nullableState = z.string().trim().nullable().default(null);
export const baseRequest = z
  .object({
    catalog_key: z.enum(['tier_1', 'tier_2', 'tier_3']),
    credential_mode: credentialMode,
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
  })
  .strict();
export const packRequest = z
  .object({ catalog_key: z.string().trim().min(1).max(64), quantity: amount.min(1) })
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
    // A pack follows the plan's mode; only a base purchase chooses one.
    (request.kind !== 'base' || pending.credential_mode === request.mode) &&
    pending.country_code === request.country &&
    digest(snapshot.customer) === digest(request.identity)
  );
}

export function createPending(
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
      credential_mode: intent.mode,
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

export async function dispatch(db: Database, pending: Pending, provider: BillingProvider) {
  // The intent transaction has committed. Never retry uncertain creation here.
  try {
    const reference = await provider.create(pending);
    await db
      .updateTable('pending_activations')
      .set({ external_reference: reference, updated_at: new Date() })
      .where('id', '=', pending.id)
      .where('external_reference', 'is', null)
      .execute();
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    // An uncertain failure leaves the committed intent pending: the client
    // polls and recovery finds or abandons the provider record.
    if (!error.uncertain)
      await db
        .updateTable('pending_activations')
        .set({
          status: 'failed',
          failed_at: new Date(),
          failure_code: error.message,
          updated_at: new Date(),
        })
        .where('id', '=', pending.id)
        .where('status', '=', 'pending')
        .execute();
  }
  return db
    .selectFrom('pending_activations')
    .selectAll()
    .where('id', '=', pending.id)
    .executeTakeFirstOrThrow();
}

/** Refuses a purchase the account's current subscription or open intents rule out. */
async function purchasable(db: Database, accountId: string, request: Purchase) {
  const current = await db
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('billing_account_id', '=', accountId)
    .where('is_current', '=', true)
    .executeTakeFirst();
  const pending = await db
    .selectFrom('pending_activations')
    .select(['activation_kind', 'catalog_key'])
    .where('billing_account_id', '=', accountId)
    .where('status', '=', 'pending')
    .execute();
  if (request.kind === 'base') {
    // Any current row refuses, including a halted one awaiting its cancellation.
    if (current) conflict('subscription_already_active');
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
  return current;
}

function purchaseIntent(
  config: ServiceConfig,
  frozen: Awaited<ReturnType<typeof catalog>>,
  request: Purchase,
  identity: ReturnType<typeof requestIdentity>,
  current: Subscription | undefined,
  now: Date,
) {
  let intent: Intent;
  if (request.kind === 'base') {
    const plan = frozen.payload.plans.find((row) => row.key === request.key);
    if (!plan) conflict('catalog_key_unknown');
    intent = baseIntent(
      config.billing,
      plan,
      credentialMode.parse(request.mode),
      identity.country,
      identity.identity,
      frozen.revision,
      now,
    );
    const price = plan.regional_prices[intent.mode][intent.region];
    if (price?.provider_mode !== config.razorpay.mode) conflict('checkout_unavailable');
  } else {
    const item = (request.kind === 'addon' ? frozen.payload.addons : frozen.payload.topups).find(
      (row) => row.key === request.key,
    );
    if (!item) conflict('catalog_key_unknown');
    intent = packIntent(config.billing, item, {
      kind: request.kind,
      mode: credentialMode.parse(current!.credential_mode),
      quantity: request.quantity,
      planKey: current!.catalog_key,
      country: identity.country,
      identity: identity.identity,
      revision: frozen.revision,
      now,
    });
  }
  return intent;
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
    const current = await purchasable(trx, account.id, request);
    const frozen = await catalog(trx);
    const now = new Date();
    const intent = purchaseIntent(config, frozen, request, identity, current, now);
    const allowListed = await onCheckoutAllowList(trx, workspaceId);
    if (!checkoutAvailable(config.billing, config.razorpay, intent.region, allowListed))
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
