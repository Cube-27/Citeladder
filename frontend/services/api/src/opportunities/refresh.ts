/**
 * The Opportunity refresh (`recompute.py`): read persisted evidence, detect,
 * score, and supersede the project's live set with one immutable snapshot.
 *
 * A missing source is not an error. With a prior snapshot and no resolvable
 * audit, crawl or demand snapshot, the prior snapshot is returned unchanged,
 * so an in-flight crawl never empties the live set; zero hits WITH a source
 * still supersedes. Writers on one project serialize on the prompt writers'
 * project lock, and the second recomputes on the latest state. No provider
 * or network I/O happens anywhere in the refresh.
 */
import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';

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
  scoreHits,
  snapshotIsCurrent,
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
  audit: AuditSource | null;
  demand: DemandSource | null;
  hits: DetectorHit[];
  projections: Projections;
};

const INSERT_BATCH = 500;

async function auditHits(
  db: Database,
  scope: Scope,
  audit: AuditSource,
  explicit: boolean,
): Promise<{ audit: AuditSource | null; hits: DetectorHit[]; projections: Projections }> {
  const [visibility, metricId] = await loadVisibilityEvidence(db, scope.workspaceId, audit);
  if (metricId === null && !explicit)
    return { audit: null, hits: [], projections: emptyProjection() };
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
  return { audit, hits, projections };
}

async function collectHits(
  db: Database,
  scope: Scope,
  sources: { audit: AuditSource | null; crawl: CrawlSource | null; explicitAudit: boolean },
): Promise<Collected> {
  const demand = await currentDemandSnapshot(db, scope);
  const collected: Collected = {
    audit: sources.audit,
    demand,
    hits: await demandHits(db, scope, demand),
    projections: emptyProjection(),
  };
  if (sources.audit !== null) {
    const found = await auditHits(db, scope, sources.audit, sources.explicitAudit);
    collected.audit = found.audit;
    collected.hits.push(...found.hits);
    collected.projections = found.projections;
  }
  if (sources.crawl !== null) {
    const site = await loadSiteEvidence(db, scope.workspaceId, sources.crawl);
    collected.hits.push(...detectSiteIssueOpportunities(site));
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
  createdAt: Date,
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
  crawl: CrawlSource | null,
  scored: Scored[],
  skipIfCurrent: boolean,
) {
  await acquireProjectLock(trx, scope.projectId);
  const current = await latestSnapshot(trx, scope);
  const sources = {
    auditId: collected.audit?.id ?? null,
    crawlId: crawl?.id ?? null,
    demand: collected.demand,
  };
  if (skipIfCurrent && current !== null && snapshotIsCurrent(current, sources))
    return projectSnapshot(current);
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
  const supersededAt = new Date();
  if (live.length) {
    await trx
      .updateTable('opportunities')
      .set({ superseded_at: supersededAt, updated_at: supersededAt })
      .where(
        'id',
        'in',
        live.map((row) => row.id),
      )
      .execute();
  }
  const createdAt = new Date();
  const snapshot = {
    id: randomUUID(),
    ...buildSnapshot(
      { auditId: sources.auditId, crawl, demand: collected.demand },
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
      coverage: snapshot.coverage === null ? null : JSON.stringify(snapshot.coverage),
      limitations: JSON.stringify(snapshot.limitations),
      source_mix: JSON.stringify(snapshot.source_mix),
      action_path_mix: JSON.stringify(snapshot.action_path_mix),
      domain_rollups: JSON.stringify(snapshot.domain_rollups),
      counts_by_type: JSON.stringify(snapshot.counts_by_type),
      counts_by_severity: JSON.stringify(snapshot.counts_by_severity),
      source_analysis_ids: idsJson(snapshot.source_analysis_ids),
      source_issue_ids: idsJson(snapshot.source_issue_ids),
      created_at: createdAt,
    })
    .execute();
  const actions = await syncActions(
    trx,
    scope,
    rows,
    snapshot.id,
    availableFamilies({
      audit: sources.auditId !== null,
      demand: collected.demand !== null,
      crawl: crawl !== null,
    }),
  );
  await insertOpportunities(trx, scope, rows, actions, createdAt);
  const links = live.flatMap((row) => {
    const successor = successors.get(JSON.stringify([row.rule_id, row.target_key]));
    return successor ? [sql`(${row.id}::uuid, ${successor}::uuid)`] : [];
  });
  if (links.length) {
    await sql`update opportunities set superseded_by_id = link.successor, updated_at = ${new Date()}
      from (values ${sql.join(links)}) as link(id, successor)
      where opportunities.id = link.id and opportunities.workspace_id = ${scope.workspaceId}`.execute(
      trx,
    );
  }
  const written = await latestSnapshot(trx, scope);
  return projectSnapshot(written!);
}

/**
 * Recompute a project's Opportunities and return the snapshot that describes
 * them. `auditId`/`siteCrawlId` pin a source (404 when foreign); otherwise the
 * latest usable ones are read. `skipIfCurrent` returns the latest snapshot
 * when it already describes these exact sources and versions.
 */
export async function recomputeOpportunities(
  db: Database,
  scope: Scope,
  options: { auditId?: string | null; siteCrawlId?: string | null; skipIfCurrent?: boolean } = {},
) {
  return db.transaction().execute(async (trx) => {
    const project = await new WorkspaceScope(scope.workspaceId)
      .selectFrom(trx, 'projects')
      .select('id')
      .where('id', '=', scope.projectId)
      .executeTakeFirst();
    if (!project) throw notFound('Project');
    const audit = await resolveAudit(trx, scope, {
      sourceId: options.auditId ?? null,
      statuses: DASHBOARD_AUDIT_STATUSES,
    });
    const crawl = await resolveCrawl(trx, scope, {
      sourceId: options.siteCrawlId ?? null,
      statuses: EVIDENCE_CRAWL_STATUSES,
    });
    const collected = await collectHits(trx, scope, {
      audit,
      crawl,
      explicitAudit: Boolean(options.auditId),
    });
    if (collected.audit === null && crawl === null && collected.demand === null) {
      const unchanged = await latestSnapshot(trx, scope);
      if (unchanged !== null) return projectSnapshot(unchanged);
    }
    return writeRefresh(
      trx,
      scope,
      collected,
      crawl,
      scoreHits(collected.hits),
      options.skipIfCurrent ?? false,
    );
  });
}

/** `opportunity_refresh`: an automatic refresh that skips when already current. */
export const refreshOpportunities: Executor = async (task, { db, checkCancelled }) => {
  const scope = { workspaceId: task.workspace_id, projectId: await taskProject(db, task) };
  await checkCancelled('opportunity refresh');
  await recomputeOpportunities(db, scope, { skipIfCurrent: true });
};
