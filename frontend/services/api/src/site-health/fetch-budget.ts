/**
 * A terminal crawl settles its page-fetch reservation on the shared
 * append-only entitlement ledger: the pages it analyzed are debited and the
 * rest released. An unmetered crawl has no reservation; a settled one has
 * nothing outstanding, so a replay writes nothing.
 */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';
import type { Database } from '../db/database.ts';
import { debitUsage, releaseUsage } from '../entitlements/ledger.ts';
import type { Crawl } from './task-fence.ts';

export async function settleCrawlFetches(db: Database, crawl: Crawl) {
  const reservation = await db
    .selectFrom('consumable_ledger')
    .select(['reservation_id', 'billing_account_id'])
    .where('workspace_id', '=', crawl.workspace_id)
    .where('site_crawl_id', '=', crawl.id)
    .where('entry_kind', '=', 'reservation')
    .executeTakeFirst();
  if (!reservation) return;
  const accountId = reservation.billing_account_id;
  await advisoryXactLock(db, policy.entitlements.capacity_lock, accountId);
  const entries = await db
    .selectFrom('consumable_ledger')
    .select(['entry_kind', 'units'])
    .where('workspace_id', '=', crawl.workspace_id)
    .where('reservation_id', '=', reservation.reservation_id)
    .execute();
  const outstanding = entries.reduce(
    (sum, row) =>
      sum +
      (row.entry_kind === 'reservation'
        ? row.units
        : row.entry_kind === 'release'
          ? -row.units
          : 0),
    0,
  );
  if (outstanding <= 0) return;
  // The succeeded analyze tasks are the authority; the crawl's counter may lag.
  const analyzed = await db
    .selectFrom('site_crawl_tasks')
    .select(sql<number>`count(*)::int`.as('count'))
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .where('task_kind', '=', 'analyze')
    .where('status', '=', 'succeeded')
    .executeTakeFirstOrThrow();
  const units = Math.min(analyzed.count, outstanding);
  const base = {
    workspaceId: crawl.workspace_id,
    accountId,
    reservationId: reservation.reservation_id,
    at: new Date(),
  };
  if (units)
    await debitUsage(db, {
      ...base,
      subjectId: crawl.id,
      attempt: 1,
      units,
      key: `site-crawl-fetches:${crawl.id}:settle:crawl`,
      dispatchKey: 'crawl',
    });
  await releaseUsage(db, { ...base, key: `site-crawl-fetches:${crawl.id}:settle:crawl:excess` });
}
