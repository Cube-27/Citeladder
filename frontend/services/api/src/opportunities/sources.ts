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
import { latestBrandRunId } from '../visibility/selection.ts';

export type Scope = { workspaceId: string; projectId: string };

export const DASHBOARD_AUDIT_STATUSES = policy.visibility.dashboard_audit_statuses;
const EVIDENCE_CRAWL_STATUSES = policy.opportunity.refresh.evidence_crawl_statuses;

const timestamps = [
  utcText(sql.ref('completed_at')).as('completed_text'),
  utcTextOf(sql.ref('created_at')).as('created_text'),
] as const;

function audits(db: Database, scope: Scope) {
  return new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'audits')
    .select(['id', 'project_id', 'configuration', ...timestamps])
    .where('project_id', '=', scope.projectId);
}

/** The project's latest terminal crawl with usable evidence, as a one-row query. */
function latestEvidenceCrawl(db: Database, scope: Scope) {
  return new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'site_crawls')
    .where('project_id', '=', scope.projectId)
    .where('status', 'in', EVIDENCE_CRAWL_STATUSES)
    .orderBy(sql`completed_at desc nulls last`)
    .orderBy('created_at', 'desc')
    .limit(1);
}

function crawls(db: Database, scope: Scope) {
  return latestEvidenceCrawl(db, scope).select([
    'id',
    'project_id',
    'status',
    'score_summary',
    'analyzed_url_count',
    'failed_url_count',
    'analyzer_version',
    'extractor_version',
    ...timestamps,
  ]);
}

export type AuditSource = NonNullable<Awaited<ReturnType<typeof resolveAudit>>>;
export type CrawlSource = NonNullable<Awaited<ReturnType<typeof resolveCrawl>>>;

/**
 * The latest dashboard-ready brand run of the project's default market, the
 * one Visibility and Overview call "latest" (`latestBrandRunId`), or null.
 */
export async function resolveAudit(db: Database, scope: Scope) {
  const id = await latestBrandRunId(db, { ...scope, marketId: null });
  if (id === null) return null;
  return (await audits(db, scope).where('id', '=', id).executeTakeFirst()) ?? null;
}

/**
 * The latest dashboard-ready Commerce run of the project's default market, or
 * null: Commerce hits read it explicitly, so a later brand run never hides them.
 */
export async function resolveCommerceAuditId(db: Database, scope: Scope): Promise<string | null> {
  const latest = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'audits')
    .select('id')
    .where('project_id', '=', scope.projectId)
    .where('audit_scope', '=', policy.audits.constants.audit_scope_commerce)
    .where('market_id', 'is', null)
    .where('status', 'in', DASHBOARD_AUDIT_STATUSES)
    .orderBy(sql`completed_at desc nulls last`)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return latest?.id ?? null;
}

/**
 * The project's newest catalog match pass, or null with none: the per-product
 * metrics read every answer's latest pass, so a new pass (a live match or a
 * backfill) is new Commerce evidence.
 */
export async function resolveCommerceMatchPassId(
  db: Database,
  scope: Scope,
): Promise<string | null> {
  const latest = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'commerce_match_passes')
    .select('id')
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return latest?.id ?? null;
}

/** The latest terminal crawl with usable evidence, or null. */
export async function resolveCrawl(db: Database, scope: Scope) {
  return (await crawls(db, scope).executeTakeFirst()) ?? null;
}

/** `resolveCrawl`'s id alone, for callers that only compare which crawl is latest. */
export async function resolveCrawlId(db: Database, scope: Scope): Promise<string | null> {
  return (await latestEvidenceCrawl(db, scope).select('id').executeTakeFirst())?.id ?? null;
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
