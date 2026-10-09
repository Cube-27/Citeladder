'use client';

import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * FilterRow — the control band's one composition: search, then filters, then
 * a status line, then trailing actions (export, columns) pushed to the end.
 *
 * Seven filter rows had grown their own recipe, and the search field had a
 * different width on every page (224, 256, 288, 320, 384px, and "flex-1 with
 * a minimum"). The width is a role now, decided here once:
 *
 *   - `sm` (224px) — a short list or a secondary search inside a card.
 *   - `md` (288px) — the default for a route's control band.
 *   - `lg` (up to 384px, growing into spare width) — search is the row's
 *     primary control (Prompts, Internal links).
 *
 * Below `sm` the search takes the full row and the filters wrap beneath it.
 * The row adds no box, rule or height of its own: the `PageShell` control band
 * (or the card header holding it) owns those.
 */
const SEARCH_WIDTH = {
  sm: 'w-full sm:w-56',
  md: 'w-full sm:w-72',
  lg: 'w-full sm:max-w-96 sm:min-w-56 sm:flex-1',
} as const;

export type SearchWidth = keyof typeof SEARCH_WIDTH;

export function FilterRow({
  search,
  searchWidth = 'md',
  children,
  status,
  actions,
  className,
}: Readonly<{
  /** A `SearchField`. */
  search?: ReactNode;
  searchWidth?: SearchWidth;
  /** The filters: `FilterTrigger` dropdowns, `FilterChip`s, a `SegmentedControl`. */
  children?: ReactNode;
  /** A live note such as "Updating data… Previous data shown." */
  status?: ReactNode;
  /** Row-level actions, aligned to the end. */
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn('flex w-full min-w-0 flex-wrap items-center gap-2', className)}>
      {search ? <div className={cn('min-w-0', SEARCH_WIDTH[searchWidth])}>{search}</div> : null}
      {children}
      {/* A row that reports status keeps its live region mounted even while
          idle (`status={null}`), so the first update is announced. */}
      {status === undefined ? null : (
        <output className="type-caption flex min-w-0 items-center gap-2 empty:hidden">
          {status}
        </output>
      )}
      {actions ? <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * FilterTrigger — the button that opens a filter menu.
 *
 * Replaces Visibility's `FilterButton` (whose `aria-label` replaced the visible
 * value, so the name a voice user had to say was not on screen), Analytics'
 * range trigger and the Prompts "Filter" button with its accent count pill.
 *
 *   - `label` names the filter ("Surface"). With a `value` it prints as a
 *     muted prefix ("Surface: All surfaces"); `hideLabel` keeps it for
 *     assistive tech only, so the name still contains the visible value.
 *   - `count` is the number of active selections in a multi-select menu: a
 *     neutral count badge, announced as "N active".
 *   - `active` marks a filter moved off its default with the selected tint, so
 *     a narrowed view is visible at a glance; the value or count says how.
 *
 * Use it as `<DropdownTrigger asChild><FilterTrigger …/></DropdownTrigger>`;
 * it forwards the ref and the trigger's props to the button.
 */
export function FilterTrigger({
  label,
  value,
  hideLabel = false,
  count,
  active = false,
  icon: Icon,
  className,
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
    label: string;
    value?: ReactNode;
    hideLabel?: boolean;
    count?: number;
    active?: boolean;
    icon?: LucideIcon;
    ref?: Ref<HTMLButtonElement>;
  }
>) {
  const showCount = typeof count === 'number' && count > 0;
  return (
    <Button
      ref={ref}
      variant="secondary"
      size="sm"
      data-active={active || showCount || undefined}
      className={cn((active || showCount) && 'bg-selected', className)}
      {...props}
    >
      {Icon ? <Icon className="text-muted size-4 shrink-0" aria-hidden /> : null}
      <FilterTriggerText label={label} value={value} hideLabel={hideLabel} />
      {showCount ? (
        <>
          <span
            aria-hidden
            className="type-badge bg-neutral-bg text-foreground min-w-5 rounded-full px-2 tabular-nums"
          >
            {count}
          </span>
          <span className="sr-only">, {count} active</span>
        </>
      ) : null}
      <ChevronDown className="text-muted size-4 shrink-0" aria-hidden />
    </Button>
  );
}

function FilterTriggerText({
  label,
  value,
  hideLabel,
}: Readonly<{ label: string; value?: ReactNode; hideLabel: boolean }>) {
  if (value === undefined || value === null) return <span>{label}</span>;
  return (
    <span className="min-w-0 truncate">
      <span className={hideLabel ? 'sr-only' : 'text-muted'}>{label}:</span>{' '}
      <span className="text-foreground">{value}</span>
    </span>
  );
}
