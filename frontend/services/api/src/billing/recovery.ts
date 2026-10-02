import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { ApiError } from '../errors.ts';
import { lockAccount } from '../entitlements/grants.ts';
import {
  configured,
  ProviderError,
  RazorpayProvider,
  type BillingProvider,
  type Evidence,
} from './razorpay.ts';
import { settlePending, settleSubscription } from './settlement.ts';
import { recordRefund } from './receipts.ts';
import { pushChange } from './purchases.ts';
import { webhookSummary } from './webhooks.ts';
import { getLogger } from '../logging.ts';

const logger = getLogger('api.billing');

/** Renew only an unexpired claim; a delayed worker can never revive a lost lease. */
function maintainLease(seconds: number, renew: () => Promise<boolean>) {
  let active: Promise<void> | null = null;
  const timer = setInterval(
    () => {
      if (active) return;
      active = renew()
        .then(
          (owned) => {
            if (!owned) clearInterval(timer);
          },
          () => {
            clearInterval(timer);
          },
        )
        .finally(() => {
          active = null;
        });
    },
    Math.max(100, Math.min(30_000, (seconds * 1000) / 3)),
  );
  timer.unref();
  return async () => {
    clearInterval(timer);
    await active;
  };
}

async function lockOwner(db: Database, accountId: string) {
  const { workspace_id } = await db
    .selectFrom('billing_accounts')
    .select('workspace_id')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
  await lockAccount(db, workspace_id, accountId);
  return workspace_id;
}

async function applyReference(
  db: Database,
  mode: string,
  reference: string,
  evidence: Evidence,
  authority: string,
) {
  const pending = await db
    .selectFrom('pending_activations')
    .selectAll()
    .where('provider', '=', 'razorpay')
    .where('provider_mode', '=', mode)
    .where('external_reference', '=', reference)
    .executeTakeFirst();
  if (!pending) return false;
  const workspace = await lockOwner(db, pending.billing_account_id);
  if (pending.status === 'pending') await settlePending(db, pending.id, mode, evidence, authority);
  else if (pending.status === 'activated' && evidence.kind === 'base') {
    const sub = await db
      .selectFrom('billing_subscriptions')
      .selectAll()
      .where('billing_account_id', '=', pending.billing_account_id)
      .where('provider', '=', 'razorpay')
      .where('provider_mode', '=', mode)
      .where('external_subscription_id', '=', reference)
      .executeTakeFirst();
    if (sub) await settleSubscription(db, sub, evidence.subscription, pending, workspace);
  } else if (pending.status !== 'activated') throw new ApiError(409, 'payment_for_closed_intent');
  return true;
}

