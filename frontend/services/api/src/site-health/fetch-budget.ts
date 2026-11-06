/**
 * A crawl's page fetches are a consumable hold: admission sizes the crawl to
 * what the plan has left and holds it; a terminal crawl settles the hold, so
 * the pages it analyzed are debited and the rest released. An unmetered crawl
 * has no hold; a settled one has nothing outstanding, so a replay writes nothing.
 */
import { sql } from 'kysely';
import { ApiError } from '../errors.ts';
import { hasDevelopmentWorkspace } from '../auth/development-access.ts';
import type { Database } from '../db/database.ts';
import {
  LedgerError,
  billingAccountId,
  hold,
  holdsOf,
  remaining,
  settle,
} from '../entitlements/ledger.ts';
import { crawlError } from './planner-policy.ts';
import type { Crawl } from './task-fence.ts';

const capability = 'site_health_page_fetches_per_period';

export const unresolvedEntitlement = () =>
  new ApiError(403, 'Site Health entitlements could not be resolved', {
    code: 'entitlement_unresolved',
    retryable: false,
  });

/**
 * Capacity stays locked through the hold and the caller's admission commit.
 * The configured development operator's workspace, a workspace without a
 * billing account and a plan without a fetch grant crawl unmetered.
 */
export async function budgetedPageLimit(
  db: Database,
  workspaceId: string,
  requested: number,
  at: Date,
) {
  if (await hasDevelopmentWorkspace(db, workspaceId)) return { limit: requested, metered: false };
  const accountId = await billingAccountId(db, workspaceId);
  if (!accountId) return { limit: requested, metered: false };
  let available: Awaited<ReturnType<typeof remaining>>;
  try {
    available = await remaining(db, { accountId, workspaceId, capability, at });
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'entitlement_unresolved')
      throw unresolvedEntitlement();
    throw error;
  }
  if (!available.grants) return { limit: requested, metered: false };
  if (available.units <= 0)
    crawlError(
      'No Site Health page fetches remain this period',
      'site_health_fetches_exhausted',
      409,
    );
  return { limit: Math.min(requested, available.units), metered: true };
}

export async function reserveCrawlFetches(db: Database, crawl: Crawl, units: number, at: Date) {
  await hold(db, {
    capability,
    subject: { kind: 'site_crawl', id: crawl.id, workspaceId: crawl.workspace_id },
    units,
    at,
  });
}

export async function settleCrawlFetches(db: Database, crawl: Crawl) {
  const subject = { kind: 'site_crawl', id: crawl.id, workspaceId: crawl.workspace_id } as const;
  const [reservationId] = await holdsOf(db, subject, capability);
  if (!reservationId) return;
  // The succeeded analyze tasks are the authority; the crawl's counter may lag.
  const analyzed = await db
    .selectFrom('site_crawl_tasks')
    .select(sql<number>`count(*)::int`.as('count'))
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .where('task_kind', '=', 'analyze')
    .where('status', '=', 'succeeded')
    .executeTakeFirstOrThrow();
  await settle(db, {
    workspaceId: crawl.workspace_id,
    reservationId,
    spent: analyzed.count,
    attempt: 1,
    dispatch: 'crawl',
    at: new Date(),
  });
}
