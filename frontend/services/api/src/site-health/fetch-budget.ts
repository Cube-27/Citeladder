/**
 * A terminal crawl settles its page-fetch reservation on the shared
 * append-only entitlement ledger: the pages it analyzed are debited and the
 * rest released. An unmetered crawl has no reservation; a settled one has
 * nothing outstanding, so a replay writes nothing.
 */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';
import type { Database } from '../db/database.ts';
import { debitUsage, ledgerBalances, releaseUsage, reserveUsage } from '../entitlements/ledger.ts';
import { accountState } from '../entitlements/state.ts';
import { crawlError } from './planner-policy.ts';
import type { Crawl } from './task-fence.ts';

const capability = 'site_health_page_fetches_per_period';

export const unresolvedEntitlement = () =>
  new ApiError(403, 'Site Health entitlements could not be resolved', {
    code: 'entitlement_unresolved',
    retryable: false,
  });

/** Capacity stays locked through reservation and the caller's admission commit. */
export async function budgetedPageLimit(
  db: Database,
  workspaceId: string,
  requested: number,
  at: Date,
) {
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (!account) return { limit: requested, accountId: null };
  await advisoryXactLock(db, policy.entitlements.capacity_lock, account.id);
  const state = await accountState(db, workspaceId, account.id, at);
  if (state.error) throw unresolvedEntitlement();
  const grants = state.selected.filter((grant) => grant.key === capability);
  if (!grants.length) return { limit: requested, accountId: null };
  const balances = await ledgerBalances(db, account.id);
  const available = grants.reduce((sum, grant) => {
    const balance = balances.get(grant.id);
    return sum + Math.max(0, grant.value - (balance?.reserved ?? 0) - (balance?.consumed ?? 0));
  }, 0);
  if (available <= 0)
    crawlError(
      'No Site Health page fetches remain this period',
      'site_health_fetches_exhausted',
      409,
    );
  return { limit: Math.min(requested, available), accountId: account.id };
}

export async function reserveCrawlFetches(
  db: Database,
  crawl: Crawl,
  accountId: string,
  units: number,
  at: Date,
) {
  await reserveUsage(db, {
    accountId,
    capability,
    subject: { kind: 'site_crawl', id: crawl.id, workspaceId: crawl.workspace_id },
    units,
    key: `site-crawl-fetches:${crawl.id}`,
    at,
  });
}

/** Units a ledger row still holds: reservations add, releases free, debits are consumption. */
function heldUnits(row: { entry_kind: string; units: number }) {
  if (row.entry_kind === 'reservation') return row.units;
  return row.entry_kind === 'release' ? -row.units : 0;
}

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
  const outstanding = entries.reduce((sum, row) => sum + heldUnits(row), 0);
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
