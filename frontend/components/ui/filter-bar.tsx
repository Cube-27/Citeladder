import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import type { FilterDefinition } from '@/components/ui/all-filters';
import { Button } from '@/components/ui/button';
import { FilterChip, FilterTrigger, ValueChip } from '@/components/ui/filter-chip';
import { FiltersMenu } from '@/components/ui/filters-menu';
import { Icon } from '@/components/ui/icon';
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/ui/menu';
import { batchUrlWrites } from '@/lib/navigation/url-state';
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
   * Every filter of the list, after the search, in the page's order. The
   * first four with an `icon` are chips in the row; the rest share Filters
   * (a lone one is a chip of its own).
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

/** The most icon chips a row shows; any more go into Filters. */
const ROW_ICON_CHIPS = 4;

/**
 * Which filters are chips in the row and which share Filters: up to four
 * icon filters in the page's order, then the rest behind Filters, or as a
 * value chip of its own when only one without an icon is left.
 */
export function placeFilters(filters: readonly FilterDefinition[]): Readonly<{
  chips: readonly FilterDefinition[];
  menu: readonly FilterDefinition[];
}> {
  const icons = filters.filter((filter) => filter.icon).slice(0, ROW_ICON_CHIPS);
  const rest = filters.filter((filter) => !icons.includes(filter));
  const [only] = rest;
  if (rest.length === 1 && only && !only.icon) return { chips: [...icons, only], menu: [] };
  return { chips: icons, menu: rest };
}

/**
 * The data window, at the row's end while its period chip shows only its
 * icon (owner, 2026-11-18): the window stays in sight without its value
 * printed on the chip.
 */
function dataWindow(chips: readonly FilterDefinition[]): string | undefined {
  const period = chips.find((filter) => filter.icon === 'period' && filter.isDefault);
  return period ? (period.windowLabel ?? period.valueLabel) : undefined;
}

/**
 * FilterBar — the control row at the top of every list and report page, in
 * one order on every page: the view, the search, the filter chips, Filters
 * and the chips of the filters set in it, Clear once anything is set, then
 * the data window, the count and the action at the row's end. Every control
 * is 32px and 8 apart. The row is left-aligned, so a chip whose width follows
 * its value moves only what comes after it.
 *
 * From 900px it is one row and the search is 256 wide (200 at least), so it
 * never runs up to a view or tabs beside the row (owner, 2026-11-18); when the
 * row cannot hold everything, controls wrap as whole units, the actions at
 * the line's right end. Below 900px the bar stacks into one full-width column
 * in the same order.
 *
 * `status` is a polite live region, so a filtered result count is announced.
 */
export function FilterBar({ view, search, filters = [], status, actions }: FilterBarProps) {
  const { chips, menu } = placeFilters(filters);
  const set = filters.filter((filter) => !filter.isDefault);
  const windowLabel = dataWindow(chips);
  return (
    <fieldset
      data-filter-bar=""
      aria-label="Search and filters"
      className="rail:flex-row rail:flex-wrap rail:items-center flex min-h-[var(--control-md)] w-full min-w-0 flex-col items-stretch gap-2"
    >
      {view ? <div className="flex max-w-full min-w-0 shrink-0">{view}</div> : null}
      {search ? <div className="rail:w-64 rail:min-w-[200px] min-w-0">{search}</div> : null}
      {chips.map((filter) => (
        <div key={filter.id} className="flex min-w-0 shrink-0">
          <FilterChip filter={filter} />
        </div>
      ))}
      {menu.length > 0 ? (
        <div className="flex min-w-0 shrink-0">
          <FiltersMenu filters={menu} />
        </div>
      ) : null}
      {menu
        .filter((filter) => !filter.isDefault)
        .map((filter) => (
          <div key={filter.id} className="flex min-w-0 shrink-0">
            <ValueChip filter={filter} />
          </div>
        ))}
      {set.length > 0 ? (
        <div className="flex shrink-0">
          <Button
            variant="quiet"
            onClick={() =>
              batchUrlWrites(() => {
                for (const filter of set) filter.reset();
              })
            }
          >
            <Icon icon={X} />
            Clear
          </Button>
        </div>
      ) : null}
      {windowLabel ? (
        // Outside the live region: the window is on the chip's name already.
        <span className="type-caption rail:ms-auto rail:shrink min-w-0 truncate">
          {windowLabel}
          {status ? ' ·' : null}
        </span>
      ) : null}
      {status === undefined ? null : (
        <output
          aria-live="polite"
          className={cn(
            'type-caption flex min-w-0 items-center gap-2 truncate empty:hidden',
            !windowLabel && 'rail:ms-auto',
            'rail:shrink',
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
            '[output:not(:empty)+&]:ms-0',
          )}
        >
          {actions}
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * FilterControls — filters outside a control row (a record header's): a lone
 * filter as its own chip, two or more behind Filters. `align` is the edge the
 * menu lines up with (`end` at a row's far right).
 */
export function FilterControls({
  filters,
  align = 'start',
}: Readonly<{ filters: readonly FilterDefinition[]; align?: 'start' | 'end' }>) {
  const [only, ...rest] = filters;
  if (!only) return null;
  if (rest.length > 0) return <FiltersMenu filters={filters} align={align} />;
  return <FilterChip filter={only} align={align} />;
}

/**
 * FilterChoice — a single choice of how one card draws (a chart's plotted
 * metric), in that card's header actions: a chip printing its value, the
 * menu headed by `label`. A list's filters are never this: they live in its
 * control row.
 */
export function FilterChoice<T extends string>({
  label,
  value,
  defaultValue,
  options,
  onChange,
}: Readonly<{
  /** The chip's tooltip and accessible name prefix, and the menu's heading: "Focus". */
  label: string;
  value: T;
  /** The unfiltered value; any other value marks the chip active. */
  defaultValue?: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}>) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <FilterTrigger
          label={label}
          value={options.find((option) => option.value === value)?.label ?? label}
          active={defaultValue !== undefined && value !== defaultValue}
        />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{label}</MenuLabel>
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
