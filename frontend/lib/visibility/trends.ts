/**
 * Cross-run Visibility trend helpers (F9 Trend mode).
 *
 * Pure, framework-free helpers the Trend view uses to turn the backend
 * `VisibilityTrendPoint[]` projection into the chart series, headline stats,
 * version-boundary markers, and start/latest ranking tables. The trend endpoint
 * is the single source of truth; nothing here recomputes a metric — it only
 * projects persisted values for display (invariant 7). Sentiment / average
 * position stay the not-yet-computed placeholder (decision B-2 / invariant 9).
 */
import type { TrendPoint } from '@/components/ui/trend-chart';
import type { LogicalEngine, VisibilityTrendPoint } from '@/lib/api/types';
import { ENGINE_ORDER } from '@/lib/providers/catalog';

/** Trend granularity — mirrors the backend `granularity=run|week|month`. */
export type TrendGranularity = 'run' | 'day' | 'week' | 'month';

export const GRANULARITY_OPTIONS: readonly { value: TrendGranularity; label: string }[] = [
  { value: 'run', label: 'Per run' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
] as const;

export function granularityLabel(value: TrendGranularity): string {
  return GRANULARITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** Date-range presets. `all` sends no bounds; the rest send a UTC `from`. */
export type TrendRange = 'all' | '30d' | '90d' | '1y';

export const RANGE_OPTIONS: readonly { value: TrendRange; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
] as const;

export function rangeLabel(value: TrendRange): string {
  return RANGE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** Engines offered by the trend engine filter (canonical display order). */
export const TREND_ENGINES: readonly LogicalEngine[] = ENGINE_ORDER;

/**
 * Resolve a range preset into an inclusive UTC `from` bound (ISO 8601), or
 * `undefined` for "all time". `now` is injectable for deterministic tests.
 */
export function rangeToFrom(range: TrendRange, now: Date = new Date()): string | undefined {
  if (range === 'all') return undefined;
  const from = new Date(now.getTime());
  if (range === '30d') from.setUTCDate(from.getUTCDate() - 30);
  else if (range === '90d') from.setUTCDate(from.getUTCDate() - 90);
  else if (range === '1y') from.setUTCFullYear(from.getUTCFullYear() - 1);
  return from.toISOString();
}

/** Which headline metric a chart plots. */
export type TrendMetric = 'sov' | 'brand_mention_rate' | 'owned_citation_rate';

/** Short x-axis label for a point's completion timestamp. */
function formatPointLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Full date label (used for the start/latest ranking card subtitles). */
export function formatPointDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function historicalSelection(point: VisibilityTrendPoint, search: string): string {
  const params = new URLSearchParams(search);
  params.set('tab', 'trends');
  for (const key of [
    'cursor',
    'as_of',
    'source_offset',
    'source_as_of',
    'query_offset',
    'prompt_page',
    'baseline',
  ])
    params.delete(key);
  if (point.audit_id) {
    params.set('selection', 'run');
    params.set('run', point.audit_id);
    params.delete('configuration');
  } else {
    const start = new Date(point.completed_at);
    const end = new Date(start);
    if (params.get('granularity') === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
    else end.setUTCDate(end.getUTCDate() + 7);
    params.set('selection', 'range');
    params.delete('run');
    params.set('from', start.toISOString());
    params.set('to', new Date(end.getTime() - 1).toISOString());
    params.set(
      'configuration',
      [
        point.comparison_key ?? point.source_audit_ids?.[0],
        point.analyzer_versions[0],
        point.scoring_rule_versions[0],
      ].join(':'),
    );
  }
  return `/visibility?${params}`;
}

/** A metric's 0–100 value for a point (percentages scaled to whole percent). */
function metricValue(point: VisibilityTrendPoint, metric: TrendMetric): number | null {
  switch (metric) {
    case 'sov':
      return point.sov.mention === null ? null : point.sov.mention * 100;
    case 'brand_mention_rate':
      return point.brand_mention_rate === null ? null : point.brand_mention_rate * 100;
    case 'owned_citation_rate':
      return point.owned_citation_rate === null ? null : point.owned_citation_rate * 100;
  }
}

/**
 * Map the trend series into `TrendChart` points for `metric`. A point that
 * introduces a new analyzer/scoring version (its distinct version set differs
 * from the previous point's, or it spans a boundary) carries a `versionChange`
 * marker so the chart can flag it (invariant 4 / version continuity).
 */
export function toChartPoints(
  points: readonly VisibilityTrendPoint[],
  metric: TrendMetric,
): TrendPoint[] {
  let prevVersions: string | null = null;
  let previousIdentity: string | null | undefined = undefined;
  return points.map((point) => {
    const value = metricValue(point, metric);
    const versionKey = [...point.analyzer_versions, ...point.scoring_rule_versions].join('|');
    const changed = prevVersions !== null && versionKey !== prevVersions;
    const identityChanged =
      previousIdentity !== undefined &&
      (!point.comparison_key || previousIdentity !== point.comparison_key);
    previousIdentity = point.comparison_key;
    prevVersions = versionKey;
    return {
      // Preserve unavailable metrics as null — the chart renders a GAP and an
      // "unavailable" label rather than coercing to a misleading zero.
      label: formatPointLabel(point.completed_at),
      value,
      timestamp: new Date(point.completed_at).getTime(),
      breakBefore: changed || identityChanged || !point.comparison_key,
      versionChange:
        changed || point.spans_version_boundary ? { note: versionChangeNote(point) } : null,
    };
  });
}

/** Human note for a version-change marker (which version set now applies). */
function versionChangeNote(point: VisibilityTrendPoint): string {
  const scoring = point.scoring_rule_versions.join(', ') || 'unknown';
  return point.spans_version_boundary
    ? `Mixed scoring versions in this bucket (${scoring})`
    : `Scoring rule ${scoring} applied`;
}

/**
 * Categorical stroke classes for comparison lines, in a fixed order.
 *
 * Fixed so a given competitor keeps its colour while the reader changes metric
 * or period, and drawn from the design system's own chart ramp rather than a
 * palette invented here.
 */
const SERIES_STROKES = [
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
  'stroke-chart-6',
  'stroke-chart-7',
] as const;

/**
 * One comparison line per tracked competitor, aligned to the same points.
 *
 * Every point already carries the full ranking roster, so nothing is fetched to
 * draw these. A competitor absent from a point contributes a gap there, never a
 * zero: not measured and measured-as-zero are different facts.
 */
export function toCompetitorSeries(
  points: readonly VisibilityTrendPoint[],
  metric: TrendMetric,
  limit = SERIES_STROKES.length,
): { label: string; values: (number | null)[]; strokeClass: string }[] {
  const latest = points.at(-1);
  const names = (latest?.rankings ?? [])
    .filter((row) => !row.is_brand)
    .sort((a, b) => (b.mention_rate ?? -1) - (a.mention_rate ?? -1))
    .slice(0, limit)
    .map((row) => row.name);
  return names.map((name, index) => ({
    label: name,
    strokeClass: SERIES_STROKES[index % SERIES_STROKES.length],
    values: points.map((point) => {
      const row = point.rankings.find((entry) => entry.name === name);
      if (!row) return null;
      const value = metric === 'owned_citation_rate' ? row.citation_rate : row.mention_rate;
      return value === null || value === undefined ? null : value * 100;
    }),
  }));
}
