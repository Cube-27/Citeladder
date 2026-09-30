import { subscriptionChangeSchema } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { workspaceAccount } from './purchases.ts';
import { conflict } from './contracts.ts';
import { configured, RazorpayProvider, type BillingProvider } from './razorpay.ts';

export async function cancelSubscription(
  db: Database,
  config: ServiceConfig,
  workspaceId: string,
  supplied?: BillingProvider,
) {
  const sub = await db.transaction().execute(async (trx) => {
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
    if (row.cancel_at_period_end) return { row, fresh: false };
    if (
      row.provider !== 'razorpay' ||
      row.provider_mode !== (supplied?.mode ?? config.razorpay.mode) ||
      (!supplied && !configured(config.razorpay))
    )
      conflict('checkout_unavailable');
    // Commit the cancellation intent before any network call. Recovery retries it.
    await trx
      .updateTable('billing_subscriptions')
      .set({
        cancel_at_period_end: true,
        reconciliation_next_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', row.id)
      .execute();
    return { row, fresh: true };
  });
  if (sub.fresh) {
    try {
      const event = await (
        supplied ?? new RazorpayProvider(config.billing, config.razorpay)
      ).cancel(sub.row.external_subscription_id, true);
      if (event.id !== sub.row.external_subscription_id) conflict('provider_reference_mismatch');
    } catch {
      /* The durable intent remains eligible for recovery. */
    }
  }
  return subscriptionChangeSchema.parse({
    catalog_key: sub.row.catalog_key,
    status: sub.fresh ? 'cancellation_scheduled' : 'already_scheduled',
    effective_at: sub.row.current_period_end!.toISOString(),
  });
}
