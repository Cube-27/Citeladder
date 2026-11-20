import type { ReactNode } from 'react';

import type { MarkerShape, SeriesTone } from '@/components/ui/step-chart-parts';
import { printed } from '@/components/ui/absence';
import { POP_FACE } from '@/components/ui/slip';
import { textRole } from '@/components/ui/typography';
import type { Formatted } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The app's Recharts look, after HeroUI's charts (owner, 2026-11-19): no axis
 * or tick lines, muted caption ticks, a faint dashed horizontal grid, a dashed
 * cursor, gradient fills and a tooltip card. Colours are the series roles, so
 * you stay the accent and a rival keeps its page-wide hue.
 */
export const seriesColor = (tone: SeriesTone) => `var(--color-data-${tone})`;

/** Axis props every cartesian chart shares: no lines, muted caption ticks. */
export const AXIS_PROPS = {
  axisLine: false,
  tickLine: false,
  tickMargin: 8,
  tick: { fill: 'var(--color-ink-2)', fontSize: 12 },
} as const;

/** The grid: horizontal only, dashed, in the rule role. */
export const GRID_PROPS = {
  vertical: false,
  strokeDasharray: '3 3',
  stroke: 'var(--color-rule)',
} as const;

/** The hover cursor: a dashed vertical line on a line or area chart. */
export const LINE_CURSOR = { stroke: 'var(--color-control-line)', strokeDasharray: '4 4' };

/** The hover cursor on a bar chart: a soft band behind the bar. */
export const BAR_CURSOR = { fill: 'var(--color-state-hover)' };

/**
 * The colour role a `fill-*` or `stroke-*` class names (`fill-positive`), as its
 * CSS variable; a `fill-current` takes its `text-*` role.
 */
export function roleColor(classes: string, prefix: 'fill' | 'stroke'): string {
  const named = (kind: string) =>
    classes.split(/\s+/).find((name) => name.startsWith(`${kind}-`) && name !== `${kind}-current`);
  const role = (named(prefix) ?? named('text'))?.replace(/^[a-z]+-/, '');
  return role ? `var(--color-${role})` : 'var(--color-well)';
}

/** A series' mark: a dot, or its marker shape when a key tells lines apart by shape. */
function SeriesIndicator({ color, shape }: Readonly<{ color: string; shape?: MarkerShape }>) {
  return (
    <svg aria-hidden viewBox="-5 -5 10 10" className="size-2 shrink-0 overflow-visible">
      <ShapeMark x={0} y={0} r={4} shape={shape ?? 'circle'} color={color} />
    </svg>
  );
}

/** A marker of `shape` centred on (x, y), filled in `color` with a surface outline. */
export function ShapeMark({
  x,
  y,
  r,
  shape,
  color,
  outline = false,
}: Readonly<{
  x: number;
  y: number;
  r: number;
  shape: MarkerShape;
  color: string;
  outline?: boolean;
}>) {
  const paint = {
    fill: color,
    stroke: outline ? 'var(--color-surface)' : 'none',
    strokeWidth: outline ? 2 : 0,
  };
  switch (shape) {
    case 'square':
      return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1} {...paint} />;
    case 'diamond':
      return <path d={`M${x} ${y - r}l${r} ${r}-${r} ${r}-${r}-${r}z`} {...paint} />;
    case 'triangle':
      return <path d={`M${x} ${y - r}l${r} ${r * 1.8}h-${r * 2}z`} {...paint} />;
    case 'circle':
      return <circle cx={x} cy={y} r={r} {...paint} />;
    default: {
      const unknown: never = shape;
      return unknown;
    }
  }
}

export type TooltipRow = Readonly<{
  name: string;
  /** Its indicator's colour, a CSS colour (`seriesColor(tone)`). */
  color: string;
  value: Formatted;
  shape?: MarkerShape;
  mark?: ReactNode;
}>;

/**
 * The tooltip card: a muted header (the point), then one row per series of
 * its indicator, its name in `ink-2` and its value at the end in `ink`.
 */
export function ChartTooltipCard({
  title,
  note,
  rows,
}: Readonly<{ title: string; note?: string; rows: readonly TooltipRow[] }>) {
  return (
    <div className={cn(POP_FACE, 'grid min-w-44 gap-2 px-3 py-2')}>
      <p className={textRole('captionStrong', 'text-ink-2 tabular-nums')}>{title}</p>
      {rows.map((row) => (
        <div key={row.name} className={textRole('caption', 'flex min-w-0 items-center gap-2')}>
          <SeriesIndicator color={row.color} shape={row.shape} />
          {row.mark}
          <span className="text-ink-2 min-w-0 flex-1 truncate">{row.name}</span>
          <span className="text-ink font-medium tabular-nums">{printed(row.value)}</span>
        </div>
      ))}
      {note ? <p className={textRole('caption', 'text-warning')}>{note}</p> : null}
    </div>
  );
}
