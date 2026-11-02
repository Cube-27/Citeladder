/**
 * The cross-run visibility trend: one point per run, or per UTC bucket.
 *
 * A projection of the project's persisted snapshots; a project with no matching
 * history is an empty list, never an error. An explicit model or retrieval
 * slice filters sources before anything is folded.
 */
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { toUtc, type ParsedDatetime } from '../http/datetimes.ts';
import { applyMarks, rankingMarks } from './ranking-marks.ts';
import { loadMeasuredRuns, trendSource, type RunScope } from './runs.ts';
import { TrendQueryError, validateEngineAndRange, validateCohort } from './selection.ts';
import { bucketPoints, bucketStart, rawPoint, type TrendPoint } from './trend-folding.ts';

const visibility = policy.visibility;

export type TrendQuery = {
  logicalEngine: string | null;
  fromAt: ParsedDatetime | null;
  toAt: ParsedDatetime | null;
  granularity: string;
  transportModel: string | null;
  retrievalEnabled: boolean | null;
  cohort: string;
};

/**
 * The newest `trend_max_runs` measured runs in the window, oldest first. The
 * read takes one run more to see where history was cut: that run leaves the
 * trend and, in a bucketed view, so does every run sharing its bucket, so no
 * point folds part of a bucket.
 */
async function newestRuns(db: Database, scope: RunScope, query: TrendQuery) {
  const bound = visibility.trend_max_runs;
  const loaded = await loadMeasuredRuns(db, scope, {
    fromAt: query.fromAt && toUtc(query.fromAt),
    toAt: query.toAt && toUtc(query.toAt),
    newest: bound + 1,
  });
  const [cut, ...kept] = loaded;
  if (cut === undefined || loaded.length <= bound) return loaded;
  if (query.granularity === 'run') return kept;
  const cutBucket = bucketStart(cut.completedAt, query.granularity);
  return kept.filter((run) => bucketStart(run.completedAt, query.granularity) > cutBucket);
}

export async function getVisibilityTrends(
  db: Database,
  scope: RunScope,
  query: TrendQuery,
): Promise<TrendPoint[]> {
  if (!visibility.trend_granularities.includes(query.granularity)) {
    throw new TrendQueryError(`Unsupported granularity: ${query.granularity}`);
  }
  if (query.transportModel !== null && !query.transportModel.trim()) {
    throw new TrendQueryError("'transport_model' must be a non-empty model id");
  }
  validateEngineAndRange(query);
  validateCohort(query.cohort);
  const runs = await newestRuns(db, scope, query);
  const sources = runs
    .map((run) => trendSource(run, query.logicalEngine, query.cohort))
    .filter((source) => source !== null)
    // Slices match the exact frozen identity, so a multi-model point never
    // lands in a model slice.
    .filter(
      (source) =>
        (query.transportModel === null || source.transportModel === query.transportModel) &&
        (query.retrievalEnabled === null || source.retrievalEnabled === query.retrievalEnabled),
    );
  if (sources.length === 0) return [];
  // Cap points after folding, so a run-heavy week is still one point and
  // never crowds out the weeks before it. The newest points stay, in order.
  const points = (
    query.granularity === 'run' ? sources.map(rawPoint) : bucketPoints(sources, query.granularity)
  ).slice(-visibility.trend_max_points);
  const marks = await rankingMarks(db, scope.projectId);
  for (const point of points) applyMarks(point.rankings, marks);
  return points;
}
