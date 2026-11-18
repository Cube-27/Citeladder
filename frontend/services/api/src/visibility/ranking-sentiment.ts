/**
 * The dashboard read with each ranking row's net sentiment over the same
 * selection: the run (or the period's pooled runs), engine and cohort the
 * ranking counts. Derived from persisted perceptions; never classified here.
 */
import type { Database } from '../db/database.ts';
import { getVisibility, type DashboardQuery, type VisibilityResponse } from './dashboard.ts';
import { entitySentiments } from './perception.ts';
import { marketOf, type RunScope } from './runs.ts';

export async function getRankedVisibility(
  db: Database,
  scope: RunScope,
  query: DashboardQuery,
): Promise<VisibilityResponse> {
  const view = await getVisibility(db, scope, query);
  const pooled = view.selection_mode === 'range' ? (view.source_audit_ids ?? []) : null;
  // An empty pool reads nothing; an empty list would select the latest run.
  if (pooled?.length === 0) return view;
  const entities = await entitySentiments(db, {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    marketId: marketOf(scope),
    auditId: pooled ? null : view.audit_id,
    auditIds: pooled,
    logicalEngine: query.logicalEngine,
    cohort: query.cohort,
    topicId: scope.topicId ?? null,
    fromAt: null,
    toAt: null,
  });
  const brand = entities.find((entity) => entity.is_brand);
  const competitors = new Map(
    entities.filter((entity) => !entity.is_brand).map((entity) => [entity.name, entity]),
  );
  return {
    ...view,
    rankings: view.rankings.map((row) => ({
      ...row,
      // The brand row's name is the snapshot's label, so it matches by role.
      sentiment: (row.is_brand ? brand : competitors.get(row.name))?.sentiment ?? null,
    })),
  };
}
