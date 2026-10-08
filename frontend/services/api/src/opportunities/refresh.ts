/**
 * The Opportunity refresh (`recompute.py`): read persisted evidence, detect,
 * score, and supersede the project's live set with one immutable snapshot.
 *
 * A missing source is not an error. With a prior snapshot and no resolvable
 * audit, crawl or demand snapshot, the prior snapshot is returned unchanged,
 * so an in-flight crawl never empties the live set; zero hits WITH a source
 * still supersedes. A refresh whose source identity the latest snapshot
 * already describes loads no evidence. Evidence loads outside the project
 * lock; under it the identity is resolved again, and a refresh whose sources
 * moved meanwhile writes nothing and fails for a retry over the newer state.
 * No provider or network I/O happens anywhere in the refresh.
 */
import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { record } from '../db/json.ts';
import { policy } from '../config.ts';

const o = policy.opportunity.opportunities;

import {
  detectSiteIssueOpportunities,
  detectBrandAbsentHighValuePrompt,
  detectOwnedPageNotCited,
} from '../analysis/opportunities/detectors.ts';
import type { DetectorHit } from '../analysis/opportunities/evidence.ts';
import { buildSourceProjection } from '../analysis/opportunities/source-mix.ts';
import type { Database } from '../db/database.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { notFound } from '../errors.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { taskProject, type Executor } from '../workers/executor.ts';
import { syncActions } from './action-sync.ts';
import { earnedPageHits } from './earned-page-hits.ts';
import {
  availableFamilies,
  buildSnapshot,
  emptyProjection,
  newOpportunity,
  projectSnapshot,
  sameIdentity,
  scoreHits,
  snapshotIsCurrent,
  type SourceIdentity,
  stampSourceProjections,
  type NewOpportunity,
  type Scored,
} from './refresh-compute.ts';
import {
  confirmedDeclineHits,
  loadSiteEvidence,
  loadVisibilityEvidence,
} from './refresh-evidence.ts';
import { changeHits, commerceHits, demandHits } from './refresh-hits.ts';
import { internalLinkHits, internalLinkRunId } from './internal-link-hits.ts';
import {
  currentDemandSnapshot,
  DASHBOARD_AUDIT_STATUSES,
  EVIDENCE_CRAWL_STATUSES,
  latestSnapshot,
  resolveAudit,
  resolveCrawl,
  type AuditSource,
  type CrawlSource,
  type DemandSource,
  type Scope,
} from './sources.ts';

type Projections = [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>[]];
type Collected = {
  /** Evidence a load cap left out, carried onto the snapshot. */
  limitations: string[];
  audit: AuditSource | null;
  demand: DemandSource | null;
  hits: DetectorHit[];
  projections: Projections;
};
type Sources = {
  audit: AuditSource | null;
  crawl: CrawlSource | null;
  demand: DemandSource | null;
  identity: SourceIdentity;
};

const INSERT_BATCH = 500;

async function auditHits(
  db: Database,
  scope: Scope,
  audit: AuditSource,
): Promise<{
  audit: AuditSource | null;
  hits: DetectorHit[];
  projections: Projections;
  limitations: string[];
}> {
  const [visibility, metricId, limitations] = await loadVisibilityEvidence(
    db,
    scope.workspaceId,
    audit,
  );
  if (metricId === null)
    return { audit: null, hits: [], projections: emptyProjection(), limitations: [] };
  let hits = [
    ...detectBrandAbsentHighValuePrompt(visibility),
    ...detectOwnedPageNotCited(visibility),
  ];
  const gaps = [
    ...new Set(
      hits.flatMap((hit) =>
        'prompt_index' in hit.evidence ? [Number(hit.evidence.prompt_index)] : [],
      ),
    ),
  ];
  const projections = buildSourceProjection(
    visibility.analyses,
    visibility.prompt_snapshots,
    gaps,
  ) as unknown as Projections;
  stampSourceProjections(
    audit.id,
    visibility.prompt_snapshots,
    gaps,
    projections.slice(0, 2) as Record<string, unknown>[],
  );
  // Page-keyed, over the FULL eligible answer set rather than the gap prompts.
  hits.push(...(await earnedPageHits(db, scope, audit, visibility)));
  if (metricId !== null) hits = hits.map((hit) => ({ ...hit, source_metric_ids: [metricId] }));
  hits.push(...(await commerceHits(db, scope, audit.id)));
  hits.push(...(await confirmedDeclineHits(db, scope.workspaceId, audit.id)));
  return { audit, hits, projections, limitations };
}

