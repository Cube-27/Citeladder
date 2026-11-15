import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { marketOf, type RunScope } from './runs.ts';
import { selectedCohorts, TrendQueryError } from './selection.ts';

const visibility = policy.visibility;

/**
 * The run that last measured each tracked prompt in the market: the prompt
 * library reads every prompt's own latest result, so a run that measured
 * other prompts never hides an earlier one's.
 */
export async function latestPromptRuns(
  db: Database,
  scope: RunScope,
  query: { auditId: string | null; auditIds: string[] | null; cohort: string; promptId?: string },
): Promise<Map<string, string>> {
  if (query.auditId !== null || query.auditIds?.length)
    throw new TrendQueryError('A per-prompt latest read takes no named runs');
  let latest = db
    .selectFrom('prompt_metric_snapshots as score')
    .innerJoin('audits as audit', 'audit.id', 'score.audit_id')
    .distinctOn('score.prompt_id')
    .select(['score.prompt_id', 'score.audit_id'])
    .where('score.workspace_id', '=', scope.workspaceId)
    .where('score.project_id', '=', scope.projectId)
    .where('score.cohort', 'in', [...selectedCohorts(query.cohort)])
    .where('audit.workspace_id', '=', scope.workspaceId)
    .where('audit.project_id', '=', scope.projectId)
    .where('audit.audit_scope', '=', visibility.brand_audit_scope)
    .where('audit.market_id', 'is not distinct from', marketOf(scope))
    .where('audit.status', 'in', visibility.dashboard_audit_statuses);
  latest = query.promptId
    ? latest.where('score.prompt_id', '=', query.promptId)
    : latest.where('score.prompt_id', 'is not', null);
  // The same order as `latestBrandRunId`, per prompt.
  const rows = await latest
    .orderBy('score.prompt_id')
    .orderBy(sql`audit.completed_at desc nulls last`)
    .orderBy('audit.created_at', 'desc')
    .orderBy('audit.id', 'desc')
    .execute();
  return new Map(rows.flatMap((row) => (row.prompt_id ? [[row.prompt_id, row.audit_id]] : [])));
}
