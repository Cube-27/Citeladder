'use client';

import { useId, useState } from 'react';

import { ChartAxes } from '@/components/ui/chart-axes';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * Several equally-weighted lines sharing one scale, with a legend.
 *
 * The sibling of `TrendChart`, and separate from it on purpose. That chart has
 * a PRIMARY series with marks, links and version markers, and comparison lines
 * drawn quietly behind it; every affordance the comparisons gave up was given
 * up so the primary could keep it. Here no series is primary — five cited
 * domains are five answers to the same question — so the whole hierarchy that
 * makes `TrendChart` work is the wrong shape, and bolting an "all equal" mode
 * onto it would leave one component answering two questions.
 *
 * Reading a specific value is the legend's job, not a tooltip's: hovering a
 * legend entry brings its line forward and dims the rest, which is the
 * comparison a reader actually makes on a five-line chart.
 */

type SeriesPoint = {
  /** Null is unavailable and renders as a gap, never as zero. */
  value: number | null;
  label: string;
};

export type ChartSeries = {
  key: string;
  label: string;
  /** Stroke class from the categorical chart tokens, e.g. `stroke-chart-2`. */
  strokeClass: string;
  /** Matching fill for the legend swatch, e.g. `bg-chart-2`. */
  swatchClass: string;
  points: readonly SeriesPoint[];
};

const PADDING = 8;
const GUTTER_LEFT = 30;
const GUTTER_BOTTOM = 18;

function segmentsOf(
  points: readonly SeriesPoint[],
  positions: readonly number[],
  project: (value: number) => number,
): string[] {
  const runs: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length) runs.push(current);
      current = [];
      return;
    }
    current.push({ x: positions[index], y: project(point.value) });
  });
  if (current.length) runs.push(current);
  return runs
    .filter((run) => run.length > 1)
    .map((run) =>
      run
        .map((at, index) => `${index === 0 ? 'M' : 'L'}${at.x.toFixed(1)},${at.y.toFixed(1)}`)
        .join(' '),
    );
}

/** First, middle and last, pulled inward at the ends so they stay in the plot. */
function xTicksOf(labels: readonly string[], positions: readonly number[]) {
  if (!labels.length) return [];
  const indexes =
    labels.length > 2 ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1] : [0];
  const unique = [...new Set(indexes)];
  return unique.map((index, order) => ({
    at: positions[index],
    text: labels[index],
    anchor: (unique.length === 1
      ? 'middle'
      : order === 0
        ? 'start'
        : order === unique.length - 1
          ? 'end'
          : 'middle') as 'start' | 'middle' | 'end',
  }));
}

function yTicksOf(innerHeight: number, domainMax: number, format: (value: number) => string) {
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
    at: PADDING + innerHeight * (1 - fraction),
    text: format(domainMax * fraction),
  }));
}

/** What the chart says to a reader who cannot see it. */
function description(series: readonly ChartSeries[], format: (value: number) => string): string {
  if (!series.length) return 'No sources to chart.';
  return series
    .map((one) => {
      const values = one.points.map((point) => point.value).filter((v): v is number => v !== null);
      if (!values.length) return `${one.label}: not measured`;
      return `${one.label}: from ${format(values[0])} to ${format(values[values.length - 1])}`;
    })
    .join('. ');
}

export function SeriesChart({
  series,
  labels,
  width = 640,
  height = 200,
  domainMax = 100,
  formatTick = (value) => `${Math.round(value)}%`,
  xAxisLabel,
  yAxisLabel,
  className,
}: Readonly<{
  series: readonly ChartSeries[];
  /** One axis label per bucket; every series shares these x positions. */
  labels: readonly string[];
  width?: number;
  height?: number;
  domainMax?: number;
  formatTick?: (value: number) => string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  className?: string;
}>) {
  const titleId = useId();
  const [active, setActive] = useState<string | null>(null);
  const innerWidth = width - GUTTER_LEFT - PADDING;
  const innerHeight = height - PADDING - GUTTER_BOTTOM;
  const ceiling = domainMax > 0 ? domainMax : 100;
  const positions = labels.map((_label, index) =>
    labels.length < 2
      ? GUTTER_LEFT + innerWidth / 2
      : GUTTER_LEFT + (index / (labels.length - 1)) * innerWidth,
  );
  const project = (value: number) =>
    PADDING + innerHeight * (1 - Math.max(0, Math.min(ceiling, value)) / ceiling);

  return (
    <div className={cn('grid gap-3', className)}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((one) => (
          <li key={one.key}>
            <button
              type="button"
              // Hover and focus do the same thing, so the comparison is
              // available without a pointer.
              onMouseEnter={() => setActive(one.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(one.key)}
              onBlur={() => setActive(null)}
              className={cn(
                'focus-ring flex items-center gap-1.5 transition-opacity',
                active && active !== one.key ? 'opacity-45' : 'opacity-100',
              )}
            >
              <span className={cn('size-2 shrink-0 rounded-full', one.swatchClass)} aria-hidden />
              <span className={textRole('meta', 'max-w-[18ch] truncate')}>{one.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {/* The plot is a picture of the legend above it, which is focusable and
          names every series. Hiding the drawing keeps the same reading from
          being announced twice. */}
      <p id={titleId} className="sr-only">
        {description(series, formatTick)}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
        className="h-[200px] w-full"
      >
        <ChartAxes
          x={GUTTER_LEFT}
          y={PADDING}
          innerWidth={innerWidth}
          innerHeight={innerHeight}
          ticks={yTicksOf(innerHeight, ceiling, formatTick)}
          xTicks={xTicksOf(labels, positions)}
          xAxisLabel={xAxisLabel}
          yAxisLabel={yAxisLabel}
          height={height}
        />
        {series.map((one) =>
          segmentsOf(one.points, positions, project).map((path, index) => (
            <path
              key={`${one.key}-${index}`}
              d={path}
              fill="none"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={cn(
                one.strokeClass,
                'transition-opacity',
                active && active !== one.key ? 'opacity-25' : 'opacity-100',
              )}
            />
          )),
        )}
      </svg>
    </div>
  );
}
