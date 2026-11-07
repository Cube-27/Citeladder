import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { resolvedQuoteSchema } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import {
  lockAccount,
  issueBundle,
  revokeBundle,
  bumpLifecycle,
  grantSource,
  sourceRef,
} from '../entitlements/grants.ts';
import { refreshRuntime } from '../site-health/plan-runtime.ts';
import { catalog } from './catalog.ts';
import { conflict } from '../errors.ts';
import { amount, taxSnapshotSchema, type Pending, type Subscription } from './contracts.ts';
import type { Evidence, RefundEvidence, SubscriptionEvidence } from './razorpay.ts';
import { recordPayment, recordRefund, type Payment } from './receipts.ts';
import { policy } from '../config.ts';
import { getLogger } from '../logging.ts';

const logger = getLogger('api.billing');

export const frozenTermsSchema = z.object({
  catalog_key: z.string(),
  catalog_revision: z.string(),
  credential_mode: z.enum(['byok', 'funded']),
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
const terminalStates = new Set(policy.billing.contracts.terminal_subscription_statuses);
// Halted at the provider: the row stays current, so it blocks a second base
// subscription, until the sweep's cancellation is confirmed.
const UNPAID = policy.billing.contracts.subscription_unpaid;
const CANCELLED = policy.billing.contracts.subscription_cancelled;
/** A payment whose refunds total its amount no longer pays for its period (B52). */
const refundedInFull = sql<boolean>`coalesce((
  select sum(r.amount_minor) from billing_payments r
  where r.parent_payment_id = billing_payments.id and r.receipt_kind = 'refund'
), 0) >= billing_payments.amount_minor`;

/**
 * Whether a payment for this subscription period was refunded in full: the
 * period's own payment (B52) or an upgrade bought in the period (B70).
 */
export async function periodRefunded(
  db: Database,
  sub: Pick<Subscription, 'id' | 'billing_account_id'>,
  start: Date | null,
  end: Date | null,
) {
  if (!start || !end) return false;
  const row = await db
    .selectFrom('billing_payments')
    .select('id')
    .where('billing_account_id', '=', sub.billing_account_id)
    .where('receipt_kind', '=', 'payment')
    .where((eb) =>
      eb.or([
        eb.and([
          eb('subscription_id', '=', sub.id),
          eb('period_start', '=', start),
          eb('period_end', '=', end),
        ]),
        eb.and([
          eb('subscription_id', 'is', null),
          eb(
            'pending_activation_id',
            'in',
            eb
              .selectFrom('pending_activations')
              .select('id')
              .where('billing_account_id', '=', sub.billing_account_id)
              .where('activation_kind', '=', 'upgrade')
              .where(sql<string>`change_terms->>'subscription_id'`, '=', sub.id),
          ),
          eb('paid_at', '>=', start),
          eb('paid_at', '<', end),
        ]),
      ]),
    )
    .where(refundedInFull)
    .executeTakeFirst();
  return Boolean(row);
}

/** The frozen revision's display name for a plan, as receipts print it. */
async function planName(db: Database, revision: string, key: string) {
  const frozen = await catalog(db, revision);
  return frozen.payload.plans.find((row) => row.key === key)?.name ?? key;
}

/** Takes the account lock through its owning workspace; returns that workspace. */
export async function lockOwner(db: Database, accountId: string) {
  const { workspace_id: workspaceId } = await db
    .selectFrom('billing_accounts')
    .select('workspace_id')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
  await lockAccount(db, workspaceId, accountId);
  return workspaceId;
}

type Frozen = Awaited<ReturnType<typeof catalog>>;
type Quote = z.infer<typeof resolvedQuoteSchema>;
type PaymentRecord = Extract<Evidence, { kind: 'payment' }>;

/** The provider record must be this intent's, in its mode and catalog revision. */
function verifiedReference(pending: Pending, mode: string, evidence: Evidence) {
  if (pending.provider !== 'razorpay' || pending.provider_mode !== mode)
    conflict('provider_identity_mismatch');
  const ref = evidence.kind === 'base' ? evidence.subscription.id : evidence.reference;
  const notes = evidence.kind === 'base' ? evidence.subscription.notes : evidence.notes;
  const differs = (value: string | undefined, expected: string) =>
    Boolean(value) && value !== expected;
  if (
    pending.external_reference !== ref ||
    differs(notes.citeladder_intent_id, pending.id) ||
    differs(notes.citeladder_account_ref, pending.billing_account_id) ||
    differs(notes.citeladder_catalog_revision, pending.catalog_revision)
  )
    conflict('provider_reference_mismatch');
  return ref;
}

/** Only a subscription can fail at the provider; an unpaid order ends by abandonment. */
function providerFailed(evidence: Evidence) {
  return (
    evidence.kind === 'base' &&
    !evidence.subscription.payment &&
    terminalStates.has(evidence.subscription.status)
  );
}

/** Creates the base subscription and settles its first paid period; false while unpaid. */
async function settleBase(
  db: Database,
  pending: Pending,
  evidence: Extract<Evidence, { kind: 'base' }>,
  {
    quote,
    frozen,
    ref,
    workspaceId,
  }: { quote: Quote; frozen: Frozen; ref: string; workspaceId: string },
) {
  if (
    pending.activation_kind !== 'base' ||
    evidence.subscription.priceRef !== pending.external_price_id
  )
    conflict('price_ref_mismatch');
  // A checkout paid as the abandon sweep cancels it is still the customer's
  // paid period: it settles and runs to the paid end (B71).
  const { status } = evidence.subscription;
  if (!evidence.subscription.payment || !(grantedStates.has(status) || terminalStates.has(status)))
    return false;
  const plan = frozen.payload.plans.find((row) => row.key === pending.catalog_key);
  if (!plan?.grants.length) conflict('grant_bundle_missing');
  const terms = frozenTermsSchema.parse({
    catalog_key: pending.catalog_key,
    catalog_revision: pending.catalog_revision,
    credential_mode: pending.credential_mode,
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
  return true;
}

/** Add-on or top-up: a fixed-expiry supplement within a live base period. */
async function settlePack(
  db: Database,
  pending: Pending,
  payment: NonNullable<PaymentRecord['payment']>,
  { quote, frozen, workspaceId }: { quote: Quote; frozen: Frozen; workspaceId: string },
) {
  const base = await db
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('billing_account_id', '=', pending.billing_account_id)
    .where('is_current', '=', true)
    .where('subscription_kind', '=', 'base')
    .executeTakeFirst();
  const item = [...frozen.payload.addons, ...frozen.payload.topups].find(
    (row) => row.key === pending.catalog_key,
  );
  const specs = item?.modes.byok?.grants;
  if (!item || !specs?.length) conflict('grant_bundle_missing');
  // The receipt stands whatever happens to the grant: money was collected.
  await recordPayment(db, pending, payment, quote, pending.tax_snapshot, null, item.name);
  if (
    !base?.current_period_start ||
    !base.current_period_end ||
    payment.paidAt < base.current_period_start ||
    payment.paidAt >= base.current_period_end ||
    !policy.billing.contracts.live_subscription_statuses.includes(base.status)
  ) {
    // Paid (late, after abandonment) while no base period covered it: nothing
    // to supplement. An operator reviews the payment for a refund.
    logger.warning('billing.pack_paid_without_base', { activation_id: pending.id });
    return;
  }
  await issueBundle(db, {
    workspaceId,
    accountId: pending.billing_account_id,
    key: `activation:${pending.id}`,
    sourceKind: pending.activation_kind,
    source: { kind: 'activation', activationId: pending.id },
    specs: specs.map((row) => ({ key: row.key, value: row.value * pending.quantity })),
    revision: pending.catalog_revision,
    from: payment.paidAt,
    until: new Date(payment.paidAt.getTime() + item.expiry_days * 86_400_000),
    primary: false,
    profile: '',
    priority: 0,
  });
}

/** Settles an upgrade or pack payment; false while the evidence carries no payment yet. */
async function settleOneOff(
  db: Database,
  pending: Pending,
  evidence: Extract<Evidence, { kind: 'payment' }>,
  context: { quote: Quote; frozen: Frozen; workspaceId: string },
) {
  if (pending.activation_kind === 'base') conflict('provider_record_kind_mismatch');
  if (!evidence.payment) return false;
  if (pending.activation_kind === 'upgrade')
    await settleUpgrade(db, pending, evidence, context.workspaceId);
  else await settlePack(db, pending, evidence.payment, context);
  return true;
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
  const workspaceId = await lockOwner(db, initial.billing_account_id);
  const pending = await db
    .selectFrom('pending_activations')
    .selectAll()
    .where('id', '=', pendingId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const ref = verifiedReference(pending, mode, evidence);
  // An order captured after its checkout was abandoned still settles: the
  // customer paid. An abandoned subscription was cancelled at the provider.
  const late = pending.status === 'abandoned' && evidence.kind === 'payment' && evidence.payment;
  if (pending.status !== 'pending' && !late) return;
  if (providerFailed(evidence)) {
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
  const settled =
    evidence.kind === 'base'
      ? await settleBase(db, pending, evidence, { quote, frozen, ref, workspaceId })
      : await settleOneOff(db, pending, evidence, { quote, frozen, workspaceId });
  if (!settled) return;
  await db
    .updateTable('pending_activations')
    .set({
      status: 'activated',
      activated_at: new Date(),
      failed_at: null,
      failure_code: null,
      settled_by: authority,
      settled_authority_id: ref,
      updated_at: new Date(),
    })
    .where('id', '=', pending.id)
    .execute();
}

/** Whether a full refund cancelled this subscription, pending the provider's confirmation (B52). */
export function refundCancelled(sub: Pick<Subscription, 'is_current' | 'status'>) {
  return sub.is_current && sub.status === CANCELLED;
}

/**
 * Records one paid period's receipt and its plan bundle. A period paid while
 * the provider already reports the subscription ended still runs to its paid
 * end (B71); one charged after a full refund cancelled the subscription grants
 * nothing and is flagged for an operator refund (B71).
 */
async function settlePeriod(
  db: Database,
  sub: Subscription,
  event: SubscriptionEvidence,
  payment: NonNullable<SubscriptionEvidence['payment']>,
  {
    pending,
    terms,
    workspaceId,
  }: { pending: Pending; terms: z.infer<typeof frozenTermsSchema>; workspaceId: string },
) {
  if (
    event.notes.citeladder_intent_id !== pending.id ||
    event.notes.citeladder_account_ref !== pending.billing_account_id ||
    event.notes.citeladder_catalog_revision !== pending.catalog_revision ||
    !payment.invoiceId
  )
    conflict('subscription_payment_mismatch');
  const start = event.start,
    end = event.end;
  if (
    !start ||
    !end ||
    start >= end ||
    payment.periodStart?.getTime() !== start.getTime() ||
    payment.periodEnd?.getTime() !== end.getTime()
  )
    conflict('subscription_period_bounds_invalid');
  const overlap = await db
    .selectFrom('account_grants')
    .select('id')
    .where('billing_account_id', '=', sub.billing_account_id)
    .where('source_ref', '=', sourceRef({ kind: 'subscription', subscriptionId: sub.id }))
    .where('period_start', '<', end)
    .where('period_end', '>', start)
    .where((eb) => eb.or([eb('period_start', '!=', start), eb('period_end', '!=', end)]))
    .executeTakeFirst();
  if (overlap) conflict('subscription_period_overlap');
  await recordPayment(
    db,
    { ...pending, catalog_key: terms.catalog_key, catalog_revision: terms.catalog_revision },
    payment,
    terms.quote,
    terms.tax_snapshot,
    sub.id,
    await planName(db, terms.catalog_revision, terms.catalog_key),
  );
  if (refundCancelled(sub)) {
    if (!(await periodRefunded(db, sub, start, end)))
      logger.warning('billing.renewal_paid_after_cancellation', {
        subscription_id: sub.id,
        period_start: start.toISOString(),
      });
    return;
  }
  if (grantedStates.has(event.status) || terminalStates.has(event.status))
    await issueBundle(db, {
      workspaceId,
      accountId: sub.billing_account_id,
      key: `sub:${sub.id}:${start.toISOString()}:${end.toISOString()}:base`,
      sourceKind: 'plan',
      source: { kind: 'subscription', subscriptionId: sub.id },
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

/**
 * A terminal provider state keeps a verified paid period (its end is returned)
 * unless a payment for it was refunded in full (B52, B70); otherwise the
 * subscription's remaining grants are revoked now.
 */
async function endTerminal(
  db: Database,
  sub: Subscription,
  version: number,
  workspaceId: string,
  now: Date,
) {
  const paid = await db
    .selectFrom('billing_payments')
    .select(['period_start', 'period_end'])
    .where('subscription_id', '=', sub.id)
    .where('billing_account_id', '=', sub.billing_account_id)
    .where('receipt_kind', '=', 'payment')
    .where('status', '=', 'paid')
    .where('period_start', '<=', now)
    .where('period_end', '>', now)
    .orderBy('period_end', 'desc')
    .executeTakeFirst();
  // A refund-cancelled subscription keeps no later period it was charged for (B71).
  if (
    paid?.period_end &&
    !refundCancelled(sub) &&
    !(await periodRefunded(db, sub, paid.period_start, paid.period_end))
  )
    return paid.period_end;
  const grants = await db
    .selectFrom('account_grants')
    .select('id')
    .where('billing_account_id', '=', sub.billing_account_id)
    .where('source_ref', '=', sourceRef({ kind: 'subscription', subscriptionId: sub.id }))
    .where((eb) => eb.or([eb('period_end', 'is', null), eb('period_end', '>', now)]))
    // A grant already revoked by then (a full refund, B52) is not revoked twice.
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('grant_revocations')
            .select('grant_revocations.id')
            .whereRef('grant_revocations.grant_id', '=', 'account_grants.id')
            .where('grant_revocations.effective_from', '<=', now),
        ),
      ),
    )
    .execute();
  await revokeBundle(db, {
    workspaceId,
    accountId: sub.billing_account_id,
    grantIds: grants.map((row) => row.id),
    key: `sub:${sub.id}:terminal:${version}`,
    reason: 'subscription_ended',
    actorKind: 'system',
    actorId: null,
    at: now,
  });
  return null;
}

/**
 * A scheduled change takes effect when the provider reports its first period at
 * the new price; a change the provider refused lapses once that period starts.
 */
function effectiveTerms(sub: Subscription, event: SubscriptionEvidence) {
  const terms = frozenTermsSchema.parse(sub.frozen_terms);
  const change = sub.scheduled_change ? scheduledSchema.parse(sub.scheduled_change) : null;
  const due = Boolean(change && event.start && event.start >= new Date(change.effective_at));
  if (change && due && event.priceRef === change.terms.price_ref)
    return { terms: change.terms, renewal: true, lapsed: false };
  return { terms, renewal: false, lapsed: due && change?.state === 'provider_rejected' };
}

/** The subscription's state after this evidence; a paid terminal period runs to its end. */
async function periodOutcome(
  db: Database,
  sub: Subscription,
  event: SubscriptionEvidence,
  workspaceId: string,
  now: Date,
) {
  const status = event.cancelAtEnd && event.status === 'active' ? 'cancel_scheduled' : event.status;
  const settled = { status, end: event.end, endedAt: sub.ended_at, current: sub.is_current };
  if (!terminalStates.has(status))
    // A fully refunded current period stays cancelled until the provider
    // confirms (B52), even if a renewal was charged meanwhile (B71).
    return refundCancelled(sub) ||
      (sub.is_current && (await periodRefunded(db, sub, event.start, event.end)))
      ? { ...settled, status: CANCELLED }
      : settled;
  const paidEnd = await endTerminal(db, sub, event.version, workspaceId, now);
  return paidEnd
    ? { ...settled, end: paidEnd, status: 'cancel_scheduled' }
    : { ...settled, current: false, endedAt: now };
}

/** What the evidence asks of later sweeps and of a held cancellation. */
function followUps(sub: Subscription, event: SubscriptionEvidence, status: string, now: Date) {
  return {
    // A cancellation the provider holds can no longer be resumed here (B46).
    ...(event.cancelAtEnd && !sub.cancellation_sent_at ? { cancellation_sent_at: now } : {}),
    // The next subscription sweep cancels a halted or refunded subscription
    // promptly; one the provider already ends at its cycle waits its cadence.
    ...(status === UNPAID || (status === CANCELLED && !event.cancelAtEnd)
      ? { reconciliation_next_at: now }
      : {}),
  };
}

/** The renewed period takes the scheduled change's terms. */
function renewedTerms(terms: { catalog_key: string; catalog_revision: string; price_ref: string }) {
  return {
    catalog_key: terms.catalog_key,
    catalog_revision: terms.catalog_revision,
    external_price_id: terms.price_ref,
    frozen_terms: JSON.stringify(terms),
    scheduled_change: null,
  };
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
  const { terms, renewal, lapsed } = effectiveTerms(sub, event);
  if (event.priceRef !== terms.price_ref) conflict('price_ref_mismatch');
  if (event.payment)
    await settlePeriod(db, sub, event, event.payment, { pending, terms, workspaceId });
  const now = new Date();
  const { status, end, endedAt, current } = await periodOutcome(db, sub, event, workspaceId, now);
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
      ...followUps(sub, event, status, now),
      provider_state_version: event.version,
      ...(lapsed ? { scheduled_change: null } : {}),
      ...(renewal ? renewedTerms(terms) : {}),
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
    await bumpLifecycle(db, {
      workspaceId,
      accountId: account.id,
      at: now,
      expectedVersion: account.entitlement_lifecycle_version,
    });
  else await refreshRuntime(db, workspaceId, sub.billing_account_id, now);
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
    source: { kind: 'activation', activationId: pending.id },
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

/**
 * Settles a processed provider refund: records its receipt and credit note,
 * and when this refund completes a full refund of the payment, applies B52.
 * A replayed refund records nothing and applies nothing again.
 */
export async function settleRefund(
  db: Database,
  request: {
    workspaceId: string;
    accountId: string;
    provider: string;
    mode: string;
    refund: RefundEvidence;
  },
) {
  const { workspaceId, accountId, provider, mode, refund } = request;
  const recorded = await recordRefund(db, workspaceId, accountId, provider, mode, refund);
  if (recorded?.full) await endRefundedPayment(db, workspaceId, recorded.payment, refund);
}

/** Whether a period plan grant came from this subscription or an activation (an upgrade). */
function paidByPeriod(ref: string, subscriptionId: string) {
  const source = grantSource(ref);
  return (
    source?.kind === 'activation' ||
    (source?.kind === 'subscription' && source.subscriptionId === subscriptionId)
  );
}

/**
 * The base subscription period a payment paid for: a period payment's own, or
 * for an upgrade the current period of the subscription it upgraded, when it
 * was bought in that period (B70). Null for anything else.
 */
async function paidPeriod(db: Database, payment: Payment) {
  const { subscription_id: subscriptionId, period_start: start, period_end: end } = payment;
  if (subscriptionId && start && end) return { subscriptionId, start, end };
  if (!payment.pending_activation_id || !payment.paid_at) return null;
  const upgrade = await db
    .selectFrom('pending_activations')
    .select('change_terms')
    .where('id', '=', payment.pending_activation_id)
    .where('billing_account_id', '=', payment.billing_account_id)
    .where('activation_kind', '=', 'upgrade')
    .executeTakeFirst();
  if (!upgrade) return null;
  const { subscription_id: upgraded } = z
    .object({ subscription_id: z.uuid() })
    .parse(upgrade.change_terms);
  const sub = await db
    .selectFrom('billing_subscriptions')
    .select(['current_period_start', 'current_period_end'])
    .where('id', '=', upgraded)
    .where('billing_account_id', '=', payment.billing_account_id)
    .where('is_current', '=', true)
    .where('current_period_start', '<=', payment.paid_at)
    .where('current_period_end', '>', payment.paid_at)
    .executeTakeFirst();
  return sub?.current_period_start && sub.current_period_end
    ? { subscriptionId: upgraded, start: sub.current_period_start, end: sub.current_period_end }
    : null;
}

/**
 * A payment refunded in full grants nothing more. When it paid for the base
 * subscription's current period, its own payment (B52) or an upgrade bought in
 * it (B70), the subscription is cancelled now: the period's plan grants, an
 * upgrade's included, are revoked in this transaction, a scheduled plan change
 * ends with it, and the row stays current until the subscription sweep's
 * provider cancellation is confirmed, so the provider cannot charge unseen.
 */
async function endRefundedPayment(
  db: Database,
  workspaceId: string,
  payment: Payment,
  refund: RefundEvidence,
) {
  const accountId = payment.billing_account_id;
  const period = await paidPeriod(db, payment);
  const query = db
    .selectFrom('account_grants')
    .select(['id', 'source_ref'])
    .where('billing_account_id', '=', accountId);
  const grants = period
    ? (
        await query
          .where('source_kind', '=', 'plan')
          .where('period_start', '>=', period.start)
          .where('period_end', '=', period.end)
          .execute()
      ).filter((row) => paidByPeriod(row.source_ref, period.subscriptionId))
    : await query
        .where(
          'source_ref',
          '=',
          sourceRef({ kind: 'activation', activationId: payment.pending_activation_id ?? '' }),
        )
        .execute();
  await revokeBundle(db, {
    workspaceId,
    accountId,
    grantIds: grants.map((row) => row.id),
    key: `refund:${payment.id}:full`,
    reason: 'full_refund',
    actorKind: 'provider',
    actorId: null,
    at: refund.createdAt,
  });
  if (!period) return;
  const now = new Date();
  await db
    .updateTable('billing_subscriptions')
    .set({
      status: policy.billing.contracts.subscription_cancelled,
      // Nothing left to resume: the cancellation is decided, not held (B46).
      cancel_at_period_end: true,
      cancellation_sent_at: now,
      reconciliation_next_at: now,
      // The subscription never renews, so no scheduled plan change survives it (B70).
      scheduled_change: null,
      updated_at: now,
    })
    .where('id', '=', period.subscriptionId)
    .where('billing_account_id', '=', accountId)
    .where('is_current', '=', true)
    .where('current_period_start', '=', period.start)
    .where('current_period_end', '=', period.end)
    .execute();
}
