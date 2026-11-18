import type { VisibilityTrendPoint } from '@citeladder/contracts/visibility-trends';
import { appPolicy } from './config';

export type TrendMetric = (typeof appPolicy.metrics)[number]['value'];
type Row = VisibilityTrendPoint['rankings'][number];

export const isTrendMetric = (value: string): value is TrendMetric =>
  appPolicy.metrics.some((metric) => metric.value === value);

/** Position is a rank, every other metric a 0–1 rate. */
export const isRate = (metric: TrendMetric) => metric !== 'avg_position';

function rowValue(row: Row | undefined, metric: TrendMetric): number | null {
  if (!row) return null;
  switch (metric) {
    case 'brand_mention_rate':
      return row.mention_rate;
    case 'owned_citation_rate':
      return row.citation_rate;
    case 'share_of_voice':
      return row.share_of_voice;
    case 'avg_position':
      return row.avg_position;
    case 'win_rate':
      return row.win_rate ?? null;
    default: {
      const unhandled: never = metric;
      return unhandled;
    }
  }
}

const rowOf = (point: VisibilityTrendPoint, competitor: string | null) =>
  point.rankings.find((row) => (competitor ? row.name === competitor : row.is_brand));

/** Why a point has no value: a win rate over no answer naming a tracked brand is not applicable. */
export const trendGap = (
  point: VisibilityTrendPoint,
  metric: TrendMetric,
  competitor: string | null,
) =>
  metric === 'win_rate' && rowOf(point, competitor)?.win_answers === 0
    ? 'Not applicable'
    : 'Unavailable';

/**
 * One point's persisted value for the metric: the brand's own headline fields,
 * or a named competitor's ranking row. Null is unmeasured, never zero.
 */
export function trendValue(
  point: VisibilityTrendPoint,
  metric: TrendMetric,
  competitor: string | null,
): number | null {
  if (competitor) return rowValue(rowOf(point, competitor), metric);
  switch (metric) {
    case 'brand_mention_rate':
      return point.brand_mention_rate;
    case 'owned_citation_rate':
      return point.owned_citation_rate;
    case 'share_of_voice':
      return point.sov.mention;
    case 'avg_position':
      return point.avg_position;
    case 'win_rate':
      return rowValue(rowOf(point, null), metric);
    default: {
      const unhandled: never = metric;
      return unhandled;
    }
  }
}
