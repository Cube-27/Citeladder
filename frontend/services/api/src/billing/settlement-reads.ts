/**
 * Read helpers settlement uses to decide what a payment paid for and whether it
 * was refunded. Nothing here writes; settlement.ts owns every settlement write.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { grantSource } from '../entitlements/grants.ts';
import { catalog } from './catalog.ts';
import type { Subscription } from './contracts.ts';
import type { Payment } from './receipts.ts';

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
export async function planName(db: Database, revision: string, key: string) {
  const frozen = await catalog(db, revision);
  return frozen.payload.plans.find((row) => row.key === key)?.name ?? key;
}

/** Whether a period plan grant came from this subscription or an activation (an upgrade). */
export function paidByPeriod(ref: string, subscriptionId: string) {
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
export async function paidPeriod(db: Database, payment: Payment) {
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
