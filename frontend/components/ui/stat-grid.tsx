'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { listRowClasses } from '@/components/ui/list-row';
import { MetricValue } from '@/components/ui/metric-value';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import { availabilityLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * StatGrid — label/value facts beyond `MetricGroup`'s three to five headline
 * figures: a URL's delivery facts, an execution's evidence counts, a catalog's
 * inventory, a surface's rates.
 *
 * Nine local tiles did this job with four label roles, three ways of showing
 * absence and their own boxes. A stat here is always the same anatomy, in
 * this order, with the 4px label→value rhythm the cell owns:
 *
 *   label (`label` role, optional marker at its end)
 *   value (`figureSm` by default; `figure` for a grid of headline-weight facts)
 *   delta (optional, a `Delta`)
 *   detail (optional, `caption`)
 *
 * `value: null` is the missing state — the muted dash at the value's own size
 * with `missingLabel` (default "Not measured") as its accessible name, exactly
 * as `MetricValue` renders it. A string or number is the measured value; any
 * other node (a `Badge`, an `UnavailableValue` for a workflow state) is
 * rendered as given.
 *
 * Surfaces (`surface`):
 *   - `open`  — facts on the containing card; no boxes, the grid gap separates.
 *   - `well`  — each fact on a recessed well (evidence inside a drawer).
 *   - `band`  — one strip divided by hairlines, like a `MetricGroup` that wraps.
 *
 * An item with `onSelect` or `href` is pressable: the whole cell is the target,
 * reached by Tab and named by `actionLabel` (the visible number alone, "3", is
 * not a name anyone can act on). `selected` makes a toggle (`aria-pressed`)
 * and paints the shared selected-row face.
 */
const COLUMNS = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
} as const;

export type StatGridColumns = keyof typeof COLUMNS;
export type StatGridSurface = 'open' | 'well' | 'band';
export type StatValueSize = 'figure' | 'figureSm';

/** A value's ink when the value itself is the finding. */
const TONE = {
  default: '',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  info: 'text-info-text',
  muted: 'text-muted',
} as const;

type StatTone = keyof typeof TONE;

type StatAction =
  | { onSelect?: undefined; href?: undefined; actionLabel?: undefined; selected?: undefined }
  | { onSelect: () => void; href?: undefined; actionLabel: string; selected?: boolean }
  | { href: string; onSelect?: undefined; actionLabel: string; selected?: undefined };

export type StatItemProps = Readonly<
  {
    label: ReactNode;
    value: ReactNode;
    /** Accessible name of the missing state. Defaults to "Not measured". */
    missingLabel?: string;
    loading?: boolean;
    delta?: ReactNode;
    detail?: ReactNode;
    tone?: StatTone;
    /** A small mark at the end of the label row (series key, info hint). */
    marker?: ReactNode;
    className?: string;
  } & StatAction
>;

const SURFACE_GRID: Record<StatGridSurface, string> = {
  open: 'gap-x-6 gap-y-4',
  well: 'gap-2',
  // Every cell draws its right and bottom hairline; the grid is pulled 1px out
  // under the clip so the outermost ones fall outside it. That draws only the
  // internal seams for any column count and any number of items.
  band: '-me-px -mb-px',
};

const SURFACE_ITEM: Record<StatGridSurface, string> = {
  open: '',
  well: panelClasses({ tone: 'well', pad: 'compact' }),
  band: 'border-border-subtle border-e border-b p-[var(--card-padding)]',
};

function StatValue({
  value,
  missingLabel,
  loading,
  size,
  tone,
}: Readonly<{
  value: ReactNode;
  missingLabel: string;
  loading: boolean;
  size: StatValueSize;
  tone: StatTone;
}>) {
  if (loading || value === null || typeof value === 'string' || typeof value === 'number') {
    return (
      <MetricValue
        value={value === null ? null : String(value ?? '')}
        label={missingLabel}
        size={size}
        loading={loading}
        tone={TONE[tone]}
        className="min-w-0 [overflow-wrap:anywhere]"
      />
    );
  }
  return <div className={textRole(size, cn('min-w-0', TONE[tone]))}>{value}</div>;
}

function StatAnatomy({ item, size }: Readonly<{ item: StatItemProps; size: StatValueSize }>) {
  return (
    <>
      <dt className={textRole('label', 'flex min-w-0 items-center justify-between gap-2')}>
        <span className="min-w-0 truncate">{item.label}</span>
        {item.marker}
      </dt>
      <dd className="min-w-0">
        <StatValue
          value={item.value}
          missingLabel={item.missingLabel ?? availabilityLabel('not_measured')}
          loading={item.loading ?? false}
          size={size}
          tone={item.tone ?? 'default'}
        />
      </dd>
      {item.delta ? <dd className="min-w-0">{item.delta}</dd> : null}
      {item.detail ? <dd className={textRole('caption', 'min-w-0')}>{item.detail}</dd> : null}
    </>
  );
}

/** The stretched target: the whole cell is pressable, the facts stay a `dl`. */
function StatTarget({ item }: Readonly<{ item: StatItemProps }>) {
  const cover = 'focus-ring absolute inset-0 rounded-[inherit]';
  if (item.href) {
    return <Link to={item.href} aria-label={item.actionLabel} className={cover} />;
  }
  return (
    <button
      type="button"
      onClick={item.onSelect}
      aria-label={item.actionLabel}
      aria-pressed={item.selected}
      className={cover}
    />
  );
}

/** The grid's value role and surface, so `StatItem` children inherit them. */
const StatGridContext = createContext<{ size: StatValueSize; surface: StatGridSurface }>({
  size: 'figureSm',
  surface: 'open',
});

export function StatItem(item: StatItemProps) {
  const { size, surface } = useContext(StatGridContext);
  const pressable = Boolean(item.onSelect || item.href);
  return (
    <div
      className={cn(
        'grid min-w-0 content-start gap-1',
        SURFACE_ITEM[surface],
        pressable &&
          cn('relative', listRowClasses({ selected: item.selected ?? false, interactive: true })),
        item.className,
      )}
    >
      <StatAnatomy item={item} size={size} />
      {pressable ? <StatTarget item={item} /> : null}
    </div>
  );
}

export function StatGrid({
  items,
  children,
  columns = 4,
  surface = 'open',
  size = 'figureSm',
  label,
  className,
}: Readonly<{
  /** The facts, in reading order. Or pass `StatItem` children. */
  items?: readonly (StatItemProps & { key: string })[];
  children?: ReactNode;
  columns?: StatGridColumns;
  surface?: StatGridSurface;
  /** Value role for every item. */
  size?: StatValueSize;
  /** Accessible name for the group, when the section heading does not give one. */
  label?: string;
  className?: string;
}>) {
  const grid = (
    <StatGridContext.Provider value={{ size, surface }}>
      <dl
        aria-label={label}
        className={cn('grid min-w-0', COLUMNS[columns], SURFACE_GRID[surface], className)}
      >
        {items?.map(({ key, ...item }) => (
          <StatItem key={key} {...item} />
        ))}
        {children}
      </dl>
    </StatGridContext.Provider>
  );
  return surface === 'band' ? <div className="min-w-0 overflow-hidden">{grid}</div> : grid;
}
