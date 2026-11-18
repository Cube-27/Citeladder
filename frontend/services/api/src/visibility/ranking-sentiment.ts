/**
 * Ranking rows with each business's net sentiment over the same selection the
 * ranking counts: the dashboard's run or pool, and each trend point's runs.
 * Derived from persisted perceptions; never classified here.
 */
import type { NetSentiment } from '@citeladder/contracts/visibility';

import type { Database } from '../db/database.ts';
import { getVisibility, type DashboardQuery, type VisibilityResponse } from './dashboard.ts';
import { entitySentiments, groupedSentiments } from './perception.ts';
import { marketOf, type RunScope } from './runs.ts';
import type { RunSelection } from './selection.ts';
import type { TrendPoint } from './trend-folding.ts';

type Entity = { name: string; is_brand: boolean; sentiment: NetSentiment };

/** Each row's sentiment; the brand row's name is the snapshot's label, so it matches by role. */
function withSentiment<Row extends { name: string; is_brand: boolean }>(
  rows: readonly Row[],
  entities: readonly Entity[] | null,
): (Row & { sentiment: NetSentiment | null })[] {
  const brand = entities?.find((entity) => entity.is_brand);
  const competitors = new Map(
    (entities ?? []).filter((entity) => !entity.is_brand).map((entity) => [entity.name, entity]),
  );
  return rows.map((row) => ({
    ...row,
    sentiment: (row.is_brand ? brand : competitors.get(row.name))?.sentiment ?? null,
  }));
}

function selectionOf(
  scope: RunScope,
  query: Pick<DashboardQuery, 'logicalEngine' | 'cohort'>,
  runs: Pick<RunSelection, 'auditId' | 'auditIds'>,
): RunSelection {
  return {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    marketId: marketOf(scope),
    ...runs,
    logicalEngine: query.logicalEngine,
    cohort: query.cohort,
    topicId: scope.topicId ?? null,
    fromAt: null,
    toAt: null,
  };
}

export async function getRankedVisibility(
  db: Database,
  scope: RunScope,
  query: DashboardQuery,
): Promise<VisibilityResponse> {
  const view = await getVisibility(db, scope, query);
  const pooled = view.selection_mode === 'range' ? (view.source_audit_ids ?? []) : null;
  // An empty pool reads nothing; an empty list would select the latest run.
  if (pooled?.length === 0) return view;
  const entities = await entitySentiments(
    db,
    selectionOf(scope, query, { auditId: pooled ? null : view.audit_id, auditIds: pooled }),
  );
  return { ...view, rankings: withSentiment(view.rankings, entities) };
}

/** Each trend point's rankings with sentiment over exactly the runs the point folds. */
export async function withPointSentiments(
  db: Database,
  scope: RunScope,
  query: { logicalEngine: string | null; cohort: string },
  points: TrendPoint[],
): Promise<TrendPoint[]> {
  const groups = points.map((point) => point.source_audit_ids ?? []);
  const auditIds = [...new Set(groups.flat())];
  if (auditIds.length === 0) return points;
  const sentiments = await groupedSentiments(
    db,
    selectionOf(scope, query, { auditId: null, auditIds }),
    groups,
  );
  return points.map((point, index) => ({
    ...point,
    rankings: withSentiment(point.rankings, sentiments[index] ?? null),
  }));
}