/** Leases the next due pending intent, counting the attempt, or null. */
function claimPending(
  db: Database,
  config: ServiceConfig,
  provider: BillingProvider,
  seen: string[],
  now: Date,
) {
  return db.transaction().execute(async (trx) => {
    let query = trx
      .selectFrom('pending_activations')
      .selectAll()
      .where('provider', '=', 'razorpay')
      .where('provider_mode', '=', provider.mode)
      .where('status', '=', 'pending')
      .where((eb) =>
        eb.or([eb('reconciliation_next_at', 'is', null), eb('reconciliation_next_at', '<=', now)]),
      )
      .where((eb) =>
        eb.or([
          eb('reconciliation_lease_expires_at', 'is', null),
          eb('reconciliation_lease_expires_at', '<=', now),
        ]),
      )
      .where((eb) =>
        eb.or([
          eb('created_at', '<=', new Date(now.getTime() - config.billing.staleSeconds * 1000)),
          eb('reconciliation_next_at', '<=', now),
        ]),
      )
      // Past the abandon window an exhausted row still gets its final probe,
      // so an unpaid checkout terminalizes instead of blocking new purchases.
      .where((eb) =>
        eb.or([
          eb('reconciliation_attempts', '<', config.billing.attempts),
          eb('created_at', '<=', new Date(now.getTime() - config.billing.abandonSeconds * 1000)),
        ]),
      )
      .orderBy('created_at')
      .forUpdate()
      .skipLocked()
      .limit(1);
    if (seen.length) query = query.where('id', 'not in', seen);
    const row = await query.executeTakeFirst();
    if (!row) return null;
    return trx
      .updateTable('pending_activations')
      .set({
        reconciliation_lease_token: randomUUID(),
        reconciliation_lease_expires_at: new Date(
          now.getTime() + config.billing.leaseSeconds * 1000,
        ),
        reconciliation_attempts: row.reconciliation_attempts + 1,
        reconciliation_next_at: new Date(
          now.getTime() +
            config.billing.backoffSeconds * 1000 * 2 ** Math.min(row.reconciliation_attempts, 10),
        ),
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });
}

/** Cancels an abandoned subscription checkout; false when the provider kept it. */
async function cancelAbandoned(provider: BillingProvider, reference: string) {
  try {
    const cancelled = await provider.cancel(reference, false);
    return cancelled.id === reference && ['cancelled', 'expired'].includes(cancelled.status);
  } catch (error) {
    // A definite refusal (e.g. already cancelled) is final; uncertainty retries.
    if (!(error instanceof ProviderError) || error.uncertain) throw error;
    return true;
  }
}

/** Claims one row at a time so a batch never expires while waiting for earlier I/O. */
async function pendingProbe(
  db: Database,
  config: ServiceConfig,
  provider: BillingProvider,
  seen: string[],
) {
  const now = new Date();
  const pending = await claimPending(db, config, provider, seen, now);
  if (!pending) return null;
  const stopLease = maintainLease(config.billing.leaseSeconds, async () => {
    const result = await db
      .updateTable('pending_activations')
      .set({
        reconciliation_lease_expires_at: new Date(Date.now() + config.billing.leaseSeconds * 1000),
      })
      .where('id', '=', pending.id)
      .where('status', '=', 'pending')
      .where('reconciliation_lease_token', '=', pending.reconciliation_lease_token)
      .where('reconciliation_lease_expires_at', '>', new Date())
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  });
  let evidence: Evidence | null = null;
  let reference = pending.external_reference;
  try {
    reference ??= await provider.recover(pending);
    if (reference)
      evidence = await provider.evidence(reference, pending.activation_kind === 'base');
    const unpaid =
      !evidence || (evidence.kind === 'base' ? !evidence.subscription.payment : !evidence.payment);
    const abandoned =
      unpaid &&
      pending.created_at.getTime() <= now.getTime() - config.billing.abandonSeconds * 1000;
    if (
      abandoned &&
      reference &&
      pending.activation_kind === 'base' &&
      !(await cancelAbandoned(provider, reference))
    )
      return pending.id;
    await db.transaction().execute(async (trx) => {
      await lockOwner(trx, pending.billing_account_id);
      const owned = await trx
        .selectFrom('pending_activations')
        .selectAll()
        .where('id', '=', pending.id)
        .where('status', '=', 'pending')
        .where('reconciliation_lease_token', '=', pending.reconciliation_lease_token)
        .where('reconciliation_lease_expires_at', '>', new Date())
        .forUpdate()
        .executeTakeFirst();
      if (!owned) return;
      if (reference && !owned.external_reference) {
        const notes = evidence?.kind === 'base' ? evidence.subscription.notes : evidence?.notes;
        if (
          !notes ||
          notes.citeladder_intent_id !== owned.id ||
          notes.citeladder_account_ref !== owned.billing_account_id ||
          notes.citeladder_catalog_revision !== owned.catalog_revision ||
          (evidence?.kind === 'base' && evidence.subscription.priceRef !== owned.external_price_id)
        )
          throw new ApiError(409, 'provider_reference_mismatch');
        await trx
          .updateTable('pending_activations')
          .set({ external_reference: reference })
          .where('id', '=', owned.id)
          .execute();
      }
      if (evidence) await settlePending(trx, pending.id, provider.mode, evidence, 'reconciliation');
      if (abandoned)
        await trx
          .updateTable('pending_activations')
          .set({
            status: 'abandoned',
            failed_at: now,
            failure_code: 'activation_expired',
            updated_at: now,
          })
          .where('id', '=', pending.id)
          .where('status', '=', 'pending')
          .execute();
      await trx
        .updateTable('pending_activations')
        .set({ reconciliation_lease_token: null, reconciliation_lease_expires_at: null })
        .where('id', '=', pending.id)
        .execute();
    });
  } catch (error) {
    // Uncertain reads never prove nonpayment; the row stays pending for review.
    logger.warning('billing.pending_recovery_failed', {
      activation_id: pending.id,
      exception: String(error),
    });
    await db
      .updateTable('pending_activations')
      .set({
        reconciliation_lease_token: null,
        reconciliation_lease_expires_at: null,
        failure_code: error instanceof ApiError ? 'settlement_rejected' : 'provider_unavailable',
      })
      .where('id', '=', pending.id)
      .where('reconciliation_lease_token', '=', pending.reconciliation_lease_token)
      .execute();
  } finally {
    await stopLease();
  }
  return pending.id;
}

async function webhookProbe(
  db: Database,
  config: ServiceConfig,
  provider: BillingProvider,
  seen: string[],
) {
  const now = new Date();
  const receipt = await db.transaction().execute(async (trx) => {
    let query = trx
      .selectFrom('billing_webhook_events')
      .selectAll()
      .where('provider', '=', 'razorpay')
      .where('provider_mode', '=', provider.mode)
      .where('processing_state', '=', 'pending')
      .where('attempt_count', '<', config.billing.webhookAttempts)
      .where((eb) => eb.or([eb('next_attempt_at', 'is', null), eb('next_attempt_at', '<=', now)]))
      .where((eb) => eb.or([eb('lease_expires_at', 'is', null), eb('lease_expires_at', '<=', now)]))
      .orderBy('received_at')
      .forUpdate()
      .skipLocked()
      .limit(1);
    if (seen.length) query = query.where('id', 'not in', seen);
    const row = await query.executeTakeFirst();
    if (!row) return null;
    return trx
      .updateTable('billing_webhook_events')
      .set({
        attempt_count: row.attempt_count + 1,
        lease_token: randomUUID(),
        lease_expires_at: new Date(now.getTime() + config.billing.webhookLeaseSeconds * 1000),
        next_attempt_at: new Date(
          now.getTime() +
            config.billing.backoffSeconds * 1000 * 2 ** Math.min(row.attempt_count, 10),
        ),
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });
  if (!receipt) return null;
  const stopLease = maintainLease(config.billing.webhookLeaseSeconds, async () => {
    const result = await db
      .updateTable('billing_webhook_events')
      .set({ lease_expires_at: new Date(Date.now() + config.billing.webhookLeaseSeconds * 1000) })
      .where('id', '=', receipt.id)
      .where('processing_state', '=', 'pending')
      .where('lease_token', '=', receipt.lease_token)
      .where('lease_expires_at', '>', new Date())
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  });
  try {
    const summary = webhookSummary.parse(receipt.safe_summary);
    const refund =
      receipt.event_type === 'refund.processed' ? await provider.refund(summary.reference) : null;
    const evidence = refund
      ? null
      : await provider.evidence(summary.reference, summary.reference.startsWith('sub_'));
    await db.transaction().execute(async (trx) => {
      const payment = refund
        ? await trx
            .selectFrom('billing_payments')
            .select('billing_account_id')
            .where('provider', '=', receipt.provider)
            .where('provider_mode', '=', receipt.provider_mode)
            .where('receipt_kind', '=', 'payment')
            .where('external_payment_id', '=', refund.paymentId)
            .executeTakeFirst()
        : null;
      const pending = evidence
        ? await trx
            .selectFrom('pending_activations')
            .select('billing_account_id')
            .where('provider', '=', receipt.provider)
            .where('provider_mode', '=', receipt.provider_mode)
            .where('external_reference', '=', summary.reference)
            .executeTakeFirst()
        : null;
      const accountId = payment?.billing_account_id ?? pending?.billing_account_id;
      const workspace = accountId ? await lockOwner(trx, accountId) : null;
      const owned = await trx
        .selectFrom('billing_webhook_events')
        .select('id')
        .where('id', '=', receipt.id)
        .where('processing_state', '=', 'pending')
        .where('lease_token', '=', receipt.lease_token)
        .where('lease_expires_at', '>', new Date())
        .forUpdate()
        .executeTakeFirst();
      if (!owned) return;
      if (refund && refund.status !== 'processed') return;
      if (refund && accountId && workspace)
        await recordRefund(
          trx,
          workspace,
          accountId,
          receipt.provider,
          receipt.provider_mode,
          refund,
        );
      let matched = Boolean(refund && payment);
      if (!refund && evidence)
        matched = await applyReference(trx, provider.mode, summary.reference, evidence, 'webhook');
      if (!matched) return;
      await trx
        .updateTable('billing_webhook_events')
        .set({
          processing_state: 'completed',
          result_code: 'applied',
          error_code: '',
          processed_at: new Date(),
          lease_token: null,
          lease_expires_at: null,
        })
        .where('id', '=', receipt.id)
        .execute();
    });
  } catch (error) {
    await db
      .updateTable('billing_webhook_events')
      .set({
        processing_state:
          error instanceof ApiError || receipt.attempt_count >= config.billing.webhookAttempts
            ? 'quarantined'
            : 'pending',
        error_code: error instanceof ApiError ? 'settlement_rejected' : 'provider_unavailable',
        lease_token: null,
        lease_expires_at: null,
      })
      .where('id', '=', receipt.id)
      .where('lease_token', '=', receipt.lease_token)
      .execute();
  } finally {
    await stopLease();
  }
  // An unmatched refund can precede its payment; retry boundedly, then quarantine.
  await db
    .updateTable('billing_webhook_events')
    .set({
      lease_token: null,
      lease_expires_at: null,
      ...(receipt.attempt_count >= config.billing.webhookAttempts
        ? { processing_state: 'quarantined', error_code: 'attempts_exhausted' }
        : {}),
    })
    .where('id', '=', receipt.id)
    .where('processing_state', '=', 'pending')
    .where('lease_token', '=', receipt.lease_token)
    .execute();
  return receipt.id;
}

async function subscriptionProbe(
  db: Database,
  config: ServiceConfig,
  provider: BillingProvider,
  seen: string[],
) {
  const now = new Date();
  const sub = await db.transaction().execute(async (trx) => {
    let query = trx
      .selectFrom('billing_subscriptions')
      .selectAll()
      .where('provider', '=', 'razorpay')
      .where('provider_mode', '=', provider.mode)
      .where('is_current', '=', true)
      .where((eb) =>
        eb.or([eb('reconciliation_next_at', 'is', null), eb('reconciliation_next_at', '<=', now)]),
      )
      .where((eb) =>
        eb.or([
          eb('reconciliation_lease_expires_at', 'is', null),
          eb('reconciliation_lease_expires_at', '<=', now),
        ]),
      )
      .orderBy('updated_at')
      .forUpdate()
      .skipLocked()
      .limit(1);
    if (seen.length) query = query.where('id', 'not in', seen);
    const row = await query.executeTakeFirst();
    if (!row) return null;
    return trx
      .updateTable('billing_subscriptions')
      .set({
        reconciliation_lease_token: randomUUID(),
        reconciliation_lease_expires_at: new Date(
          now.getTime() + config.billing.leaseSeconds * 1000,
        ),
        reconciliation_next_at: new Date(now.getTime() + config.billing.staleSeconds * 1000),
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });
  if (!sub) return null;
  const stopLease = maintainLease(config.billing.leaseSeconds, async () => {
    const result = await db
      .updateTable('billing_subscriptions')
      .set({
        reconciliation_lease_expires_at: new Date(Date.now() + config.billing.leaseSeconds * 1000),
      })
      .where('id', '=', sub.id)
      .where('is_current', '=', true)
      .where('reconciliation_lease_token', '=', sub.reconciliation_lease_token)
      .where('reconciliation_lease_expires_at', '>', new Date())
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  });
  try {
    await pushChange(db, sub.id, provider);
    let evidence = await provider.evidence(sub.external_subscription_id, true);
    // A durable cancellation intent survives an interrupted provider request;
    // cancel only while the provider still shows the subscription renewing.
    if (
      sub.cancel_at_period_end &&
      evidence.kind === 'base' &&
      evidence.subscription.status === 'active' &&
      !evidence.subscription.cancelAtEnd
    ) {
      await provider.cancel(sub.external_subscription_id, true);
      evidence = await provider.evidence(sub.external_subscription_id, true);
    }
    await db.transaction().execute(async (trx) => {
      await lockOwner(trx, sub.billing_account_id);
      const owned = await trx
        .selectFrom('billing_subscriptions')
        .select('id')
        .where('id', '=', sub.id)
        .where('reconciliation_lease_token', '=', sub.reconciliation_lease_token)
        .where('reconciliation_lease_expires_at', '>', new Date())
        .forUpdate()
        .executeTakeFirst();
      if (!owned) return;
      await applyReference(
        trx,
        provider.mode,
        sub.external_subscription_id,
        evidence,
        'reconciliation',
      );
      await trx
        .updateTable('billing_subscriptions')
        .set({ reconciliation_lease_token: null, reconciliation_lease_expires_at: null })
        .where('id', '=', sub.id)
        .execute();
    });
  } catch (error) {
    logger.warning('billing.subscription_recovery_failed', {
      subscription_id: sub.id,
      exception: String(error),
    });
    await db
      .updateTable('billing_subscriptions')
      .set({ reconciliation_lease_token: null, reconciliation_lease_expires_at: null })
      .where('id', '=', sub.id)
      .where('reconciliation_lease_token', '=', sub.reconciliation_lease_token)
      .execute();
  } finally {
    await stopLease();
  }
  return sub.id;
}

/** Three bounded sweeps, with persisted leases and no transaction across I/O. */
export async function recoverBilling(
  db: Database,
  config: ServiceConfig,
  supplied?: BillingProvider,
  canAdmit = () => true,
) {
  if (!supplied && !configured(config.razorpay))
    return { pending: 0, webhooks: 0, subscriptions: 0 };
  const provider = supplied ?? new RazorpayProvider(config.billing, config.razorpay);
  const counts = { pending: 0, webhooks: 0, subscriptions: 0 };
  for (const [kind, probe] of [
    ['pending', pendingProbe],
    ['webhooks', webhookProbe],
    ['subscriptions', subscriptionProbe],
  ] as const) {
    const seen: string[] = [];
    for (let i = 0; i < config.billing.batchSize; i++) {
      if (!canAdmit()) break;
      const id = await probe(db, config, provider, seen);
      if (!id) break;
      seen.push(id);
      counts[kind]++;
    }
  }
  return counts;
}
