/**
 * AI Referrals: the persisted referral projection for one project.
 *
 * Ports `get_ai_referrals` from `app/domain/analytics/service.py` (Python
 * keeps it for the Agent's tools). It serves a persisted snapshot or the
 * empty payload, never a recomputation, and reports the window it actually
 * resolved rather than the one requested.
 */
import { sql } from 'kysely';
import { z } from 'zod';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { isoDateText } from '../db/timestamps.ts';
import { metricSeriesPoints, type MetricSeriesPoint } from './metric-series.ts';

const analytics = policy.analytics;
const PRESET_DAYS: Readonly<Record<string, number>> = analytics.preset_range_days;
const DAY_MS = 86_400_000;

/** An invalid granularity, range or window: the route answers 422. */
export class AiReferralsQueryError extends Error {}

type AiReferralSourceRow = { ai_source: string; sessions: number; share: number | null };

export type AiReferralsResponse = {
  project_id: string;
  window_start: string;
  window_end: string;
  granularity: string;
  referral_volume: MetricSeriesPoint[];
  referral_share: MetricSeriesPoint[];
  sources: AiReferralSourceRow[];
  analyzer_version: string;
  formula_version: string;
};

export type AiReferralsQuery = {
  workspaceId: string;
  projectId: string;
  /** `YYYY-MM-DD`, as the date parameters parse. */
  fromDate: string | null;
  toDate: string | null;
  rangeToken: string | null;
  granularity: string;
};

function validateGranularity(value: string): string {
  const granularity = value || analytics.default_granularity;
  if (!analytics.snapshot_granularities.includes(granularity)) {
    throw new AiReferralsQueryError(`unknown granularity: ${granularity}`);
  }
  return granularity;
}

function validateRange(value: string | null): void {
  if (value !== null && !Object.hasOwn(PRESET_DAYS, value)) {
    throw new AiReferralsQueryError(`unknown ai-referrals range: ${value}`);
  }
}

function validateWindow(fromDate: string | null, toDate: string | null): void {
  if ((fromDate === null) !== (toDate === null)) {
    throw new AiReferralsQueryError("'from' and 'to' must be supplied together");
  }
  if (fromDate === null || toDate === null) return;
  if (toDate < fromDate) throw new AiReferralsQueryError("'to' must not be before 'from'");
  const days = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS;
  if (days + 1 > analytics.max_window_days) {
    throw new AiReferralsQueryError(
      `window exceeds ANALYTICS_MAX_WINDOW_DAYS (${analytics.max_window_days})`,
    );
  }
}

/** Stored counts must be exact integers; missing is not observed zero. */
const sessionCount = z
  .union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number<string | number>().int().nonnegative().max(Number.MAX_SAFE_INTEGER));

function laxShare(value: unknown): number | null {
  return metricSeriesPoints([{ value }])[0]!.value;
}

/** `ai_referral_sources`: the stored per-source rows as served; a malformed value is a 500. */
export function aiReferralSources(raw: unknown) {
  const rows: unknown[] = Array.isArray(raw) ? raw : [];
  return rows.filter(isObject).map((row) => ({
    ai_source: String(row.ai_source ?? ''),
    sessions: sessionCount.parse(row.sessions),
    share: laxShare(row.share),
  }));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function getAiReferrals(
  db: Database,
  query: AiReferralsQuery,
): Promise<AiReferralsResponse> {
  const granularity = validateGranularity(query.granularity);
  validateRange(query.rangeToken);
  validateWindow(query.fromDate, query.toDate);
  let snapshots = db
    .selectFrom('ai_referrals_snapshots')
    .select([
      'granularity',
      'metrics',
      'analyzer_version',
      'formula_version',
      isoDateText(sql.ref('window_start')).as('window_start'),
      isoDateText(sql.ref('window_end')).as('window_end'),
    ])
    .where('workspace_id', '=', query.workspaceId)
    .where('project_id', '=', query.projectId)
    .where('granularity', '=', granularity)
    .where('analyzer_version', '=', analytics.ai_referral_analyzer_version)
    .where('formula_version', '=', analytics.ai_referral_formula_version);
  if (query.rangeToken !== null) {
    // The preset marker, not the window's length: a sync window can happen to
    // be exactly 30 days long without being "Last 30 days".
    snapshots = snapshots
      .where('preset_window_days', '=', PRESET_DAYS[query.rangeToken]!)
      .orderBy('window_end', 'desc')
      .orderBy('window_start', 'desc');
  } else if (query.fromDate !== null && query.toDate !== null) {
    snapshots = snapshots
      .where('window_start', '=', sql<Date>`${query.fromDate}::date`)
      .where('window_end', '=', sql<Date>`${query.toDate}::date`);
  } else {
    snapshots = snapshots.orderBy('window_end', 'desc').orderBy('window_start', 'desc');
  }
  const snapshot = await snapshots.limit(1).executeTakeFirst();
  const versions = {
    analyzer_version: analytics.ai_referral_analyzer_version,
    formula_version: analytics.ai_referral_formula_version,
  };
  if (snapshot === undefined) {
    return {
      project_id: query.projectId,
      window_start: query.fromDate ?? '',
      window_end: query.toDate ?? '',
      granularity,
      referral_volume: [],
      referral_share: [],
      sources: [],
      ...versions,
    };
  }
  if (snapshot.metrics != null && !isObject(snapshot.metrics)) {
    throw new TypeError('stored metrics are not an object');
  }
  const metrics = isObject(snapshot.metrics) ? snapshot.metrics : {};
  return {
    project_id: query.projectId,
    window_start: snapshot.window_start,
    window_end: snapshot.window_end,
    granularity: snapshot.granularity,
    referral_volume: metricSeriesPoints(metrics.referral_volume),
    referral_share: metricSeriesPoints(metrics.referral_share),
    sources: aiReferralSources(metrics.sources),
    analyzer_version: snapshot.analyzer_version,
    formula_version: snapshot.formula_version,
  };
}