/** The newest inspected source-page reading; earned-page hits read every reading. */
async function latestSourcePageReading(db: Database, scope: Scope) {
  const row = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'source_page_snapshots')
    .select('id')
    .where('project_id', '=', scope.projectId)
    .where('outcome', '=', policy.opportunity.refresh.source_page_outcome_inspected)
    .orderBy('fetched_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.id ?? null;
}

/** The sources a refresh would read now, without loading their evidence. */
async function resolveSources(db: Database, scope: Scope): Promise<Sources> {
  const audit = await resolveAudit(db, scope, {
    sourceId: null,
    statuses: DASHBOARD_AUDIT_STATUSES,
  });
  const crawl = await resolveCrawl(db, scope, {
    sourceId: null,
    statuses: EVIDENCE_CRAWL_STATUSES,
  });
  const demand = await currentDemandSnapshot(db, scope);
  return {
    audit,
    crawl,
    demand,
    identity: {
      audit_id: audit?.id ?? null,
      site_crawl_id: crawl?.id ?? null,
      demand_snapshot_id: demand?.id ?? null,
      demand_source_revision: demand?.source_hash ?? null,
      internal_link_run_id: crawl ? await internalLinkRunId(db, scope, crawl.id) : null,
      source_page_reading_id: await latestSourcePageReading(db, scope),
    },
  };
}

async function collectHits(db: Database, scope: Scope, sources: Sources): Promise<Collected> {
  const collected: Collected = {
    limitations: [],
    audit: sources.audit,
    demand: sources.demand,
    hits: await demandHits(db, scope, sources.demand),
    projections: emptyProjection(),
  };
  if (sources.audit !== null) {
    const found = await auditHits(db, scope, sources.audit);
    collected.audit = found.audit;
    collected.hits.push(...found.hits);
    collected.projections = found.projections;
    collected.limitations.push(...found.limitations);
  }
  if (sources.crawl !== null) {
    const site = await loadSiteEvidence(db, scope.workspaceId, sources.crawl);
    collected.hits.push(...detectSiteIssueOpportunities(site));
    if (site.truncated)
      collected.limitations.push(
        `Only the first ${o.RECOMPUTE_MAX_ISSUES} Site Health findings were ranked; later ones are not shown.`,
      );
    collected.hits.push(
      ...(await internalLinkHits(db, scope, sources.identity.internal_link_run_id)),
    );
    collected.hits.push(...(await changeHits(db, scope.workspaceId, sources.crawl)));
  }
  return collected;
}

const idsJson = (values: string[]) => JSON.stringify(values);

async function insertOpportunities(
  trx: Database,
  scope: Scope,
  rows: NewOpportunity[],
  actions: Map<string, string>,
  createdAt: string,
) {
  for (let start = 0; start < rows.length; start += INSERT_BATCH) {
    await trx
      .insertInto('opportunities')
      .values(
        rows.slice(start, start + INSERT_BATCH).map((row) => ({
          ...row,
          workspace_id: scope.workspaceId,
          project_id: scope.projectId,
          evidence: JSON.stringify(row.evidence),
          source_analysis_ids: idsJson(row.source_analysis_ids),
          source_issue_ids: idsJson(row.source_issue_ids),
          source_metric_ids: idsJson(row.source_metric_ids),
          action_id: actions.get(row.id) ?? null,
          created_at: createdAt,
          updated_at: createdAt,
        })),
      )
      .execute();
  }
}

