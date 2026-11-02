/**
 * Each finalized run's comparable baseline, persisted on
 * `audit_comparison_baselines` by audit finalization in its own transaction.
 *
 * One row per requestable cohort and engine selector (every engine the run
 * measured, and all engines together), holding what the comparison walk
 * (`comparison.ts`, the single rule) found: the nearest compatible earlier
 * run in the same market, the comparison status, and the runs passed over.
 * Visibility and Overview both read it, so they name the same baseline, and
 * neither walks the history per request. Earlier runs are final before a
 * later one finalizes, so the walk's inputs do not change after this write.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { frozenComparisonKey } from '../analysis/comparison.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { utcText } from '../db/timestamps.ts';
import { emptyComparison, nearestBaseline, type SelectedRun } from './comparison.ts';
import { cohortMetrics, engineMetrics } from './metrics.ts';
import { loadMeasuredRuns } from './runs.ts';

const visibility = policy.visibility;

/**
 * Persist the run's baselines. The caller holds the run's finalization
 * transaction, after its metric snapshot and completion time are written.
 */
export async function persistComparisonBaselines(
  db: Database,
  input: { workspaceId: string; auditId: string; engines: readonly string[] },
): Promise<void> {
  const run = await db
    .selectFrom('audits as audit')
    .innerJoin('metric_snapshots as snapshot', (join) =>
      join
        .onRef('snapshot.audit_id', '=', 'audit.id')
        .onRef('snapshot.workspace_id', '=', 'audit.workspace_id'),
    )
    .select([
      'audit.project_id',
      'audit.market_id',
      'audit.audit_scope',
      'audit.configuration',
      utcText(sql.ref('audit.completed_at')).as('completed_at'),
      'snapshot.analyzer_version',
      'snapshot.scoring_rule_version',
      'snapshot.metrics',
    ])
    .where('audit.workspace_id', '=', input.workspaceId)
    .where('audit.id', '=', input.auditId)
    .executeTakeFirst();
  // Only brand runs are compared; a run without completion has no history before it.
  if (run?.audit_scope !== visibility.brand_audit_scope || run.completed_at === null) return;
  const completedAt = run.completed_at;
  const scope = {
    workspaceId: input.workspaceId,
    projectId: run.project_id,
    marketId: run.market_id,
  };
  // Every selector walks the same recent history, read once.
  const candidates = await loadMeasuredRuns(db, scope, {
    fromAt: null,
    toAt: completedAt,
    newest: visibility.selection_max_runs,
  });
  const rows = [];
  for (const cohort of visibility.requestable_cohorts) {
    for (const engine of [null, ...input.engines]) {
      const metrics = cohortMetrics(run.metrics, cohort);
      const current: SelectedRun & { completedAt: string } = {
        auditId: input.auditId,
        workspaceId: input.workspaceId,
        configuration: run.configuration,
        completedAt,
        analyzerVersion: run.analyzer_version,
        scoringRuleVersion: run.scoring_rule_version,
        metrics: engine === null ? metrics : engineMetrics(metrics, engine),
      };
      const key = frozenComparisonKey(run.configuration, engine);
      const selector = { cohort, engine, baselineId: null };
      const found =
        key === null
          ? emptyComparison({ status: 'identity_unavailable' })
          : await nearestBaseline(db, current, selector, { key, candidates }); // NOSONAR -- One transaction connection: selectors walk in order.
      rows.push({
        id: randomUUID(),
        workspace_id: input.workspaceId,
        project_id: run.project_id,
        audit_id: input.auditId,
        cohort,
        logical_engine: engine,
        status: found.status,
        baseline_audit_id: found.baseline_audit_id,
        skipped_runs: found.skipped_runs,
        analyzer_version: run.analyzer_version,
        scoring_rule_version: run.scoring_rule_version,
        created_at: new Date(),
      });
    }
  }
  await db
    .insertInto('audit_comparison_baselines')
    .values(rows)
    .onConflict((conflict) => conflict.constraint('uq_audit_comparison_baseline').doNothing())
    .execute();
}
