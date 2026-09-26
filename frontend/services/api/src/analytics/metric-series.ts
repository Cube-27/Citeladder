/**
 * The snapshot-JSONB to DTO read shape of a metric series.
 *
 * Ports `metric_series_points` from `app/domain/analytics/schemas.py`, which
 * the traffic reads still use: non-list fragments and non-object entries
 * degrade to nothing rather than failing the read.
 */
import { pyStrOrEmpty } from '../python/text.ts';

export type MetricSeriesPoint = { date: string; value: number | null };

/** Pydantic's lax `float | None` for a stored JSON value; anything else is a 500. */
function laxFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value.trim()))) {
    return Number(value.trim());
  }
  throw new TypeError('metric series value is not a number');
}

export function metricSeriesPoints(raw: unknown): MetricSeriesPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => {
      return entry !== null && typeof entry === 'object' && !Array.isArray(entry);
    })
    .map((entry) => ({ date: pyStrOrEmpty(entry.date), value: laxFloat(entry.value) }));
}
