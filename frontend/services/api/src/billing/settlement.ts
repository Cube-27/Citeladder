import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { resolvedQuoteSchema } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import { lockAccount, issueBundle, revokeBundle, refreshRuntime } from '../entitlements/grants.ts';
import { catalog } from './catalog.ts';
import {
  amount,
  conflict,
  taxSnapshotSchema,
  type Pending,
  type Subscription,
} from './contracts.ts';
import type { Evidence, SubscriptionEvidence } from './razorpay.ts';
import { recordPayment } from './receipts.ts';
import { policy } from '../config.ts';
import { getLogger } from '../logging.ts';

const logger = getLogger('api.billing');

export const frozenTermsSchema = z.object({
  catalog_key: z.string(),
  catalog_revision: z.string(),
  credential_mode: z.literal('byok'),
  quantity: amount.min(1),
  price_ref: z.string(),
  currency: z.enum(['USD', 'INR']),
  quote: resolvedQuoteSchema,
  tax_snapshot: taxSnapshotSchema,
  grant_specs: z.array(z.tuple([z.string(), amount])),
});
export const scheduledSchema = z.object({
  direction: z.enum(['upgrade', 'downgrade']),
  state: z.enum(['requested', 'scheduled', 'provider_rejected']),
  catalog_key: z.string(),
  effective_at: z.string(),
  source: z.string(),
  terms: frozenTermsSchema,
});
const grantedStates = new Set(['active', 'cancel_scheduled']);
const terminalStates = new Set(['cancelled', 'expired', 'unpaid']);

/** The frozen revision's display name for a plan, as receipts print it. */
async function planName(db: Database, revision: string, key: string) {
  const frozen = await catalog(db, revision);
  return frozen.payload.plans.find((row) => row.key === key)?.name ?? key;
}

async function accountWorkspace(db: Database, accountId: string) {
  return (
    await db
      .selectFrom('billing_accounts')
      .select('workspace_id')
      .where('id', '=', accountId)
      .executeTakeFirstOrThrow()
  ).workspace_id;
}

