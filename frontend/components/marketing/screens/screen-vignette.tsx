import type { ReactNode } from 'react';

import { chartFill, chartPath, chartStroke } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

import type { Change } from './demo-data';
import { ScreenDelta } from './screen-parts';
import './screen-vignette.css';

/**
 * The website's one card image: a vignette. One white card at the width of
 * its well (never scaled), a title over an optional meta line with an
 * optional badge at the right, then one body: four rows, three figures over
 * a small chart, or a short panel. Every vignette uses the same type scale,
 * so neighbouring tiles read alike.
 */
export function Vignette({
  title,
  meta,
  badge,
  children,
}: Readonly<{
  title: string;
  /** One line under the title saying what the card counts. */
  meta?: string;
  badge?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="cl-vig">
      <div className="cl-vig-head">
        <div className="cl-vig-heading">
          <p className="cl-vig-title">{title}</p>
          {meta && <p className="cl-vig-meta">{meta}</p>}
        </div>
        {badge && <div className="cl-vig-badge">{badge}</div>}
      </div>
      {children}
    </div>
  );
}

export type VignetteRow = Readonly<{
  key: string;
  /** A 20px mark or icon before the label. */
  lead?: ReactNode;
  label: ReactNode;
  /** A muted line under the label. */
  secondary?: ReactNode;
  /** A middle column (a bar, marks or a badge) dropped when the card is narrow. */
  extra?: ReactNode;
  /** The figure or state at the right. */
  value: ReactNode;
}>;

/** Exactly four rows, so every row-list vignette is the same height as its neighbours. */
export type VignetteFourRows = readonly [VignetteRow, VignetteRow, VignetteRow, VignetteRow];

/**
 * The first four of a demo list as rows. The demo data is static, so a list
 * shorter than four fails the build, never a visitor's page.
 */
export function fourRows<Item>(
  items: readonly Item[],
  toRow: (item: Item) => VignetteRow,
): VignetteFourRows {
  const [a, b, c, d] = items;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error(`A vignette list needs four rows; it has ${items.length}.`);
  }
  return [toRow(a), toRow(b), toRow(c), toRow(d)];
}

/**
 * The vignette's list. Every row in a list has the same parts, so its
 * columns line up; the middle column drops below 420px of card width.
 */
export function VignetteRows({
  label,
  rows,
  ordered = false,
}: Readonly<{ label: string; rows: VignetteFourRows; ordered?: boolean }>) {
  const List = ordered ? 'ol' : 'ul';
  const lead = rows.some((row) => row.lead !== undefined);
  const extra = rows.some((row) => row.extra !== undefined);
  return (
    <List
      aria-label={label}
      className={cn('cl-vig-rows', lead && 'cl-vig-rows--lead', extra && 'cl-vig-rows--extra')}
    >
      {rows.map((row) => (
        <li key={row.key} className="cl-vig-row">
          {lead && <span className="cl-vig-lead">{row.lead}</span>}
          <span className="cl-vig-main">
            <span className="cl-vig-label">{row.label}</span>
            {row.secondary && <span className="cl-vig-secondary">{row.secondary}</span>}
          </span>
          {extra && <span className="cl-vig-extra">{row.extra}</span>}
          <span className="cl-vig-value">{row.value}</span>
        </li>
      ))}
    </List>
  );
}

type VignetteStat = Readonly<{ label: string; value: string; change: Change }>;

/** Three figures in a row, each label over its value over its change. */
export function VignetteStats({
  stats,
}: Readonly<{ stats: readonly [VignetteStat, VignetteStat, VignetteStat] }>) {
  return (
    <dl className="cl-vig-stats">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="cl-vig-stat-label">{stat.label}</dt>
          <dd className="cl-vig-stat-value">{stat.value}</dd>
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
    <span aria-hidden className="cl-vig-bar">
      <span className={chartFill(1)} style={{ width: `${width}%` }} />
    </span>
  );
}

/** Plot coordinates run 0–100 on both axes and stretch to the plot's box. */
const PLOT = 100;

/**
 * One series over time at the width of its card: the TrendChart's marks (a
 * 2px `data-1` line that never scales, `chart-grid` gridlines, a faint area
 * and a dot on the latest point) in a stretched plot, with the axis labels
 * in HTML at real size. Every week is read from the hidden caption.
 */
export function VignetteChart({
  label,
  weeks,
  values,
  ticks,
  format,
}: Readonly<{
  /** What the chart shows, e.g. "Weekly clicks from Google Search". */
  label: string;
  weeks: readonly string[];
  values: readonly number[];
  /** The y-axis gridlines, lowest first; the first and last bound the plot. */
  ticks: readonly [number, number, ...number[]];
  format: (value: number) => string;
}>) {
  const low = ticks[0];
  const high = ticks.at(-1) ?? low + 1;
  const x = (index: number) => (values.length > 1 ? (index / (values.length - 1)) * PLOT : 0);
  const y = (value: number) => (1 - (value - low) / (high - low)) * PLOT;
  const points = values.map((value, index) => [x(index), y(value)] as const);
  const line = chartPath(points);
  const last = points.at(-1);
  const area = last ? `${line}L${PLOT} ${PLOT}L0 ${PLOT}Z` : '';
  const readings = values.map((value, index) => `${weeks[index] ?? ''} ${format(value)}`);
  return (
    <figure className="cl-vig-chart">
      <div className="cl-vig-plot" aria-hidden>
        <div className="cl-vig-yaxis">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: `${y(tick)}%` }}>
              {format(tick)}
            </span>
          ))}
        </div>
        <div className="cl-vig-area">
          {/* Absolutely placed, so the plot's grid row sets its height and the
              square viewBox never does (a hero frame has no height to fill). */}
          <svg
            focusable="false"
            viewBox={`0 0 ${PLOT} ${PLOT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 block size-full overflow-visible"
          >
            {ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={PLOT}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-chart-grid"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={area} className={chartFill(1)} fillOpacity={0.12} />
            <path
              d={line}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={chartStroke(1)}
            />
          </svg>
          {last ? (
            <span
              className={cn('cl-vig-dot', chartFill(1))}
              style={{ left: `${last[0]}%`, top: `${last[1]}%` }}
            />
          ) : null}
        </div>
        <div className="cl-vig-xaxis">
          <span>{weeks[0]}</span>
          <span>{weeks.at(-1)}</span>
        </div>
      </div>
      <figcaption className="sr-only">{`${label}: ${readings.join(', ')}`}</figcaption>
    </figure>
  );
}
