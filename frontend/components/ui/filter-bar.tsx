import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { ChevronDown } from 'lucide-react';

import {
  AllFilters,
  ChoiceOptions,
  focusFieldOnEntry,
  type FilterDefinition,
} from '@/components/ui/all-filters';
import { SOFT_FIELD_BOX } from '@/components/ui/input';
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/ui/menu';
import { cn } from '@/lib/utils';

/**
 * What a route puts in its control row. A route passes these to its screen
 * template's `controls` (or a `DataTable`'s `toolbar`); it never renders a
 * `FilterBar` itself, so no feature draws a toolbar of its own. The slots are
 * the row's order: a page fills slots, it never arranges controls.
 */
export type FilterBarProps = Readonly<{
  /**
   * A `SegmentedControl` choosing which set the content shows (Active |
   * Archived, Domains | URLs, Issues | Advisories). It leads the row.
   */
  view?: ReactNode;
  /** A `SearchField`, after the view. */
  search?: ReactNode;
  /**
   * Every filter of the list, after the search: period, market, engine, kind,
   * status and typed values alike, each its own trigger ("Page kind: All page
   * kinds"), in this order. Beside a search, more than four share the one All
   * filters menu.
   */
  filters?: readonly FilterDefinition[];
  /**
   * What the row shows, in caption at its end: the count describing the list
   * ("12 issues · 40 pages") or a live note ("Updating data… Previous data
   * shown."). A row that reports status passes `null` while idle, so its live
   * region is mounted before the first update and that update is announced.
   */
  status?: ReactNode;
  /** The row's one action on what it lists (Export), last. */
  actions?: ReactNode;
}>;

/**
 * FilterBar — the control row at the top of every list and report page, in
 * one order on every page: the view, the search, the filters, then the count
 * and the action at the row's end. Every control is 32px and 8 apart.
 *
 * Each filter is its own trigger: the row has room for them. Only a row that
 * also holds a search and more than `FILTERS_BESIDE_SEARCH` filters groups
 * them in All filters (with the count of active ones), so the search keeps
 * its width. From 900px it is one row and the search (200 at least) takes the
 * spare width; when the row cannot hold everything, controls wrap as whole
 * units, the actions at the line's right end, and nothing shrinks below its
 * label. Below 900px the bar stacks into one full-width column in the same
 * order.
 *
 * `status` is a polite live region, so a filtered result count is announced.
 */
export function FilterBar({ view, search, filters, status, actions }: FilterBarProps) {
  // A search takes every spare pixel of its line, so the count needs no push.
  const searched = Boolean(search);
  const grouped = searched && (filters?.length ?? 0) > FILTERS_BESIDE_SEARCH;
  return (
    <fieldset
      data-filter-bar=""
      aria-label="Search and filters"
      className="rail:flex-row rail:flex-wrap rail:items-center flex min-h-[var(--control-md)] w-full min-w-0 flex-col items-stretch gap-2"
    >
      {view ? <div className="flex max-w-full min-w-0 shrink-0">{view}</div> : null}
      {search ? (
        <div className="rail:flex-[1_1_200px] rail:min-w-[200px] min-w-0">{search}</div>
      ) : null}
      {filters && grouped ? (
        <div className="flex min-w-0 shrink-0">
          <AllFilters filters={filters} />
        </div>
      ) : null}
      {filters && !grouped
        ? filters.map((filter) => (
            <div key={filter.id} className="flex min-w-0 shrink-0">
              <FilterMenu filter={filter} />
            </div>
          ))
        : null}
      {status === undefined ? null : (
        <output
          aria-live="polite"
          className={cn(
            'type-caption flex min-w-0 items-center gap-2 truncate empty:hidden',
            searched ? 'rail:shrink-0 whitespace-nowrap' : 'rail:ms-auto rail:shrink',
          )}
        >
          {status}
        </output>
      )}
      {actions ? (
        // At the line's end; after a pushed count it keeps the 8 between them.
        <div
          className={cn(
            'ms-auto flex max-w-full min-w-0 shrink-0 items-center justify-end gap-2',
            !searched && '[output:not(:empty)+&]:ms-0',
          )}
        >
          {actions}
        </div>
      ) : null}
    </fieldset>
  );
}

/** Beside a search, the most filters the row shows as their own triggers. */
const FILTERS_BESIDE_SEARCH = 4;

/**
 * FilterControls — filters outside a control row (a record header's): a lone
 * filter as its own trigger, two or more behind All filters. `align` is the
 * edge the menu lines up with (`end` at a row's far right).
 */
export function FilterControls({
  filters,
  align = 'start',
}: Readonly<{ filters: readonly FilterDefinition[]; align?: 'start' | 'end' }>) {
  const [only, ...rest] = filters;
  if (!only) return null;
  if (rest.length > 0) return <AllFilters filters={filters} align={align} />;
  return <FilterMenu filter={only} align={align} />;
}

