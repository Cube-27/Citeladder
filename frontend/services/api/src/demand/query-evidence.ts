/** Append-only query/page projections over bounded, latest-revision evidence. */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { isoDateText } from '../db/timestamps.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { numberOrNull } from '../traffic/accumulators.ts';
import { record } from '../db/json.ts';
import { normalizeQuery } from './classification.ts';
import { resolveOwnedPages } from './page-equivalence.ts';
import { stableHash, unique } from './projection.ts';
import { compareText } from '../text-order.ts';

const p = policy.demand;
export type DemandScope = {
  workspaceId: string;
  projectId: string;
  windowStart: string;
  windowEnd: string;
};

export function querySnapshots(db: Database, scope: DemandScope) {
  return new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'query_evidence_snapshots')
    .selectAll()
    .where('project_id', '=', scope.projectId)
    .where('window_start', '=', sql<Date>`${scope.windowStart}::date`)
    .where('window_end', '=', sql<Date>`${scope.windowEnd}::date`);
}
export function latestQuerySnapshot(db: Database, scope: DemandScope) {
  return querySnapshots(db, scope)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
}

async function sourceRows(db: Database, scope: DemandScope) {
  const identity = ['property_ref', 'provider', 'dataset', 'date', 'dimension_key'] as const;
  let query = new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'integration_metric_rows')
    .selectAll()
    .select(isoDateText(sql.ref('date')).as('day'))
    .where('project_id', '=', scope.projectId)
    .where('dataset', '=', p.query_page_dataset)
    .where('date', '>=', sql<Date>`${scope.windowStart}::date`)
    .where('date', '<=', sql<Date>`${scope.windowEnd}::date`)
    .distinctOn([...identity]);
  for (const column of identity) query = query.orderBy(column);
  const rows = await query
    .orderBy('resync_seq', 'desc')
    .orderBy('id', 'desc')
    .limit(p.QUERY_EVIDENCE_MAX_ROWS + 1)
    .execute();
  const key = (r: (typeof rows)[number]) => [r.day, r.dataset, r.dimension_key, r.id].join('\0');
  return rows.sort((a, b) => compareText(key(a), key(b)));
}

