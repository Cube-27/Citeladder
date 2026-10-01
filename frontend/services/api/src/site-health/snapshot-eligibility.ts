/** Freeze the access gate and its exact acquisition/evaluation sources. */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { MeasurementProjection } from './score-summary.ts';
import type { Crawl } from './task-fence.ts';

const CRITICAL = policy.site_health.reads.eligibility_critical_checkpoints;
const EXCLUSIONS = policy.site_health.reads.corpus_exclusion_error_codes;
type EligibilityTask = { status: string; error_code: string } | undefined;

/**
 * One selected page's search-eligibility state and status bucket. Only the
 * critical checkpoints gate it; a page that left the corpus by policy is
 * excluded, and an unresolved failure is an error, not a blocker.
 */
export function eligibilityState(outcomes: Record<string, string>, task: EligibilityTask) {
  const critical = CRITICAL.map((key) => outcomes[key] ?? 'unknown');
  if (critical.includes('missing')) return { state: 'blocked', status: 'blocked' } as const;
  if (critical.every((value) => value === 'satisfied'))
    return { state: 'eligible', status: 'audited' } as const;
  if (task?.status === 'failed' && EXCLUSIONS.includes(task.error_code))
    return { state: 'excluded', status: 'excluded' } as const;
  return { state: 'unknown', status: task?.status === 'failed' ? 'error' : 'pending' } as const;
}

export async function snapshotEligibility(
  db: Database,
  crawl: Crawl,
  projection: MeasurementProjection,
) {
  const tasks = new Map(projection.tasks.map((row) => [row.site_url_id, row]));
  const taskIds = projection.tasks.map((row) => row.id).sort();
  const attempts = await db
    .selectFrom('site_fetch_attempts')
    .selectAll()
    .distinctOn('task_id')
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .where('task_id', '=', sql<string>`any(${taskIds}::uuid[])`)
    .orderBy('task_id')
    .orderBy('attempt_number', 'desc')
    .orderBy('request_ordinal', 'desc')
    .orderBy('id', 'desc')
    .execute();
  const attemptsByTask = new Map(attempts.map((row) => [row.task_id, row]));
  const ownerByEvaluation = new Map(
    projection.rows.flatMap((row) =>
      (row.source_evaluation_ids ?? []).map((id) => [id, row.site_url_id] as const),
    ),
  );
  const indexability = new Map<string, MeasurementProjection['evaluations'][number]>();
  const snippets = new Map<string, MeasurementProjection['evaluations'][number]>();
  let crawler: MeasurementProjection['evaluations'][number] | undefined;
  for (const row of projection.evaluations) {
    const siteUrlId = ownerByEvaluation.get(row.id);
    if (!siteUrlId) continue;
    if (row.rule_id === 'technical.indexable') indexability.set(siteUrlId, row);
    if (row.rule_id === 'search.snippet_access') snippets.set(siteUrlId, row);
    if (row.rule_id === 'search.crawler_access') crawler = row;
  }
  const totals = { eligible: 0, blocked: 0, unknown: 0, excluded: 0 };
  const statuses = { audited: 0, blocked: 0, excluded: 0, error: 0, pending: 0 };
  const reasons: Record<string, unknown>[] = [];
  for (const id of projection.selectedIds) {
    const task = tasks.get(id);
    const attempt = task ? attemptsByTask.get(task.id) : undefined;
    const representation = task?.result_artifact_id
      ? 'satisfied'
      : task?.status === 'failed' && task.error_code === 'robots_denied'
        ? 'missing'
        : 'unknown';
    const indexing = indexability.get(id);
    const snippet = snippets.get(id);
    const outcomes: Record<string, string> = {
      'acquisition.public_representation': representation,
      'search.indexability': indexing?.outcome ?? 'unknown',
      'search.crawler_access': crawler?.outcome ?? 'unknown',
      'search.snippet_access': snippet?.outcome ?? 'unknown',
    };
    const { state, status } = eligibilityState(outcomes, task);
    totals[state]++;
    statuses[status]++;
    if (state === 'eligible') continue;
    const checkpoint = (key: string, evaluation: typeof indexing) => ({
      checkpoint_id: key,
      outcome: evaluation?.outcome ?? 'unknown',
      reason: evaluation?.reason_code ?? 'analysis_missing',
      source_analysis_id: evaluation?.analysis_id ?? null,
      source_evaluation_id: evaluation?.id ?? null,
    });
    reasons.push({
      site_url_id: id,
      state,
      checkpoints: [
        {
          checkpoint_id: 'acquisition.public_representation',
          outcome: representation,
          reason:
            representation === 'satisfied'
              ? 'supported_public_representation'
              : representation === 'missing'
                ? 'robots_denied'
                : 'acquisition_not_determinate',
          source_task_id: task?.id ?? null,
          source_attempt_id: attempt?.id ?? null,
          source_artifact_id: task?.result_artifact_id ?? null,
        },
        checkpoint('search.crawler_access', crawler),
        checkpoint('search.snippet_access', snippet),
        checkpoint('search.indexability', indexing),
      ],
    });
  }
  const gate = totals.blocked
    ? 'blocked'
    : totals.unknown
      ? 'unknown'
      : totals.eligible
        ? 'eligible'
        : totals.excluded
          ? 'excluded'
          : 'unknown';
  return {
    search_eligibility: gate,
    eligibility_totals: totals,
    eligibility_reasons: reasons,
    status_counts: statuses,
    source_task_ids: taskIds,
    source_attempt_ids: attempts.map((row) => row.id).sort(),
  };
}
