/** Persisted Performance reads, shared with the retained Python Agent reader. */
import { sql } from 'kysely';

import { metricSeriesPoints } from '../analytics/metric-series.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { isoDateText } from '../db/timestamps.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { ApiError } from '../errors.ts';
import { parseUuid } from '../http/uuid.ts';
import { addDays } from '../referrals/projection.ts';
import { numberOrNull } from './accumulators.ts';
import { hash } from './normalization.ts';

const p = policy.traffic;
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const integer = (value: unknown) => {
  const n = numberOrNull(value);
  return n === null ? null : Math.trunc(n);
};
export const windowDays = (start: string, end: string) =>
  (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
export type Window = readonly [string, string];
type Scope = { workspaceId: string; projectId: string };
export function customWindow(start?: string | null, end?: string | null): Window | null {
  if (start == null && end == null) return null;
  if (!start || !end) throw new ApiError(422, "'from' and 'to' must be supplied together");
  if (end < start) throw new ApiError(422, "'to' must not be before 'from'");
  if (windowDays(start, end) > p.PERFORMANCE_CUSTOM_RANGE_MAX_DAYS)
    throw new ApiError(422, `window exceeds ${p.PERFORMANCE_CUSTOM_RANGE_MAX_DAYS} days`);
  return [start, end];
}
function choice(
  label: string,
  value: string | null | undefined,
  fallback: string,
  choices: readonly string[],
): string {
  const selected = value || fallback;
  if (!choices.includes(selected))
    throw new ApiError(422, `unknown performance ${label}: '${selected}'`);
  return selected;
}
function snapshots(db: Database, scope: Scope) {
  return new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'traffic_snapshots')
    .selectAll()
    .select([
      isoDateText(sql.ref('window_start')).as('start'),
      isoDateText(sql.ref('window_end')).as('end'),
    ])
    .where('project_id', '=', scope.projectId);
}
type Snapshot = NonNullable<Awaited<ReturnType<ReturnType<typeof snapshots>['executeTakeFirst']>>>;
async function exactSnapshot(db: Database, scope: Scope, window: Window, granularity: string) {
  return snapshots(db, scope)
    .where('window_start', '=', sql<Date>`${window[0]}::date`)
    .where('window_end', '=', sql<Date>`${window[1]}::date`)
    .where('granularity', '=', granularity)
    .executeTakeFirst();
}
async function selectedDates(
  db: Database,
  scope: Scope,
  range: string,
  explicit: Window | null,
): Promise<Window | null> {
  if (explicit) return explicit;
  const presets: Record<string, number> = p.PERFORMANCE_PRESET_RANGE_DAYS;
  const extended: Record<string, number> = p.PERFORMANCE_EXTENDED_RANGE_DAYS;
  let query = snapshots(db, scope)
    .where('granularity', '=', p.TRAFFIC_DEFAULT_GRANULARITY)
    .orderBy('window_end', 'desc');
  if (range in presets) {
    const row = await query
      .where('preset_window_days', '=', presets[range]!)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    return row ? [row.start, row.end] : null;
  }
  if (range === p.PERFORMANCE_RANGE_LAST_SYNCED) {
    const row = await new WorkspaceScope(scope.workspaceId)
      .selectFrom(db, 'integration_metric_rows')
      .select([isoDateText(sql`min(date)`).as('start'), isoDateText(sql`max(date)`).as('end')])
      .where('project_id', '=', scope.projectId)
      .where('dataset', 'in', p.TRAFFIC_CONSUMED_DATASETS)
      .executeTakeFirst();
    if (!row?.start || !row.end) return null;
    const floor = addDays(row.end, -(p.TRAFFIC_MAX_WINDOW_DAYS - 1));
    return [row.start > floor ? row.start : floor, row.end];
  }
  query = query.orderBy('window_start', 'asc').orderBy('id', 'desc');
  const row = await query.executeTakeFirst();
  return row
    ? [range in extended ? addDays(row.end, -(extended[range]! - 1)) : row.start, row.end]
    : null;
}

