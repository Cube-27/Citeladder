import { subscriptionChangeSchema } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { workspaceAccount } from './purchases.ts';
import { conflict } from './contracts.ts';
import { configured } from './razorpay.ts';

/**
 * When a held cancellation goes to the provider: the configured lead before
 * the period ends (B46). Razorpay cannot undo a cancellation it has received,
 * so until then the customer may resume.
 */
export function cancellationSendAt(periodEnd: Date, config: ServiceConfig) {
  return new Date(periodEnd.getTime() - config.billing.cancellationLeadSeconds * 1000);
}

/**
 * Until when a scheduled cancellation is still held and can be resumed; null
 * when none is scheduled, it was sent, or its send time has come.
 */
export function cancellationHeldUntil(
  sub: {
    cancel_at_period_end: boolean;
    cancellation_sent_at: Date | null;
    current_period_end: Date | null;
  },
  config: ServiceConfig,
  at = new Date(),
) {
  if (!sub.cancel_at_period_end || sub.cancellation_sent_at || !sub.current_period_end) return null;
  const until = cancellationSendAt(sub.current_period_end, config);
  return until > at ? until : null;
}

async function currentBase(trx: Database, workspaceId: string) {
  const account = await workspaceAccount(trx, workspaceId);
  await lockAccount(trx, workspaceId, account.id);
  const row = await trx
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('billing_account_id', '=', account.id)
    .where('is_current', '=', true)
    .where('subscription_kind', '=', 'base')
    .forUpdate()
    .executeTakeFirst();
  if (!row?.current_period_end || row.current_period_end <= new Date())
    conflict('no_current_subscription');
  return { ...row, current_period_end: row.current_period_end };
}

/**
 * Schedules cancellation at period end. Nothing is sent to the provider now:
 * the subscription sweep sends it at the lead before renewal, and the
 * customer may resume until then (B46).
 */
export async function cancelSubscription(db: Database, config: ServiceConfig, workspaceId: string) {
  const sub = await db.transaction().execute(async (trx) => {
    const row = await currentBase(trx, workspaceId);
    if (row.cancel_at_period_end) return { row, fresh: false };
    if (
      row.provider !== 'razorpay' ||
      row.provider_mode !== config.razorpay.mode ||
      !configured(config.razorpay)
    )
      conflict('checkout_unavailable');
    const now = new Date();
    const sendAt = cancellationSendAt(row.current_period_end, config);
    await trx
      .updateTable('billing_subscriptions')
      .set({
        cancel_at_period_end: true,
        cancellation_sent_at: null,
        reconciliation_next_at: sendAt > now ? sendAt : now,
        updated_at: now,
      })
      .where('id', '=', row.id)
      .execute();
    return { row, fresh: true };
  });
  return subscriptionChangeSchema.parse({
    catalog_key: sub.row.catalog_key,
    status: sub.fresh ? 'cancellation_scheduled' : 'already_scheduled',
    effective_at: sub.row.current_period_end.toISOString(),
  });
}

/** Keeps the plan renewing: possible only while the cancellation is still held (B46). */
export async function resumeSubscription(db: Database, config: ServiceConfig, workspaceId: string) {
  const sub = await db.transaction().execute(async (trx) => {
    const row = await currentBase(trx, workspaceId);
    if (!row.cancel_at_period_end) return { row, resumed: false };
    if (!cancellationHeldUntil(row, config)) conflict('cancellation_already_sent');
    await trx
      .updateTable('billing_subscriptions')
      .set({ cancel_at_period_end: false, reconciliation_next_at: null, updated_at: new Date() })
      .where('id', '=', row.id)
      .execute();
    return { row, resumed: true };
  });
  return subscriptionChangeSchema.parse({
    catalog_key: sub.row.catalog_key,
    status: sub.resumed ? 'resumed' : 'nothing_to_resume',
    effective_at: sub.row.current_period_end.toISOString(),
  });
}
