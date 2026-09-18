'use client';

import type { ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The frame every product chart draws inside.
 *
 * Charts used to be hand-rolled SVG with a fixed viewBox stretched to fit,
 * which meant the drawing was scaled unevenly: `preserveAspectRatio="none"`
 * over a 640-unit box in a 900px column squashed every glyph horizontally
 * while leaving its height alone, and the gutters — sized in viewBox units for
 * a width nobody was rendering at — put the rotated axis title through the
 * tick values beside it. A real layout engine sizes to the container it is
 * actually given, so neither failure is expressible here.
 *
 * `config` names the series once. Its `color` is a CSS variable from the
 * chart ladder in `globals.css`, never a literal: the tokens are the only
 * place a series colour is decided, and `check:policy` enforces that.
 */
export type ChartConfig = Record<string, { label: string; color: string }>;

/** `--color-<key>` for every series, so Recharts props can name the token. */
function seriesVariables(config: ChartConfig): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config).map(([key, entry]) => [`--color-${key}`, entry.color]),
  );
}

export function ChartContainer({
  config,
  children,
  className,
  height = 280,
  description,
}: Readonly<{
  config: ChartConfig;
  /** One Recharts chart element. */
  children: ReactElement;
  className?: string;
  height?: number;
  /**
   * What the chart says to a reader who cannot see it.
   *
   * Required in practice: the drawing is `aria-hidden` because a screen
   * reader handed a tree of `<path>` elements learns nothing from it, so this
   * sentence is the only reading such a reader gets.
   */
  description: string;
}>) {
  return (
    <div className={cn('w-full', className)} style={seriesVariables(config)}>
      <p className="sr-only">{description}</p>
      <div aria-hidden style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Axis defaults: no tick marks, one hairline, and room for the labels. */
export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  tick: { fontSize: 11, className: 'fill-muted' },
} as const;

/**
 * A legend whose entries are buttons, not swatches.
 *
 * Reading a specific value off a five-line chart is the legend's job: hovering
 * or focusing an entry brings its line forward and dims the rest. Hover and
 * focus do the same thing, so the comparison is available without a pointer.
 */
export function ChartLegend({
  config,
  active,
  onActivate,
}: Readonly<{
  config: ChartConfig;
  active: string | null;
  onActivate: (key: string | null) => void;
}>) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {Object.entries(config).map(([key, entry]) => (
        <li key={key}>
          <button
            type="button"
            onMouseEnter={() => onActivate(key)}
            onMouseLeave={() => onActivate(null)}
            onFocus={() => onActivate(key)}
            onBlur={() => onActivate(null)}
            className={cn(
              'focus-ring flex items-center gap-1.5 transition-opacity',
              active && active !== key ? 'opacity-45' : 'opacity-100',
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className={textRole('meta', 'max-w-[18ch] truncate')}>{entry.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The shared hover card: the bucket, then every series that has a value. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatValue,
}: Readonly<{
  active?: boolean;
  payload?: readonly { name?: string; dataKey?: string; value?: number; color?: string }[];
  label?: ReactNode;
  formatValue: (value: number) => string;
}>) {
  if (!active || !payload?.length) return null;
  // A series with no measurement in this bucket is ABSENT from the card, not
  // listed at zero: the gap in the line and the gap here say the same thing.
  const measured = payload.filter((entry) => typeof entry.value === 'number');
  if (!measured.length) return null;
  return (
    <div className="tooltip-panel bg-surface-inverse text-on-inverse shadow-elevated rounded-[var(--radius-overlay)] px-2 py-1.5">
      <p className="text-xs font-medium">{label}</p>
      <ul className="grid gap-0.5">
        {measured.map((entry) => (
          <li key={entry.dataKey ?? entry.name} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="max-w-[16ch] truncate">{entry.name}</span>
            <span className="ml-auto tabular-nums">{formatValue(entry.value as number)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
