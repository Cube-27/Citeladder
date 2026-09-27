/**
 * The latest snapshot's summary with read-time freshness (`summary.py`).
 *
 * Freshness is derived, never persisted: the newest usable audit, crawl or
 * demand evidence is compared with the snapshot, and the latest refresh task
 * says whether a refresh is queued, running or delayed. Nothing is written.
 */
import { sql } from 'kysely';

import { policy } from '../config.ts';
import { emptySourceProjection } from '../analysis/opportunities/source-mix.ts';
import type { Database } from '../db/database.ts';
import { isoUtcOrNull, utcTextOf } from '../db/timestamps.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { projectSnapshot } from './refresh-compute.ts';
import { requireProject } from './reads.ts';
import {
  DASHBOARD_AUDIT_STATUSES,
  EVIDENCE_CRAWL_STATUSES,
  latestSnapshot,
  resolveAudit,
  resolveCrawl,
  type Scope,
  type SnapshotRow,
} from './sources.ts';

const o = policy.opportunity.opportunities;
const q = policy.task_queue.statuses;

/** The newest usable evidence time, and the newest demand snapshot. */
async function latestEvidence(db: Database, scope: Scope) {
  const workspace = new WorkspaceScope(scope.workspaceId);
  let audit = await resolveAudit(db, scope, { sourceId: null, statuses: DASHBOARD_AUDIT_STATUSES });
  if (audit !== null) {
    const scored = await workspace
      .selectFrom(db, 'metric_snapshots')
      .select('id')
      .where('audit_id', '=', audit.id)
      .executeTakeFirst();
    if (!scored) audit = null;
  }
  const crawl = await resolveCrawl(db, scope, {
    sourceId: null,
    statuses: EVIDENCE_CRAWL_STATUSES,
  });
  const demand = await workspace
    .selectFrom(db, 'demand_snapshots')
    .select(['id', 'source_hash', utcTextOf(sql.ref('created_at')).as('created_text')])
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  // `utcText` is fixed-width, so the text order is the time order.
  const stamps = [
    audit ? (audit.completed_text ?? audit.created_text) : null,
    crawl ? (crawl.completed_text ?? crawl.created_text) : null,
    demand?.created_text ?? null,
  ].filter((stamp): stamp is string => stamp !== null);
  const evidenceAt = stamps.length ? stamps.sort().at(-1)! : null;
  return { evidenceAt, demand: demand ?? null };
}

export function isStale(
  snapshot: SnapshotRow | null,
  evidenceAt: string | null,
  demand: { id: string; source_hash: string } | null,
): boolean {
  if (snapshot === null) return false;
  const newer = evidenceAt !== null && evidenceAt > snapshot.created_text;
  const changed =
    demand !== null &&
    (snapshot.demand_snapshot_id !== demand.id ||
      snapshot.demand_source_revision !== demand.source_hash);
  return newer || changed;
}

export function activationState(
  evidenceAt: string | null,
  snapshot: SnapshotRow | null,
  stale: boolean,
  refreshStatus: string | null,
) {
  if (evidenceAt === null) return 'waiting_for_evidence';
  if (snapshot !== null && !stale) return 'ready';
  if (refreshStatus === q.leased || refreshStatus === q.running) return 'refreshing';
  if (refreshStatus === q.retry_wait || refreshStatus === q.failed) return 'delayed';
  return 'queued';
}

/** Project the latest snapshot and derive freshness, without writing. */
export async function opportunitySummary(db: Database, scope: Scope) {
  await requireProject(db, scope);
  const snapshot = await latestSnapshot(db, scope);
  const { evidenceAt, demand } = await latestEvidence(db, scope);
  const stale = isStale(snapshot, evidenceAt, demand);
  const task = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'analytics_tasks')
    .select('status')
    .where('project_id', '=', scope.projectId)
    .where('task_kind', '=', policy.opportunity.refresh.task_kind)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  const freshness = {
    evidence_updated_at: isoUtcOrNull(evidenceAt),
    stale,
    activation_state: activationState(evidenceAt, snapshot, stale, task?.status ?? null),
  };
  if (snapshot === null) {
    return {
      computed: false,
      run_id: null,
      audit_id: null,
      site_crawl_id: null,
      demand_snapshot_id: null,
      demand_source_revision: null,
      coverage: {},
      limitations: [],
      source_mix: emptySourceProjection(),
      action_path_mix: emptySourceProjection(),
      domain_rollups: [],
      counts_by_type: {},
      counts_by_severity: {},
      total_count: 0,
      median_priority: null,
      analyzer_version: o.ANALYZER_VERSION,
      rule_version: o.RULE_VERSION,
      formula_version: o.FORMULA_VERSION,
      computed_at: null,
      ...freshness,
    };
  }
  const projected: Record<string, unknown> = projectSnapshot(snapshot);
  const computedAt = projected.created_at;
  delete projected.id;
  delete projected.created_at;
  return { computed: true, ...projected, computed_at: computedAt, ...freshness };
}