/** One filter as its own trigger ("Label: Value") that opens its options. */
function FilterMenu({
  filter,
  align = 'start',
}: Readonly<{ filter: FilterDefinition; align?: 'start' | 'end' }>) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger
          label={filter.label}
          value={filter.valueLabel}
          active={!filter.isDefault}
          sizeTo={
            filter.kind === 'choice'
              ? filter.groups.flatMap((group) => group.options.map((option) => option.label))
              : [filter.valueLabel]
          }
        />
      </MenuTrigger>
      <MenuContent align={align} onFocus={focusFieldOnEntry}>
        {filter.kind === 'choice' ? <ChoiceOptions filter={filter} /> : filter.content}
      </MenuContent>
    </Menu>
  );
}

/**
 * FilterTrigger — the button that opens a single-choice menu (`FilterChoice`),
 * drawn on the Select trigger recipe at the one filter width.
 *
 * The accessible name always contains the visible value, so a voice user can
 * say what is on screen.
 *
 *   - `label` names the filter ("Surface"). With a `value` it prints as a
 *     muted prefix ("Surface: All surfaces"); `hideLabel` keeps it for
 *     assistive tech only, so the name still contains the visible value.
 *   - `active` marks a choice moved off its default (`data-active`); the
 *     value says how.
 *   - `sizeTo` lists every value the trigger can show. The trigger then takes
 *     the width of the longest of them instead of the one filter width, so it
 *     fits its content and still never resizes when the choice changes.
 *
 * Use it as `<MenuTrigger asChild><FilterTrigger …/></MenuTrigger>`; it
 * forwards the ref and the trigger's props to the button.
 */
export function FilterTrigger({
  label,
  value,
  hideLabel = false,
  active = false,
  sizeTo,
  className,
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
    label: string;
    value?: ReactNode;
    hideLabel?: boolean;
    active?: boolean;
    /** Every value the trigger can show; it takes the longest one's width. */
    sizeTo?: readonly string[];
    ref?: Ref<HTMLButtonElement>;
  }
>) {
  const fit = sizeTo !== undefined && sizeTo.length > 0;
  return (
    <button
      ref={ref}
      type="button"
      data-active={active || undefined}
      data-fit={fit || undefined}
      className={cn(
        SOFT_FIELD_BOX,
        'focus-input flex min-w-0 shrink-0 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-45',
        fit ? 'w-auto max-w-full' : 'shell:w-[var(--filter-width)]',
        className,
      )}
      {...props}
    >
      {fit ? (
        // Every option is laid in the same cell, unseen, so the cell is as
        // wide as the longest and the visible value never resizes the trigger.
        // The sizers draw their text as generated content: it adds no
        // readable text and no accessible name.
        <span className="grid min-w-0">
          {/* Only the longest labels can set the width; a long option list
              (every tracked prompt) must not become one node per option. */}
          {[...new Set(sizeTo)]
            .sort((a, b) => b.length - a.length)
            .slice(0, 6)
            .map((size) => (
              <span
                key={size}
                aria-hidden
                data-size={hideLabel ? size : `${label}: ${size}`}
                className="invisible col-start-1 row-start-1 whitespace-nowrap after:content-[attr(data-size)]"
              />
            ))}
          <span className="col-start-1 row-start-1 flex min-w-0">
            <FilterTriggerText label={label} value={value} hideLabel={hideLabel} />
          </span>
        </span>
      ) : (
        <FilterTriggerText label={label} value={value} hideLabel={hideLabel} />
      )}
      <ChevronDown className="text-ink-2 ms-auto size-4 shrink-0" aria-hidden />
    </button>
  );
}

function FilterTriggerText({
  label,
  value,
  hideLabel,
}: Readonly<{ label: string; value?: ReactNode; hideLabel: boolean }>) {
  if (value === undefined || value === null) return <span className="truncate">{label}</span>;
  return (
    <span className="min-w-0 truncate">
      <span className={hideLabel ? 'sr-only' : 'text-ink-2'}>{label}:</span>{' '}
      <span className="text-ink">{value}</span>
    </span>
  );
}

/**
 * FilterChoice — a single choice of how one card draws (a chart's plotted
 * metric), in that card's header actions: the trigger names the choice by
 * its visible value (`label` stays for assistive tech), the menu lists the
 * options. A list's filters are never this: they live in its control row.
 */
export function FilterChoice<T extends string>({
  label,
  menuLabel = label,
  value,
  defaultValue,
  options,
  onChange,
  fit = false,
}: Readonly<{
  /** The trigger's accessible name prefix, e.g. "Select date range". */
  label: string;
  /** The heading inside the menu; defaults to `label`. */
  menuLabel?: string;
  value: T;
  /** The unfiltered value; any other value marks the trigger active. */
  defaultValue?: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Size the trigger to its longest option instead of the one filter width. */
  fit?: boolean;
}>) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger
          label={label}
          hideLabel
          value={options.find((option) => option.value === value)?.label ?? label}
          active={defaultValue !== undefined && value !== defaultValue}
          sizeTo={fit ? options.map((option) => option.label) : undefined}
        />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{menuLabel}</MenuLabel>
        <MenuRadioGroup value={value}>
          {options.map((option) => (
            <MenuRadioItem
              key={option.value}
              value={option.value}
              onSelect={() => onChange(option.value)}
            >
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