async function sourceMaterial(db: Database, scope: DemandScope) {
  const rows = await sourceRows(db, scope);
  const material = rows.flatMap((row) => {
    const parts = row.dimension_key.split(policy.traffic.dimension_key_separator);
    if (parts.length < 3) return [];
    const query = parts.slice(0, -2).join(policy.traffic.dimension_key_separator),
      page = parts.at(-2)!;
    const normalized = normalizeQuery(query);
    const metrics = record(row.metrics);
    const nonnegative = (key: string) => {
      const n = numberOrNull(metrics[key]);
      return n !== null && n >= 0 ? n : null;
    };
    const impressions = nonnegative('impressions'),
      clicks = nonnegative('clicks');
    if (!normalized || !page || impressions === null || clicks === null) return [];
    return [
      {
        source: row,
        normalized_query: normalized,
        observed_page_url: page,
        impressions: Math.trunc(impressions),
        clicks: Math.trunc(clicks),
        ctr: nonnegative('ctr'),
        position: nonnegative('position'),
      },
    ];
  });
  const artifacts = await db
    .selectFrom('integration_import_artifacts as a')
    .innerJoin('integration_property_mappings as m', (join) =>
      join
        .onRef('m.workspace_id', '=', 'a.workspace_id')
        .onRef('m.connection_id', '=', 'a.connection_id'),
    )
    .selectAll('a')
    .where('a.workspace_id', '=', scope.workspaceId)
    .where('m.project_id', '=', scope.projectId)
    .where('a.dataset', '=', p.query_page_dataset)
    .where(
      sql<boolean>`((a.query_snapshot ->> 'start_date' = ${scope.windowStart} and a.query_snapshot ->> 'end_date' = ${scope.windowEnd}) or (a.query_snapshot ->> 'startDate' = ${scope.windowStart} and a.query_snapshot ->> 'endDate' = ${scope.windowEnd}))`,
    )
    .orderBy('a.fetched_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(p.QUERY_EVIDENCE_MAX_ARTIFACTS)
    .execute();
  const matched = artifacts.filter((a) => {
    const q = record(a.query_snapshot);
    return (
      (q.start_date || q.startDate || '') === scope.windowStart &&
      (q.end_date || q.endDate || '') === scope.windowEnd
    );
  });
  const selected = material.slice(0, p.QUERY_EVIDENCE_MAX_ROWS);
  const sourceHash = stableHash({
    window: [scope.windowStart, scope.windowEnd],
    rows: selected.map((r) => [r.source.id, r.source.resync_seq]),
    zero_artifacts: matched.map((r) => [r.id, r.payload_hash]),
    analyzer_version: p.QUERY_EVIDENCE_ANALYZER_VERSION,
    resolver_version: p.PAGE_EQUIVALENCE_RESOLVER_VERSION,
  });
  return { rows, material, selected, artifacts: matched, sourceHash };
}
export async function queryEvidenceRevision(db: Database, scope: DemandScope) {
  return (await sourceMaterial(db, scope)).sourceHash.slice(0, 24);
}

export async function buildQueryEvidence(db: Database, scope: DemandScope) {
  const { rows, material, selected, artifacts, sourceHash } = await sourceMaterial(db, scope);
  const existingQuery = () =>
    querySnapshots(db, scope)
      .where('source_hash', '=', sourceHash)
      .where('analyzer_version', '=', p.QUERY_EVIDENCE_ANALYZER_VERSION);
  const existing = await existingQuery().executeTakeFirst();
  if (existing) return existing;
  const prior = await latestQuerySnapshot(db, scope);
  const resolutions = await resolveOwnedPages(
    db,
    scope.workspaceId,
    scope.projectId,
    selected.map((r) => r.observed_page_url),
  );
  const truncated = rows.length > p.QUERY_EVIDENCE_MAX_ROWS || material.length > selected.length;
  const limitations = [
    ...(truncated ? ['query_evidence_row_limit'] : []),
    ...(material.length !== rows.length ? ['malformed_source_rows_excluded'] : []),
  ];
  const snapshot = await db
    .insertInto('query_evidence_snapshots')
    .values({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      window_start: scope.windowStart,
      window_end: scope.windowEnd,
      source_hash: sourceHash,
      supersedes_snapshot_id: prior?.id ?? null,
      state: selected.length
        ? p.QUERY_EVIDENCE_STATE_AVAILABLE
        : artifacts.length && artifacts.every((r) => r.row_count === 0)
          ? p.QUERY_EVIDENCE_STATE_OBSERVED_ZERO
          : p.QUERY_EVIDENCE_STATE_UNAVAILABLE,
      source_metric_row_ids: JSON.stringify(selected.map((r) => r.source.id)),
      source_artifact_ids: JSON.stringify(
        unique([
          ...selected.map((r) => r.source.source_artifact_id),
          ...artifacts.map((r) => r.id),
        ]),
      ),
      coverage: JSON.stringify({
        source_row_count: rows.length,
        usable_row_count: material.length,
        projected_row_count: selected.length,
        row_limit: p.QUERY_EVIDENCE_MAX_ROWS,
        truncated,
      }),
      limitations: JSON.stringify(limitations),
      analyzer_version: p.QUERY_EVIDENCE_ANALYZER_VERSION,
      resolver_version: p.PAGE_EQUIVALENCE_RESOLVER_VERSION,
      created_at: new Date(),
    })
    .onConflict((c) => c.constraint('uq_query_evidence_snapshot_identity').doNothing())
    .returningAll()
    .executeTakeFirst();
  if (!snapshot) return existingQuery().executeTakeFirstOrThrow();
  const size = policy.traffic.TRAFFIC_METRIC_ROW_BATCH_SIZE;
  for (let i = 0; i < selected.length; i += size)
    await db
      .insertInto('query_evidence_rows')
      .values(
        selected.slice(i, i + size).map((item) => {
          const r = resolutions.get(item.observed_page_url)!;
          return {
            id: randomUUID(),
            snapshot_id: snapshot.id,
            workspace_id: scope.workspaceId,
            project_id: scope.projectId,
            date: item.source.day,
            normalized_query: item.normalized_query,
            observed_page_url: item.observed_page_url,
            site_url_id: r.site_url_id,
            resolved_page_url:
              r.candidates.find((c) => c.site_url_id === r.site_url_id)?.normalized_url ?? '',
            resolution_outcome: r.outcome,
            resolution_candidates: JSON.stringify(
              r.candidates.map((c) => ({
                site_url_id: c.site_url_id,
                normalized_url: c.normalized_url,
                evidence: c.evidence,
              })),
            ),
            property_ref: item.source.property_ref,
            impressions: item.impressions,
            clicks: item.clicks,
            ctr: item.ctr,
            position: item.position,
            source_metric_row_id: item.source.id,
            source_artifact_id: item.source.source_artifact_id,
            importer_version: item.source.importer_version,
            resolver_version: r.resolver_version,
            created_at: new Date(),
          };
        }),
      )
      .execute();
  return snapshot;
}
