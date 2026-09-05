'use client';

import { useId, useState } from 'react';

import {
  axisDomainMax,
  formatAxisTick,
  formatMetric,
  isInvertedMetric,
  seriesMax,
  type PerformanceChartPoint,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';
import { cn } from '@/lib/utils';

/**
 * The combined Performance chart: every selected GSC metric on one hoverable
 * plot, with its comparison window drawn dashed beside it.
 *
 * Two decisions carry the design:
 *
 * 1. The x-axis is POSITIONAL (day 1..N), not dated. A comparison window
 *    covers different calendar dates than the selection, so position is the
 *    only honest shared axis; each point keeps its own real date for the
 *    tooltip.
 * 2. Each metric gets its OWN value domain. Clicks and impressions differ by
 *    orders of magnitude, and CTR is a fraction while position is a rank — a
 *    shared axis would flatten every series but the largest into a straight
 *    line. Position additionally inverts, because a smaller rank is better.
 *
 * A null bucket is an unmeasured one: the line breaks there rather than
 * dropping to zero.
 */

const PADDING = { top: 12, right: 12, bottom: 22, left: 12 };
const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 220;

export type ChartSeries = {
  key: PerformanceMetricKey;
  label: string;
  /** Token-driven stroke, one per metric. */
  color: string;
  selected: PerformanceChartPoint[];
  comparison: PerformanceChartPoint[] | null;
};

type Projected = { x: number; y: number };

function domainFor(series: ChartSeries): { min: number; max: number } {
  const max = seriesMax(series.selected, series.comparison ?? []);
  if (isInvertedMetric(series.key)) {
    // Rank charts read best from 1 at the top down to a nice ceiling.
    return { min: 0, max: axisDomainMax(Math.max(max, 1)) };
  }
  return { min: 0, max: axisDomainMax(max) };
}

function project(
  points: PerformanceChartPoint[],
  domain: { min: number; max: number },
  inverted: boolean,
  columnCount: number,
): (Projected | null)[] {
  const innerWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const span = Math.max(1, columnCount - 1);
  const range = domain.max - domain.min || 1;
  return points.map((point, index) => {
    if (point.value === null) return null;
    const ratio = (point.value - domain.min) / range;
    const clamped = Math.max(0, Math.min(1, ratio));
    return {
      x: PADDING.left + (columnCount > 1 ? (index / span) * innerWidth : innerWidth / 2),
      // Inverted metrics (position) put the BEST value at the top.
      y: PADDING.top + innerHeight * (inverted ? clamped : 1 - clamped),
    };
  });
}

function toPath(points: (Projected | null)[]): string[] {
  const segments: string[] = [];
  let current: Projected[] = [];
  for (const point of points) {
    if (point === null) {
      if (current.length > 1) segments.push(toLine(current));
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length > 1) segments.push(toLine(current));
  return segments;
}

function toLine(points: Projected[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

function chartSummary(series: readonly ChartSeries[], columnCount: number): string {
  if (!series.length) return 'No metrics selected';
  if (!columnCount) return 'No measured buckets in the selected range';
  const names = series.map((entry) => entry.label).join(', ');
  return `${names} over ${columnCount} day${columnCount === 1 ? '' : 's'}${
    series.some((entry) => entry.comparison) ? ', with comparison period' : ''
  }`;
}

export function PerformanceChart({
  series,
  className,
}: Readonly<{ series: readonly ChartSeries[]; className?: string }>) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const columnCount = series.reduce(
    (max, entry) => Math.max(max, entry.selected.length, entry.comparison?.length ?? 0),
    0,
  );
  const summary = chartSummary(series, columnCount);

  if (!series.length || columnCount === 0) {
    return (
      <div
        className={cn('text-muted flex h-[220px] items-center justify-center text-sm', className)}
      >
        {summary}
      </div>
    );
  }

  const innerWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  // Hover bands share project()'s geometry: points sit at
  // left + (i / (n - 1)) * innerWidth, so a band is centred on its point
  // rather than tiling from the left edge. Without this the crosshair drifts
  // off the line and the last band falls short of the chart's right edge.
  const pointX = (index: number) =>
    PADDING.left + (columnCount > 1 ? (index / (columnCount - 1)) * innerWidth : innerWidth / 2);
  const bandWidth = columnCount > 1 ? innerWidth / (columnCount - 1) : innerWidth;

  return (
    // The pointer handler lives on the wrapper, not the svg: the svg is a
    // non-interactive graphic, and its <title> already names it for
    // assistive technology.
    <div className={cn('relative', className)} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-[220px] w-full"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
      >
        <title id={titleId}>{summary}</title>
        {/* No horizontal gridlines: the lines themselves carry the shape, and
            banding the plot competes with them for attention. Only the
            BASELINE is drawn, so a series still reads against a floor. */}
        <line
          x1={PADDING.left}
          x2={VIEW_WIDTH - PADDING.right}
          y1={VIEW_HEIGHT - PADDING.bottom}
          y2={VIEW_HEIGHT - PADDING.bottom}
          className="stroke-border-subtle"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {series.map((entry) => {
          const domain = domainFor(entry);
          const inverted = isInvertedMetric(entry.key);
          const selected = project(entry.selected, domain, inverted, columnCount);
          const comparison = entry.comparison
            ? project(entry.comparison, domain, inverted, columnCount)
            : [];
          return (
            <g key={entry.key}>
              {toPath(comparison).map((d, index) => (
                <path
                  key={`comparison-${index}`}
                  d={d}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeOpacity={0.65}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {toPath(selected).map((d, index) => (
                <path
                  key={`selected-${index}`}
                  d={d}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          );
        })}
        {hover !== null ? (
          <line
            x1={pointX(hover)}
            x2={pointX(hover)}
            y1={PADDING.top}
            y2={VIEW_HEIGHT - PADDING.bottom}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {Array.from({ length: columnCount }, (_, index) => (
          <rect
            key={index}
            // Clamped at both ends so the first and last bands stop at the
            // chart edges instead of overhanging the plot area.
            x={Math.max(PADDING.left, pointX(index) - bandWidth / 2)}
            y={PADDING.top}
            width={
              Math.min(VIEW_WIDTH - PADDING.right, pointX(index) + bandWidth / 2) -
              Math.max(PADDING.left, pointX(index) - bandWidth / 2)
            }
            height={VIEW_HEIGHT - PADDING.top - PADDING.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
      </svg>
      {hover !== null ? <ChartTooltip series={series} index={hover} /> : null}
      <div className="grid gap-2">
        <div className="text-muted flex justify-between px-3 text-xs">
          <span className="mono">1</span>
          <span className="mono">{columnCount}</span>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((entry) => {
            const domain = domainFor(entry);
            return (
              <li key={entry.key} className="text-muted flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.label}
                <span className="mono">0–{formatAxisTick(entry.key, domain.max)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * The hover readout. Shows each selected metric's value at this position and,
 * when a comparison is active, the comparison bucket's own date and value —
 * so a dashed point is never ambiguous about which day it represents.
 */
function ChartTooltip({
  series,
  index,
}: Readonly<{ series: readonly ChartSeries[]; index: number }>) {
  const selectedDate = series[0]?.selected[index]?.date ?? null;
  const comparisonDate = series[0]?.comparison?.[index]?.date ?? null;
  return (
    <output className="bg-panel border-border-subtle shadow-elevated pointer-events-none absolute top-2 right-2 grid gap-1 rounded-[var(--radius-control)] border px-3 py-2 text-xs">
      <p className="text-secondary">
        Day <span className="mono">{index + 1}</span>
        {selectedDate ? ` · ${selectedDate}` : ''}
      </p>
      <ul className="grid gap-0.5">
        {series.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted">{entry.label}</span>
            <span className="mono">
              {formatMetric(entry.key, entry.selected[index]?.value ?? null)}
            </span>
            {entry.comparison ? (
              <span className="text-muted mono">
                vs {formatMetric(entry.key, entry.comparison[index]?.value ?? null)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {comparisonDate ? <p className="text-muted">Comparison day · {comparisonDate}</p> : null}
    </output>
  );
}
