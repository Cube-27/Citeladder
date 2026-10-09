/** Literal classes stay visible to Tailwind's source scanner. */
export const CHART_TOKENS: readonly {
  strokeClass: string;
  swatchClass: string;
  color: string;
}[] = [
  { strokeClass: 'stroke-chart-1', swatchClass: 'bg-chart-1', color: 'var(--color-chart-1)' },
  { strokeClass: 'stroke-chart-2', swatchClass: 'bg-chart-2', color: 'var(--color-chart-2)' },
  { strokeClass: 'stroke-chart-3', swatchClass: 'bg-chart-3', color: 'var(--color-chart-3)' },
  { strokeClass: 'stroke-chart-4', swatchClass: 'bg-chart-4', color: 'var(--color-chart-4)' },
  { strokeClass: 'stroke-chart-5', swatchClass: 'bg-chart-5', color: 'var(--color-chart-5)' },
  { strokeClass: 'stroke-chart-6', swatchClass: 'bg-chart-6', color: 'var(--color-chart-6)' },
  { strokeClass: 'stroke-chart-7', swatchClass: 'bg-chart-7', color: 'var(--color-chart-7)' },
  { strokeClass: 'stroke-chart-8', swatchClass: 'bg-chart-8', color: 'var(--color-chart-8)' },
];

/**
 * Trend comparisons intentionally start at series 2 (series 1 is the tracked
 * brand) and use six colours.
 */
export const TREND_COMPARISON_SERIES = [2, 3, 4, 5, 6, 7] as const;

export const TREND_COMPARISON_STROKES = TREND_COMPARISON_SERIES.map(
  (series) => CHART_TOKENS[series - 1].strokeClass,
);
