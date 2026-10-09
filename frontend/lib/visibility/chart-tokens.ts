import { dataFillClass } from '@/components/ui/data-tone';

const SERIES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Literal classes stay visible to Tailwind's source scanner. */
const STROKE: Record<(typeof SERIES)[number], string> = {
  1: 'stroke-chart-1',
  2: 'stroke-chart-2',
  3: 'stroke-chart-3',
  4: 'stroke-chart-4',
  5: 'stroke-chart-5',
  6: 'stroke-chart-6',
  7: 'stroke-chart-7',
  8: 'stroke-chart-8',
};

/** Per series: its line stroke, its swatch fill (the `DataTone` series fill) and its colour. */
export const CHART_TOKENS: readonly {
  strokeClass: string;
  swatchClass: string;
  color: string;
}[] = SERIES.map((series) => ({
  strokeClass: STROKE[series],
  swatchClass: dataFillClass({ series }),
  color: `var(--color-chart-${series})`,
}));

/**
 * Trend comparisons intentionally start at series 2 (series 1 is the tracked
 * brand) and use six colours.
 */
export const TREND_COMPARISON_SERIES = [2, 3, 4, 5, 6, 7] as const;

export const TREND_COMPARISON_STROKES = TREND_COMPARISON_SERIES.map(
  (series) => CHART_TOKENS[series - 1].strokeClass,
);
