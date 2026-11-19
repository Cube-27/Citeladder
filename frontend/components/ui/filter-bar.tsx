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
  /** Pickers that open the control row, before the search (Actions' status and grouping). */
  lead?: ReactNode;
  /** A `SearchField`, after the view. */
  search?: ReactNode;
  /**
   * Every filter of the list, after the search, in the page's order. The
   * first four with an `icon` are chips in the row; the rest share Filters
   * once there are two of them, and a lone one is a chip of its own.
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
 * icon filters in the page's order, then the rest behind Filters. Filters
 * never holds a single filter (owner, 2026-11-19): one left over is a chip
 * of its own, wherever the page placed it.
 */
function placeFilters(filters: readonly FilterDefinition[]): Readonly<{
  chips: readonly FilterDefinition[];
  menu: readonly FilterDefinition[];
}> {
  const icons = filters
    .filter((filter) => filter.icon && !filter.inFilters)
    .slice(0, ROW_ICON_CHIPS);
  const rest = filters.filter((filter) => !icons.includes(filter));
  if (rest.length === 1) return { chips: [...icons, ...rest], menu: [] };
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
 * one order on every page: the view switch, then the search, the filter
 * chips, Filters and the chips of the filters set in it, Clear once anything
 * is set, then the data window, the count and the action at the row's end.
 * Every control is 32px (44 under a coarse pointer) and 8 apart.
 *
 * Without a view the row is left-aligned, so a chip whose width follows its
 * value moves only what comes after it, and its meta is cut before anything
 * wraps. With a view the view leads and the rest is right-aligned on the same
 * row (owner, 2026-11-19: one row everywhere). Controls that do not fit wrap
 * as whole units, at every width: from 900px the search is 200 to 256 wide;
 * below it the search takes the first line and the rest flow after.
 *
 * `status` is a polite live region, so a filtered result count is announced.
 */
export function FilterBar({ view, lead, ...row }: FilterBarProps) {
  return (
    <fieldset
      data-filter-bar=""
      aria-label="Search and filters"
      className="flex min-h-[var(--control-md)] w-full min-w-0 flex-wrap items-center gap-2"
    >
      {view ? <div className="flex max-w-full min-w-0 shrink-0">{view}</div> : null}
      {lead ? <div className="flex max-w-full min-w-0 shrink-0">{lead}</div> : null}
      {view ? (
        // Beside the view while 256 is left for it; its controls wrap inside it.
        <div className="flex min-w-[min(100%,16rem)] flex-[1_1_0] flex-wrap items-center justify-end gap-2">
          <Controls {...row} afterView />
        </div>
      ) : (
        <Controls {...row} />
      )}
    </fieldset>
  );
}

function Controls({
  search,
  filters = [],
  status,
  actions,
  afterView = false,
}: Omit<FilterBarProps, 'view' | 'lead'> & { afterView?: boolean }) {
  const { chips, menu } = placeFilters(filters);
  const set = filters.filter((filter) => !filter.isDefault);
  const windowLabel = dataWindow(chips);
  return (
    <>
      {search ? (
        <div className="rail:max-w-64 rail:grow rail:basis-[200px] min-w-0 basis-full">
          {search}
        </div>
      ) : null}
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
      {windowLabel || status !== undefined ? (
        // The strip's meta takes what the controls leave and is cut there, so
        // it never wraps the strip onto a second line. After a view it is drawn
        // before the right-aligned controls, which keep their places as it changes.
        <div
          data-strip-meta=""
          className={`${afterView ? 'rail:-order-1 ' : ''}rail:flex-[1_1_0] rail:justify-end rail:overflow-hidden flex min-w-0 items-center gap-1 whitespace-nowrap has-[>output:empty]:not-has-[>span]:hidden`}
        >
          {windowLabel ? (
            // Outside the live region: the window is on the chip's name already.
            <span className="type-caption min-w-0 shrink truncate">
              {windowLabel}
              {status ? ' ·' : null}
            </span>
          ) : null}
          {status === undefined ? null : (
            // A block, not a flex row: `truncate` only cuts a block's own inline text.
            <output
              aria-live="polite"
              className="type-caption block min-w-0 shrink truncate *:not-first:ms-2 empty:hidden"
            >
              {status}
            </output>
          )}
        </div>
      ) : null}
      {actions ? (
        // At the line's end, after the meta that fills the line; below 768 a
        // wrapped row starts at the left edge.
        <div className="phone:ms-0 phone:justify-start ms-auto flex max-w-full min-w-0 shrink-0 items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </>
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