/** Supersede the live set with `scored` and one snapshot; the projected snapshot. */
async function writeRefresh(
  trx: Database,
  scope: Scope,
  collected: Collected,
  sources: Sources,
  scored: Scored[],
) {
  const crawl = sources.crawl;
  const workspace = new WorkspaceScope(scope.workspaceId);
  const live = await workspace
    .selectFrom(trx, 'opportunities')
    .select(['id', 'rule_id', 'target_key'])
    .where('project_id', '=', scope.projectId)
    .where('superseded_at', 'is', null)
    .execute();
  const rows: NewOpportunity[] = scored.map(([hit, score]) => ({
    id: randomUUID(),
    ...newOpportunity(hit, score),
  }));
  const successors = new Map(
    rows.map((row) => [JSON.stringify([row.rule_id, row.target_key]), row.id]),
  );
  // One microsecond database time for the whole refresh, so two refreshes in
  // the same millisecond still order by created_at rather than by random id.
  const { rows: clock } = await sql<{
    now: string;
  }>`select clock_timestamp()::text as now`.execute(trx);
  const now = clock[0]!.now;
  if (live.length) {
    await trx
      .updateTable('opportunities')
      .set({ superseded_at: now, updated_at: now })
      .where(
        'id',
        'in',
        live.map((row) => row.id),
      )
      .execute();
  }
  const snapshot = {
    id: randomUUID(),
    ...buildSnapshot(
      { auditId: collected.audit?.id ?? null, crawl, demand: collected.demand },
      rows,
      scored,
      collected.projections,
    ),
  };
  await trx
    .insertInto('opportunity_snapshots')
    .values({
      ...snapshot,
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      coverage: JSON.stringify({
        ...record(snapshot.coverage),
        internal_link_run_id: sources.identity.internal_link_run_id,
        source_identity: sources.identity,
      }),
      limitations: JSON.stringify([...snapshot.limitations, ...collected.limitations]),
      source_mix: JSON.stringify(snapshot.source_mix),
      action_path_mix: JSON.stringify(snapshot.action_path_mix),
      domain_rollups: JSON.stringify(snapshot.domain_rollups),
      counts_by_type: JSON.stringify(snapshot.counts_by_type),
      counts_by_severity: JSON.stringify(snapshot.counts_by_severity),
      source_analysis_ids: idsJson(snapshot.source_analysis_ids),
      source_issue_ids: idsJson(snapshot.source_issue_ids),
      created_at: now,
    })
    .execute();
  const actions = await syncActions(
    trx,
    scope,
    rows,
    snapshot.id,
    availableFamilies({
      audit: collected.audit !== null,
      demand: collected.demand !== null,
      crawl: crawl !== null,
    }),
  );
  await insertOpportunities(trx, scope, rows, actions, now);
  const links = live.flatMap((row) => {
    const successor = successors.get(JSON.stringify([row.rule_id, row.target_key]));
    return successor ? [sql`(${row.id}::uuid, ${successor}::uuid)`] : [];
  });
  if (links.length) {
    await sql`update opportunities set superseded_by_id = link.successor, updated_at = ${now}::timestamptz
      from (values ${sql.join(links)}) as link(id, successor)
      where opportunities.id = link.id and opportunities.workspace_id = ${scope.workspaceId}`.execute(
      trx,
    );
  }
  const written = await latestSnapshot(trx, scope);
  return projectSnapshot(written!);
}

/**
 * Recompute a project's Opportunities from its latest usable sources and
 * return the snapshot that describes them. `skipIfCurrent` returns the latest
 * snapshot, without loading evidence, when it already describes these exact
 * sources and versions.
 */
export async function recomputeOpportunities(
  db: Database,
  scope: Scope,
  options: { skipIfCurrent?: boolean } = {},
) {
  const project = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'projects')
    .select('id')
    .where('id', '=', scope.projectId)
    .executeTakeFirst();
  if (!project) throw notFound('Project');
  const sources = await resolveSources(db, scope);
  const prior = await latestSnapshot(db, scope);
  if (options.skipIfCurrent && snapshotIsCurrent(prior, sources.identity))
    return projectSnapshot(prior!);
  const collected = await collectHits(db, scope, sources);
  const scored = scoreHits(collected.hits);
  return db.transaction().execute(async (trx) => {
    await acquireProjectLock(trx, scope.projectId);
    const current = await latestSnapshot(trx, scope);
    const latest = await resolveSources(trx, scope);
    // Writing a reading older than a source committed during the load would
    // supersede what that source says; the retry reads the newer state.
    if (!sameIdentity({ ...latest.identity }, sources.identity))
      throw new Error('Opportunity sources changed during the refresh; retry');
    const empty = collected.audit === null && sources.crawl === null && sources.demand === null;
    if (current !== null && empty) return projectSnapshot(current);
    if (options.skipIfCurrent && snapshotIsCurrent(current, sources.identity))
      return projectSnapshot(current!);
    return writeRefresh(trx, scope, collected, sources, scored);
  });
}

/** `opportunity_refresh`: an automatic refresh that skips when already current. */
export const refreshOpportunities: Executor = async (task, { db, checkCancelled }) => {
  const scope = { workspaceId: task.workspace_id, projectId: await taskProject(db, task) };
  await checkCancelled('opportunity refresh');
  await recomputeOpportunities(db, scope, { skipIfCurrent: true });
};
