import { useState, type KeyboardEvent } from 'react';

import {
  CHART_HEIGHT_PX,
  CHART_PLOT_FRAME,
  chartTicks,
  useChartWidth,
  type ChartHeight,
} from '@/components/ui/chart';
import { ChartFrame, ChartTable, chartTipLeft } from '@/components/ui/chart-frame';
import { SHEET_FACE } from '@/components/ui/slip';
import { AXIS_TEXT } from '@/components/ui/step-chart-parts';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/** One stacked part: its name and its fill (`fill-*` for the bar, `bg-*` for the key). */
export type StackedSeries = Readonly<{ name: string; fill: string }>;

/** One bar: a value per series, bottom up. */
export type StackedBar = Readonly<{
  key: string;
  /** The bar in full: the tooltip's title and the table's column. */
  label: string;
  /** The short form under the axis. */
  axisLabel: string;
  values: readonly number[];
  /** Not comparable with the bar before: marked across the plot, with its note. */
  breakBefore?: boolean;
}>;

const PAD = { left: 40, right: 8, top: 12, bottom: 24 } as const;

/**
 * StackedBarChart — counts per period, stacked, in plain SVG: `chart-grid`
 * gridlines, a key under the plot, and a tooltip card on hover or on focus
 * with the arrow keys. A bar not comparable with the one before
 * (`breakBefore`) carries the trend charts' method-change marker, a dashed
 * `warning` rule with a dot at the top, before it. A visually hidden table
 * carries every value.
 */
export function StackedBarChart({
  label,
  series,
  bars,
  breakNote,
  height: heightRole = 'sm',
}: Readonly<{
  /** What the chart shows, e.g. "Claims over time". */
  label: string;
  series: readonly StackedSeries[];
  bars: readonly StackedBar[];
  /** Why a marked bar is not comparable, in the key, tooltip and table. */
  breakNote: string;
  height?: ChartHeight;
}>) {
  const [plotRef, width] = useChartWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const height = CHART_HEIGHT_PX[heightRole];
  const ticks = chartTicks(0, Math.max(1, ...bars.map((bar) => sum(bar.values))), 4);
  const top = ticks.at(-1) ?? 1;
  const plotHeight = height - PAD.top - PAD.bottom;
  const step = (width - PAD.left - PAD.right) / Math.max(1, bars.length);
  const barWidth = Math.max(4, Math.min(32, step * 0.6));
  const center = (index: number) => PAD.left + step * (index + 0.5);
  const y = (value: number) => PAD.top + plotHeight * (1 - value / top);
  const labelEvery = Math.ceil(bars.length / Math.max(1, Math.floor(width / 72)));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? bars.length - 1;
    if (event.key === 'ArrowRight') setActive(Math.min(bars.length - 1, from + 1));
    else if (event.key === 'ArrowLeft') setActive(Math.max(0, from - 1));
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  };
  const shown = active === null ? undefined : bars[active];
  const marked = bars.some((bar) => bar.breakBefore);
  return (
    <ChartFrame
      height={heightRole}
      summary={`${label}: ${bars.length} ${bars.length === 1 ? 'period' : 'periods'}.`}
    >
      <div className="flex min-w-0 flex-col gap-4">
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the plot is a keyboard-readable group */}
        <div // NOSONAR -- a keyboard-readable plot has no native element
          ref={plotRef}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- no native element reads a plot bar by bar
          role="group"
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the arrow keys need focus on the plot
          tabIndex={bars.length ? 0 : undefined} // NOSONAR -- the arrow keys need focus on the plot
          aria-label={`${label}. Use the left and right arrow keys to read each bar.`}
          onKeyDown={onKeyDown}
          onMouseMove={(event) => {
            if (!bars.length) return;
            const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
            const index = Math.floor((x - PAD.left) / step);
            setActive(Math.min(bars.length - 1, Math.max(0, index)));
          }}
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          className={CHART_PLOT_FRAME}
          style={{ height }}
        >
          <svg
            aria-hidden
            focusable="false"
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block overflow-visible"
          >
            {ticks.map((tick) => {
              const at = Math.round(y(tick)) + 0.5;
              return (
                <g key={`tick-${tick}`}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={at}
                    y2={at}
                    shapeRendering="crispEdges"
                    className="stroke-rule"
                  />
                  <text
                    x={PAD.left - 8}
                    y={at}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className={AXIS_TEXT}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}
            {bars.map((bar, index) => {
              const edge = center(index) - step / 2;
              let base = 0;
              return (
                <g
                  key={bar.key}
                  className={cn(active !== null && active !== index && 'opacity-60')}
                >
                  {bar.breakBefore ? (
                    <g data-version-marker="">
                      <line
                        x1={edge}
                        x2={edge}
                        y1={PAD.top}
                        y2={PAD.top + plotHeight}
                        strokeDasharray="4 3"
                        className="stroke-warning"
                      />
                      <circle cx={edge} cy={PAD.top} r={3} className="fill-warning" />
                    </g>
                  ) : null}
                  {bar.values.map((value, part) => {
                    const from = base;
                    base += value;
                    return value ? (
                      <rect
                        key={series[part]?.name ?? part}
                        x={center(index) - barWidth / 2}
                        y={y(base)}
                        width={barWidth}
                        height={y(from) - y(base)}
                        className={series[part]?.fill}
                      />
                    ) : null;
                  })}
                  {index % labelEvery === 0 ? (
                    <text
                      x={center(index)}
                      y={height - 6}
                      textAnchor="middle"
                      className={AXIS_TEXT}
                    >
                      {bar.axisLabel}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {shown && active !== null ? (
            <div
              aria-hidden
              className={cn(
                SHEET_FACE,
                'rounded-card pointer-events-none absolute z-20 flex w-54 flex-col gap-1 p-3',
              )}
              style={{ left: chartTipLeft(center(active), width), top: PAD.top }}
            >
              <p className="type-caption tabular-nums">{shown.label}</p>
              {series.map((entry, part) => (
                <div
                  key={entry.name}
                  className={textRole('caption', 'flex items-center gap-2 text-ink')}
                >
                  <Swatch fill={entry.fill} />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="tabular-nums">{shown.values[part]}</span>
                </div>
              ))}
              {shown.breakBefore ? <p className={textRole('caption')}>{breakNote}</p> : null}
            </div>
          ) : null}
        </div>
        <ul aria-hidden className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
          {series.map((entry) => (
            <li key={entry.name} className={textRole('caption', 'inline-flex items-center gap-2')}>
              <Swatch fill={entry.fill} />
              {entry.name}
            </li>
          ))}
          {marked ? (
            <li className={textRole('caption', 'inline-flex items-center gap-2')}>
              <span className="border-warning inline-block h-3 w-0 shrink-0 border-l border-dashed" />
              {breakNote}
            </li>
          ) : null}
        </ul>
        <ChartTable
          label={label}
          columns={bars.map((bar) => bar.label)}
          rows={series.map((entry, part) => ({
            name: entry.name,
            values: bars.map((bar) => String(bar.values[part] ?? 0)),
          }))}
          notes={bars.flatMap((bar) => (bar.breakBefore ? [`${bar.label}: ${breakNote}`] : []))}
        />
      </div>
    </ChartFrame>
  );
}

function Swatch({ fill }: Readonly<{ fill: string }>) {
  return <span className={cn('rounded-mark inline-block size-2.5 shrink-0', fill)} />;
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}
