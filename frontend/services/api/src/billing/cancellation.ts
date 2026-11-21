import { subscriptionChangeSchema } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { workspaceAccount } from './purchases.ts';
import { refuse } from './refusals.ts';
import { configured } from './razorpay.ts';

export function cancellationSendAt(periodEnd: Date, config: ServiceConfig) {
  return new Date(periodEnd.getTime() - config.billing.cancellationLeadSeconds * 1000);
}

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
    refuse('no_current_subscription');
  return { ...row, current_period_end: row.current_period_end };
}

export async function cancelSubscription(db: Database, config: ServiceConfig, workspaceId: string) {
  const sub = await db.transaction().execute(async (trx) => {
    const row = await currentBase(trx, workspaceId);
    if (row.cancel_at_period_end) return { row, fresh: false };
    if (
      row.provider !== 'razorpay' ||
      row.provider_mode !== config.razorpay.mode ||
      !configured(config.razorpay)
    )
      refuse('checkout_unavailable');
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

export async function resumeSubscription(db: Database, config: ServiceConfig, workspaceId: string) {
  const sub = await db.transaction().execute(async (trx) => {
    const row = await currentBase(trx, workspaceId);
    if (!row.cancel_at_period_end) return { row, resumed: false };
    if (!cancellationHeldUntil(row, config)) refuse('cancellation_already_sent');
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