function performanceWindow(
  snapshot: Pick<Snapshot, 'id' | 'start' | 'end' | 'metrics'> | undefined,
  window: Window | null,
) {
  const raw = record(snapshot?.metrics);
  const m = record(raw.totals);
  const totals = {
    clicks: integer(m.clicks),
    impressions: integer(m.impressions),
    ctr: numberOrNull(m.ctr),
    position: numberOrNull(m.position),
    sessions: integer(m.sessions),
    conversions: integer(m.conversions),
  };
  const observed = [totals.clicks, totals.impressions, totals.sessions, totals.conversions];
  const series = record(raw.series);
  return {
    snapshot_id: snapshot?.id ?? null,
    window_start: snapshot?.start ?? window?.[0] ?? '',
    window_end: snapshot?.end ?? window?.[1] ?? '',
    evidence_state: observed.every((v) => v === null)
      ? 'not_run'
      : observed.some(Boolean)
        ? 'available'
        : 'observed_zero',
    totals,
    series: Object.fromEntries(
      ['clicks', 'impressions', 'ctr', 'position'].map((name) => [
        name,
        metricSeriesPoints(series[name]),
      ]),
    ),
  };
}

export async function getPerformance(
  db: Database,
  options: Scope & {
    range?: string | null;
    from?: string | null;
    to?: string | null;
    compare?: string | null;
    compare_from?: string | null;
    compare_to?: string | null;
    granularity?: string | null;
  },
) {
  const range = choice('range', options.range, p.PERFORMANCE_DEFAULT_RANGE, p.PERFORMANCE_RANGES);
  const granularity = options.granularity ?? p.TRAFFIC_DEFAULT_GRANULARITY;
  if (!p.TRAFFIC_SNAPSHOT_GRANULARITIES.includes(granularity))
    throw new ApiError(422, `unknown performance granularity: '${granularity}'`);
  const compare = choice(
    'compare',
    options.compare,
    p.PERFORMANCE_DEFAULT_COMPARE,
    p.PERFORMANCE_COMPARE_MODES,
  );
  const window = await selectedDates(db, options, range, customWindow(options.from, options.to));
  const snapshot = window ? await exactSnapshot(db, options, window, granularity) : undefined;
  let comparison = null;
  if (window && compare !== p.PERFORMANCE_COMPARE_NONE) {
    let peer: Window | null;
    if (compare === p.PERFORMANCE_COMPARE_PREVIOUS)
      peer = [addDays(window[0], -windowDays(...window)), addDays(window[0], -1)];
    else if (compare === p.PERFORMANCE_COMPARE_YEAR_OVER_YEAR)
      peer = window.map((day) =>
        addDays(day, -p.PERFORMANCE_YEAR_OVER_YEAR_SHIFT_DAYS),
      ) as unknown as Window;
    else peer = customWindow(options.compare_from, options.compare_to);
    if (!peer) throw new ApiError(422, "compare=custom requires 'compare_from' and 'compare_to'");
    comparison = performanceWindow(await exactSnapshot(db, options, peer, granularity), peer);
  }
  const coverage = record(snapshot?.coverage);
  const counts = record(snapshot?.dimension_counts);
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  return {
    project_id: options.projectId,
    range,
    granularity,
    compare,
    selected: performanceWindow(snapshot, window),
    comparison,
    coverage: {
      earliest_date: text(coverage.earliest_date),
      latest_date: text(coverage.latest_date),
      covered_days: integer(coverage.covered_days) ?? 0,
    },
    dimension_counts: Object.fromEntries(
      p.PERFORMANCE_TABLE_DIMENSION_ORDER.map((d) => [d, integer(counts[d]) ?? 0]),
    ),
    unavailable_dimensions: p.PERFORMANCE_UNAVAILABLE_DIMENSIONS,
    formula_version: snapshot?.formula_version ?? p.TRAFFIC_FORMULA_VERSION,
    normalization_version: snapshot?.normalization_version ?? p.TRAFFIC_NORMALIZATION_VERSION,
  };
}

function tableMetrics(value: unknown) {
  const m = record(value);
  return {
    clicks: integer(m.clicks) ?? 0,
    impressions: integer(m.impressions) ?? 0,
    ctr: numberOrNull(m.ctr),
    position: numberOrNull(m.position),
  };
}
function badCursor(): never {
  throw new ApiError(400, 'Invalid performance cursor', { code: 'invalid_cursor' });
}

