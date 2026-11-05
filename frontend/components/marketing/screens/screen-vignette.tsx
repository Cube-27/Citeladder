import type { ReactNode } from 'react';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_AXIS_TEXT, CHART_FILL, CHART_STROKE, chartPath } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

import type { Change } from './demo-data';
import { ScreenDelta } from './screen-parts';

/**
 * The parts of a vignette: a 480-wide screen (`width={480}`) that shows
 * one subject in one card, at close to the size it is displayed, so it reads
 * at real size instead of as a whole page shrunk down.
 */

/** A vignette card's content width: the 480 screen less the card's 20px inset each side. */
export const VIGNETTE_PLOT_WIDTH = 440;

/** The vignette's one card: its title row with a range or count at the right, then the content. */
export function VignetteCard({
  title,
  badge,
  children,
}: Readonly<{ title: string; badge: ReactNode; children: ReactNode }>) {
  return (
    <Card className="cl-screen-vcard">
      <CardHeader actions={badge}>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  );
}

/** The headline figure and its change. */
export function VignetteFigure({
  value,
  change,
  period,
}: Readonly<{ value: string; change: Change; period: string }>) {
  return (
    <p className="cl-screen-vfigure">
      <span className="type-figure">{value}</span>
      <ScreenDelta change={change} period={period} />
    </p>
  );
}

/** Three figures in a row, each under its label and over its change. */
export function VignetteStats({
  stats,
}: Readonly<{ stats: readonly Readonly<{ label: string; value: string; change: Change }>[] }>) {
  return (
    <dl className="cl-screen-vstats">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="type-caption">{stat.label}</dt>
          <dd className="type-figure">{stat.value}</dd>
          <dd>
            <ScreenDelta change={stat.change} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A share of the row's whole as a thin `data-1` bar on the `chart-grid` track. */
export function VignetteBar({ share }: Readonly<{ share: number }>) {
  const width = Math.min(1, Math.max(0, share)) * 100;
  return (
    <span aria-hidden className="cl-screen-vbar">
      <span className={CHART_FILL[1]} style={{ width: `${width}%` }} />
    </span>
  );
}

/**
 * The vignette's list: 3 to 5 rows on a fixed column template named by
 * `layout` (see screens.css), so a row's columns never follow its text.
 */
export function VignetteRows<Row>({
  layout,
  rows,
  rowKey,
  children,
}: Readonly<{
  layout: 'sources' | 'themes' | 'engines' | 'shelf';
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  children: (row: Row) => ReactNode;
}>) {
  return (
    <ul className={cn('cl-screen-vrows', `cl-screen-vrows--${layout}`)}>
      {rows.map((row) => (
        <li key={rowKey(row)} className="cl-screen-vrow">
          {children(row)}
        </li>
      ))}
    </ul>
  );
}

/** Room for the y-axis labels at the left and the week labels under the plot. */
const AXIS_LEFT = 40;
const AXIS_BOTTOM = 20;
const PAD_TOP = 6;

/**
 * One series over time, drawn for a vignette: the TrendChart's marks (a 2px
 * `data-1` line, `chart-grid` gridlines, 12px mono axis text) at a fixed
 * width, since a screen has a fixed natural size and a still has no hover.
 * The area under the line is a flat, faint `data-1`; the latest point has a
 * dot. Every week is read from the hidden list.
 */
export function ScreenAreaChart({
  label,
  weeks,
  values,
  width,
  height,
  ticks,
  format,
}: Readonly<{
  /** What the chart shows, e.g. "Weekly clicks from Google Search". */
  label: string;
  weeks: readonly string[];
  values: readonly number[];
  width: number;
  height: number;
  /** The y-axis gridlines, lowest first; the first and last bound the plot. */
  ticks: readonly [number, number, ...number[]];
  format: (value: number) => string;
}>) {
  const low = ticks[0];
  const high = ticks.at(-1) ?? low + 1;
  const plotWidth = width - AXIS_LEFT;
  const bottom = height - AXIS_BOTTOM;
  const x = (index: number) =>
    AXIS_LEFT + (values.length > 1 ? (index / (values.length - 1)) * plotWidth : 0);
  const y = (value: number) => PAD_TOP + (1 - (value - low) / (high - low)) * (bottom - PAD_TOP);
  const points = values.map((value, index) => [x(index), y(value)] as const);
  const line = chartPath(points);
  const last = points.at(-1);
  const first = points[0];
  const area =
    first && last
      ? `${line}L${last[0].toFixed(1)} ${bottom}L${first[0].toFixed(1)} ${bottom}Z`
      : '';
  return (
    <figure className="cl-screen-area">
      <svg
        aria-hidden
        focusable="false"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
      >
        {ticks.map((tick) => {
          const tickY = Math.round(y(tick)) + 0.5;
          return (
            <g key={tick}>
              <line
                x1={AXIS_LEFT}
                x2={width}
                y1={tickY}
                y2={tickY}
                className="stroke-chart-grid"
                strokeWidth={1}
              />
              <text x={0} y={tickY + 4} className={CHART_AXIS_TEXT}>
                {format(tick)}
              </text>
            </g>
          );
        })}
        <path d={area} className={CHART_FILL[1]} fillOpacity={0.12} />
        <path
          d={line}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={CHART_STROKE[1]}
        />
        {last ? <circle cx={last[0]} cy={last[1]} r={4} className={CHART_FILL[1]} /> : null}
        <text x={AXIS_LEFT} y={height - 4} className={CHART_AXIS_TEXT}>
          {weeks[0]}
        </text>
        <text x={width} y={height - 4} textAnchor="end" className={CHART_AXIS_TEXT}>
          {weeks.at(-1)}
        </text>
      </svg>
      <figcaption className="sr-only">
        {`${label}: ${values.map((value, index) => `${weeks[index] ?? ''} ${format(value)}`).join(', ')}`}
      </figcaption>
    </figure>
  );
}
