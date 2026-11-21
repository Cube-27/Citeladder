import type { ReactNode } from 'react';

import { chartFill, chartPath, chartStroke } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

import type { Change } from './demo-data';
import { ScreenDelta } from './screen-parts';
import './screen-vignette.css';

export function Vignette({
  title,
  meta,
  badge,
  children,
}: Readonly<{
  title: string;
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
  lead?: ReactNode;
  label: ReactNode;
  secondary?: ReactNode;
  extra?: ReactNode;
  value: ReactNode;
}>;

export type VignetteFourRows = readonly [VignetteRow, VignetteRow, VignetteRow, VignetteRow];

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

export function VignetteBar({ share }: Readonly<{ share: number }>) {
  const width = Math.min(1, Math.max(0, share)) * 100;
  return (
    <span aria-hidden className="cl-vig-bar">
      <span className={chartFill(1)} style={{ width: `${width}%` }} />
    </span>
  );
}

const PLOT = 100;

export function VignetteChart({
  label,
  weeks,
  values,
  ticks,
  format,
}: Readonly<{
  label: string;
  weeks: readonly string[];
  values: readonly number[];
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
