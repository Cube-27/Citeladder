import { dataFillClass } from '@/components/ui/data-tone';
import { cycled } from '@/lib/utils';

const SERIES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
type ChartSeries = (typeof SERIES)[number];

/** Literal classes stay visible to Tailwind's source scanner. */
const STROKE: Record<ChartSeries, string> = {
  1: 'stroke-data-1',
  2: 'stroke-data-2',
  3: 'stroke-data-3',
  4: 'stroke-data-other',
  5: 'stroke-data-other',
  6: 'stroke-data-other',
  7: 'stroke-data-other',
  8: 'stroke-data-other',
};

const COLOR: Record<ChartSeries, string> = {
  1: 'var(--color-data-1)',
  2: 'var(--color-data-2)',
  3: 'var(--color-data-3)',
  4: 'var(--color-data-other)',
  5: 'var(--color-data-other)',
  6: 'var(--color-data-other)',
  7: 'var(--color-data-other)',
  8: 'var(--color-data-other)',
};

/**
 * The tokens for the `index`th series, wrapping after eight: its line stroke,
 * its swatch fill (the `DataTone` series fill) and its colour.
 */
export function chartToken(index: number) {
  const series = cycled(SERIES, index);
  return {
    strokeClass: STROKE[series],
    swatchClass: dataFillClass({ series }),
    color: COLOR[series],
  };
}

/**
 * Trend comparisons intentionally start at series 2 (series 1 is the tracked
 * brand) and use six colours.
 */
export const TREND_COMPARISON_SERIES = [2, 3, 4, 5, 6, 7] as const;

/** The comparison series and stroke for the `index`th competitor line. */
export function comparisonSeries(index: number) {
  const series = cycled(TREND_COMPARISON_SERIES, index);
  return { series, strokeClass: STROKE[series] };
}