export async function settlePending(
  db: Database,
  pendingId: string,
  mode: string,
  evidence: Evidence,
  authority: string,
) {
  const initial = await db
    .selectFrom('pending_activations')
    .selectAll()
    .where('id', '=', pendingId)
    .executeTakeFirstOrThrow();
  const workspaceId = await accountWorkspace(db, initial.billing_account_id);
  await lockAccount(db, workspaceId, initial.billing_account_id);
  const pending = await db
    .selectFrom('pending_activations')
    .selectAll()
    .where('id', '=', pendingId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (pending.provider !== 'razorpay' || pending.provider_mode !== mode)
    conflict('provider_identity_mismatch');
  const ref = evidence.kind === 'base' ? evidence.subscription.id : evidence.reference;
  const notes = evidence.kind === 'base' ? evidence.subscription.notes : evidence.notes;
  if (
    pending.external_reference !== ref ||
    (notes.citeladder_intent_id && notes.citeladder_intent_id !== pending.id) ||
    (notes.citeladder_account_ref && notes.citeladder_account_ref !== pending.billing_account_id) ||
    (notes.citeladder_catalog_revision &&
      notes.citeladder_catalog_revision !== pending.catalog_revision)
  )
    conflict('provider_reference_mismatch');
  if (pending.status !== 'pending') return;
  const failed =
    evidence.kind === 'base'
      ? !evidence.subscription.payment &&
        ['cancelled', 'expired'].includes(evidence.subscription.status)
      : evidence.failed && !evidence.payment;
  if (failed) {
    await db
      .updateTable('pending_activations')
      .set({
        status: 'failed',
        failed_at: new Date(),
        failure_code: 'provider_terminal_state',
        updated_at: new Date(),
      })
      .where('id', '=', pending.id)
      .execute();
    return;
  }
  const quote = resolvedQuoteSchema.parse(pending.quote);
  if (quote.catalog_revision !== pending.catalog_revision) conflict('catalog_revision_mismatch');
  const frozen = await catalog(db, pending.catalog_revision);
  if (evidence.kind === 'base') {
    if (
      pending.activation_kind !== 'base' ||
      evidence.subscription.priceRef !== pending.external_price_id
    )
      conflict('price_ref_mismatch');
    if (!grantedStates.has(evidence.subscription.status) || !evidence.subscription.payment) return;
    const plan = frozen.payload.plans.find((row) => row.key === pending.catalog_key);
    if (!plan || !plan.grants.length) conflict('grant_bundle_missing');
    const terms = frozenTermsSchema.parse({
      catalog_key: pending.catalog_key,
      catalog_revision: pending.catalog_revision,
      credential_mode: 'byok',
      quantity: pending.quantity,
      price_ref: pending.external_price_id,
      currency: quote.total_price.currency,
      quote,
      tax_snapshot: pending.tax_snapshot,
      grant_specs: plan.grants.map((row) => [row.key, row.value]),
    });
    const current = await db
      .selectFrom('billing_subscriptions')
      .select('id')
      .where('billing_account_id', '=', pending.billing_account_id)
      .where('is_current', '=', true)
      .executeTakeFirst();
    if (current) conflict('subscription_already_active');
    const now = new Date();
    const sub = await db
      .insertInto('billing_subscriptions')
      .values({
        id: randomUUID(),
        billing_account_id: pending.billing_account_id,
        billing_customer_id: null,
        provider: pending.provider,
        provider_mode: pending.provider_mode,
        external_subscription_id: ref,
        external_price_id: pending.external_price_id!,
        subscription_kind: 'base',
        catalog_key: pending.catalog_key,
        catalog_revision: pending.catalog_revision,
        credential_mode: pending.credential_mode,
        quantity: pending.quantity,
        currency: quote.total_price.currency,
        cadence: 'monthly',
        status: 'pending',
        is_current: true,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        provider_state_version: 0,
        ended_at: null,
        frozen_terms: JSON.stringify(terms),
        scheduled_change: null,
        reconciliation_lease_token: null,
        reconciliation_lease_expires_at: null,
        reconciliation_next_at: null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await settleSubscription(db, sub, evidence.subscription, pending, workspaceId);
  } else {
    if (pending.activation_kind === 'base') conflict('provider_record_kind_mismatch');
    if (!evidence.payment) return;
    if (pending.activation_kind === 'upgrade')
      await settleUpgrade(db, pending, evidence, workspaceId);
    else {
      const base = await db
        .selectFrom('billing_subscriptions')
        .selectAll()
        .where('billing_account_id', '=', pending.billing_account_id)
        .where('is_current', '=', true)
        .where('subscription_kind', '=', 'base')
        .executeTakeFirst();
      if (
        !base?.current_period_end ||
        evidence.payment.paidAt >= base.current_period_end ||
        !policy.billing.contracts.live_subscription_statuses.includes(base.status)
      )
        conflict('base_subscription_required');
      const item = [...frozen.payload.addons, ...frozen.payload.topups].find(
        (row) => row.key === pending.catalog_key,
      );
      const specs = item?.modes.byok?.grants;
      if (!item || !specs?.length) conflict('grant_bundle_missing');
      await recordPayment(
        db,
        pending,
        evidence.payment,
        quote,
        pending.tax_snapshot,
        null,
        item.name,
      );
      await issueBundle(db, {
        workspaceId,
        accountId: pending.billing_account_id,
        key: `activation:${pending.id}`,
        sourceKind: pending.activation_kind,
        sourceRef: `activation:${pending.id}`,
        specs: specs.map((row) => ({ key: row.key, value: row.value * pending.quantity })),
        revision: pending.catalog_revision,
        from: evidence.payment.paidAt,
        until: new Date(evidence.payment.paidAt.getTime() + item.expiry_days * 86_400_000),
        primary: false,
        profile: '',
        priority: 0,
      });
    }
  }
  await db
    .updateTable('pending_activations')
    .set({
      status: 'activated',
      activated_at: new Date(),
      settled_by: authority,
      settled_authority_id: ref,
      updated_at: new Date(),
    })
    .where('id', '=', pending.id)
    .execute();
}

export async function settleSubscription(
  db: Database,
  input: Subscription,
  event: SubscriptionEvidence,
  pending: Pending,
  workspaceId: string,
) {
  const account = await lockAccount(db, workspaceId, input.billing_account_id);
  const sub = await db
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('id', '=', input.id)
    .where('billing_account_id', '=', input.billing_account_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (event.id !== sub.external_subscription_id) conflict('provider_reference_mismatch');
  if (event.version < sub.provider_state_version) return;
  if (!sub.is_current && sub.ended_at) return;
  let terms = frozenTermsSchema.parse(sub.frozen_terms);
  const change = sub.scheduled_change ? scheduledSchema.parse(sub.scheduled_change) : null;
  const renewal =
    change &&
    event.priceRef === change.terms.price_ref &&
    event.start &&
    event.start >= new Date(change.effective_at);
  if (renewal) terms = change.terms;
  if (event.priceRef !== terms.price_ref) conflict('price_ref_mismatch');
  if (event.payment) {
    if (
      event.notes.citeladder_intent_id !== pending.id ||
      event.notes.citeladder_account_ref !== pending.billing_account_id ||
      event.notes.citeladder_catalog_revision !== pending.catalog_revision ||
      !event.payment.invoiceId
    )
      conflict('subscription_payment_mismatch');
    const start = event.start,
      end = event.end;
    if (
      !start ||
      !end ||
      start >= end ||
      event.payment.periodStart?.getTime() !== start.getTime() ||
      event.payment.periodEnd?.getTime() !== end.getTime()
    )
      conflict('subscription_period_bounds_invalid');
    const overlap = await db
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', sub.billing_account_id)
      .where('source_ref', '=', `subscription:${sub.id}`)
      .where('period_start', '<', end)
      .where('period_end', '>', start)
      .where((eb) => eb.or([eb('period_start', '!=', start), eb('period_end', '!=', end)]))
      .executeTakeFirst();
    if (overlap) conflict('subscription_period_overlap');
    await recordPayment(
      db,
      { ...pending, catalog_key: terms.catalog_key, catalog_revision: terms.catalog_revision },
      event.payment,
      terms.quote,
      terms.tax_snapshot,
      sub.id,
      await planName(db, terms.catalog_revision, terms.catalog_key),
    );
    if (grantedStates.has(event.status))
      await issueBundle(db, {
        workspaceId,
        accountId: sub.billing_account_id,
        key: `sub:${sub.id}:${start.toISOString()}:${end.toISOString()}:base`,
        sourceKind: 'plan',
        sourceRef: `subscription:${sub.id}`,
        specs: terms.grant_specs.map(([key, value]) => ({ key, value: value * terms.quantity })),
        revision: terms.catalog_revision,
        from: start,
        until: end,
        primary: true,
        profile: terms.catalog_key,
        priority: policy.billing.contracts.plan_bundle_priority,
        periodStart: start,
        periodEnd: end,
      });
  }
  let end = event.end;
  let status = event.cancelAtEnd && event.status === 'active' ? 'cancel_scheduled' : event.status;
  let endedAt = sub.ended_at;
  let current = sub.is_current;
  const now = new Date();
  if (terminalStates.has(status)) {
    const paid = await db
      .selectFrom('billing_payments')
      .select('period_end')
      .where('subscription_id', '=', sub.id)
      .where('billing_account_id', '=', sub.billing_account_id)
      .where('receipt_kind', '=', 'payment')
      .where('status', '=', 'paid')
      .where('period_start', '<=', now)
      .where('period_end', '>', now)
      .orderBy('period_end', 'desc')
      .executeTakeFirst();
    if (paid?.period_end) {
      end = paid.period_end;
      status = 'cancel_scheduled';
    } else {
      current = false;
      endedAt = now;
      const grants = await db
        .selectFrom('account_grants')
        .select('id')
        .where('billing_account_id', '=', sub.billing_account_id)
        .where('source_ref', '=', `subscription:${sub.id}`)
        .where((eb) => eb.or([eb('period_end', 'is', null), eb('period_end', '>', now)]))
        .execute();
      await revokeBundle(db, {
        workspaceId,
        accountId: sub.billing_account_id,
        grantIds: grants.map((row) => row.id),
        key: `sub:${sub.id}:terminal:${event.version}`,
        reason: 'subscription_ended',
        actorKind: 'system',
        actorId: null,
        at: now,
      });
    }
  }
  await db
    .updateTable('billing_subscriptions')
    .set({
      status,
      is_current: current,
      ended_at: endedAt,
      current_period_start: event.start,
      current_period_end: end,
      // A committed cancellation intent survives evidence the provider has not
      // caught up with; the subscription sweep retries the provider call.
      cancel_at_period_end:
        event.cancelAtEnd || terminalStates.has(event.status) || sub.cancel_at_period_end,
      provider_state_version: event.version,
      ...(renewal
        ? {
            catalog_key: terms.catalog_key,
            catalog_revision: terms.catalog_revision,
            external_price_id: terms.price_ref,
            frozen_terms: JSON.stringify(terms),
            scheduled_change: null,
          }
        : {}),
      updated_at: now,
    })
    .where('id', '=', sub.id)
    .execute();
  const changed =
    status !== sub.status ||
    current !== sub.is_current ||
    sub.current_period_start?.getTime() !== event.start?.getTime() ||
    sub.current_period_end?.getTime() !== end?.getTime();
  if (changed)
    await db
      .updateTable('billing_accounts')
      .set({
        entitlement_lifecycle_version: sql`entitlement_lifecycle_version + 1`,
        updated_at: now,
      })
      .where('id', '=', account.id)
      .where('workspace_id', '=', workspaceId)
      .where('entitlement_lifecycle_version', '=', account.entitlement_lifecycle_version)
      .execute();
  await refreshRuntime(db, workspaceId, sub.billing_account_id, now);
}

async function settleUpgrade(
  db: Database,
  pending: Pending,
  evidence: Extract<Evidence, { kind: 'payment' }>,
  workspaceId: string,
) {
  if (!evidence.payment) return;
  const change = z
    .object({ subscription_id: z.uuid(), effective_at: z.string(), terms: frozenTermsSchema })
    .parse(pending.change_terms);
  const quote = resolvedQuoteSchema.parse(pending.quote);
  // The receipt stands whatever happens to the grant: money was collected.
  await recordPayment(
    db,
    pending,
    evidence.payment,
    quote,
    pending.tax_snapshot,
    null,
    await planName(db, change.terms.catalog_revision, pending.catalog_key),
  );
  const paidAt = evidence.payment.paidAt;
  const sub = await db
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('id', '=', change.subscription_id)
    .where('billing_account_id', '=', pending.billing_account_id)
    .forUpdate()
    .executeTakeFirst();
  const end = sub?.is_current ? sub.current_period_end : null;
  if (!sub || !end || end <= paidAt) {
    // Paid after the upgraded period ended: nothing left to grant. An operator
    // reviews the payment for a refund.
    logger.warning('billing.upgrade_paid_after_period', { activation_id: pending.id });
    return;
  }
  await issueBundle(db, {
    workspaceId,
    accountId: pending.billing_account_id,
    key: `activation:${pending.id}`,
    sourceKind: 'plan',
    sourceRef: `activation:${pending.id}`,
    specs: change.terms.grant_specs.map(([key, value]) => ({ key, value })),
    revision: change.terms.catalog_revision,
    from: paidAt,
    until: end,
    primary: true,
    profile: pending.catalog_key,
    priority: policy.billing.contracts.upgrade_bundle_priority,
    periodStart: paidAt,
    periodEnd: end,
  });
  const inFlight =
    sub.scheduled_change &&
    scheduledSchema.parse(sub.scheduled_change).state !== 'provider_rejected';
  if (inFlight || sub.cancel_at_period_end) return;
  await db
    .updateTable('billing_subscriptions')
    .set({
      scheduled_change: JSON.stringify({
        direction: 'upgrade',
        state: 'requested',
        catalog_key: pending.catalog_key,
        effective_at: end.toISOString(),
        source: pending.id,
        terms: change.terms,
      }),
      // The next subscription sweep makes the provider call promptly.
      reconciliation_next_at: new Date(),
      updated_at: new Date(),
    })
    .where('id', '=', sub.id)
    .execute();
}