export async function getPerformanceTable(
  db: Database,
  options: Scope & {
    snapshot_id: string;
    dimension?: string | null;
    sort?: string | null;
    cursor?: string | null;
    page_size?: number | null;
    compare_snapshot_id?: string | null;
  },
) {
  const dimension = choice(
    'dimension',
    options.dimension,
    p.PERFORMANCE_DEFAULT_DIMENSION,
    p.PERFORMANCE_DIMENSIONS,
  );
  const pageSize = options.page_size ?? p.PERFORMANCE_DEFAULT_PAGE_SIZE;
  if (!p.PERFORMANCE_PAGE_SIZE_OPTIONS.includes(pageSize))
    throw new ApiError(
      422,
      `page_size must be one of [${[...p.PERFORMANCE_PAGE_SIZE_OPTIONS].sort((a, b) => a - b).join(', ')}]`,
    );
  const defaults: Record<string, string> = p.PERFORMANCE_DIMENSION_DEFAULT_SORT;
  const sort = options.sort || defaults[dimension]!;
  const descending = sort.startsWith('-');
  const key = descending ? sort.slice(1) : sort;
  if (!p.PERFORMANCE_SORT_WHITELIST.includes(key))
    throw new ApiError(422, `unknown performance sort: '${sort}'`);
  const filters = {
    dimension,
    page_size: String(pageSize),
    project_id: options.projectId,
    snapshot_id: options.snapshot_id,
    sort,
  };
  const fingerprint = hash(JSON.stringify({ f: filters, s: 'performance-table' })).slice(0, 16);
  let after: [string, string] | null = null;
  if (options.cursor) {
    try {
      const decoded: unknown = JSON.parse(
        Buffer.from(options.cursor, 'base64url').toString('utf8'),
      );
      const c = record(decoded);
      if (
        c.fp !== fingerprint ||
        !Array.isArray(c.k) ||
        c.k.length !== 2 ||
        typeof c.k[0] !== 'string' ||
        !parseUuid(c.k[1])
      )
        badCursor();
      after = [c.k[0] as string, c.k[1] as string];
    } catch {
      badCursor();
    }
  }
  const snapshot = await snapshots(db, options)
    .where('id', '=', options.snapshot_id)
    .executeTakeFirst();
  const empty = { dimension, items: [], next_cursor: null, total_count: 0, page_size: pageSize };
  if (!snapshot) return empty;
  const expression =
    key === p.PERFORMANCE_SORT_KEY_DIMENSION
      ? sql<string>`dimension_key`
      : sql<number>`(metrics ->> ${key})::double precision`;
  let query = new WorkspaceScope(options.workspaceId)
    .selectFrom(db, 'performance_dimension_stats')
    .selectAll()
    .where('project_id', '=', options.projectId)
    .where('snapshot_id', '=', options.snapshot_id)
    .where('dimension', '=', dimension);
  if (after) {
    const [value, id] = after;
    if (value === '') query = query.where(sql<boolean>`${expression} is null and id > ${id}::uuid`);
    else {
      const typed = key === p.PERFORMANCE_SORT_KEY_DIMENSION ? value : Number(value);
      if (typeof typed === 'number' && !Number.isFinite(typed)) badCursor();
      query = query.where(
        sql<boolean>`(${expression} ${sql.raw(descending ? '<' : '>')} ${typed} or (${expression} = ${typed} and id > ${id}::uuid) or ${expression} is null)`,
      );
    }
  }
  const fetched = await query
    .orderBy(sql`${expression} ${sql.raw(descending ? 'desc' : 'asc')} nulls last`)
    .orderBy('id')
    .limit(pageSize + 1)
    .execute();
  const rows = fetched.slice(0, pageSize);
  const comparisons =
    options.compare_snapshot_id && rows.length
      ? await new WorkspaceScope(options.workspaceId)
          .selectFrom(db, 'performance_dimension_stats')
          .selectAll()
          .where('project_id', '=', options.projectId)
          .where('snapshot_id', '=', options.compare_snapshot_id)
          .where('dimension', '=', dimension)
          .where(
            'dimension_key',
            'in',
            rows.map((r) => r.dimension_key),
          )
          .execute()
      : [];
  const peers = new Map(comparisons.map((r) => [r.dimension_key, tableMetrics(r.metrics)]));
  let nextCursor = null;
  if (fetched.length > pageSize) {
    const last = rows.at(-1)!;
    const value =
      key === p.PERFORMANCE_SORT_KEY_DIMENSION
        ? last.dimension_key
        : numberOrNull(record(last.metrics)[key]);
    nextCursor = Buffer.from(
      JSON.stringify({ fp: fingerprint, k: [value === null ? '' : String(value), last.id] }),
    )
      .toString('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_');
  }
  return {
    dimension,
    items: rows.map((r) => ({
      dimension_key: r.dimension_key,
      display_value: r.display_value,
      metrics: tableMetrics(r.metrics),
      comparison_metrics: peers.get(r.dimension_key) ?? null,
    })),
    next_cursor: nextCursor,
    total_count: integer(record(snapshot.dimension_counts)[dimension]) ?? 0,
    page_size: pageSize,
  };
}
