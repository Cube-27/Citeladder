/**
 * The persisted sources an Opportunity refresh reads, resolved the way the
 * summary judges freshness against them (`recompute._resolve_source`,
 * `_latest_snapshot` and `demand.selection.current_demand_snapshot`).
 */
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { utcText, utcTextOf } from '../db/timestamps.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { notFound } from '../errors.ts';

export type Scope = { workspaceId: string; projectId: string };

export const DASHBOARD_AUDIT_STATUSES = policy.visibility.dashboard_audit_statuses;
export const EVIDENCE_CRAWL_STATUSES = policy.opportunity.refresh.evidence_crawl_statuses;

const timestamps = [
  utcText(sql.ref('completed_at')).as('completed_text'),
  utcTextOf(sql.ref('created_at')).as('created_text'),
] as const;

type Resolved = { sourceId: string | null; statuses: readonly string[] };

function audits(db: Database, scope: Scope) {
  return new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'audits')
    .select(['id', 'project_id', 'configuration', ...timestamps])
    .where('project_id', '=', scope.projectId);
}

function crawls(db: Database, scope: Scope) {
  return new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'site_crawls')
    .select([
      'id',
      'project_id',
      'status',
      'score_summary',
      'analysis_requested_count',
      'analyzed_url_count',
      'failed_url_count',
      'analyzer_version',
      'extractor_version',
      ...timestamps,
    ])
    .where('project_id', '=', scope.projectId);
}

export type AuditSource = NonNullable<Awaited<ReturnType<typeof resolveAudit>>>;
export type CrawlSource = NonNullable<Awaited<ReturnType<typeof resolveCrawl>>>;

/** An explicit audit (404 when foreign), else the latest dashboard-ready one. */
export async function resolveAudit(db: Database, scope: Scope, resolved: Resolved) {
  if (resolved.sourceId !== null) {
    const audit = await audits(db, scope).where('id', '=', resolved.sourceId).executeTakeFirst();
    if (!audit) throw notFound('Audit');
    return audit;
  }
  const latest = await audits(db, scope)
    .where('status', 'in', resolved.statuses)
    .orderBy(sql`completed_at desc nulls last`)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return latest ?? null;
}

/** An explicit crawl (404 when foreign), else the latest terminal one. */
export async function resolveCrawl(db: Database, scope: Scope, resolved: Resolved) {
  if (resolved.sourceId !== null) {
    const crawl = await crawls(db, scope).where('id', '=', resolved.sourceId).executeTakeFirst();
    if (!crawl) throw notFound('Crawl');
    return crawl;
  }
  const latest = await crawls(db, scope)
    .where('status', 'in', resolved.statuses)
    .orderBy(sql`completed_at desc nulls last`)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return latest ?? null;
}

/** The project's most recent snapshot, or null when none was ever computed. */
export async function latestSnapshot(db: Database, scope: Scope) {
  const snapshot = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'opportunity_snapshots')
    .selectAll()
    .select(utcTextOf(sql.ref('created_at')).as('created_text'))
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return snapshot ?? null;
}

/** The demand snapshot of the most recent observed period (window-first). */
export async function currentDemandSnapshot(db: Database, scope: Scope) {
  const snapshot = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'demand_snapshots')
    .select(['id', 'source_hash', utcTextOf(sql.ref('created_at')).as('created_text')])
    .where('project_id', '=', scope.projectId)
    .orderBy('window_end', 'desc')
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return snapshot ?? null;
}

export type DemandSource = NonNullable<Awaited<ReturnType<typeof currentDemandSnapshot>>>;
