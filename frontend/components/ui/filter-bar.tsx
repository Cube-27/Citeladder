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
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
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
   * status and typed values alike, each its own trigger ("Page kind ▾" until
   * set, then "Page kind: Article"), in this order. In a full row (view,
   * search and actions), or more than four beside a search, they share one
   * All filters menu.
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
 * Each filter is its own trigger where the row has room for them. Two or more
 * share All filters (with the count of active ones) in a full row, one that
 * also holds a view, a search and actions (Products), or beside a search when
 * there are more than `FILTERS_BESIDE_SEARCH`, so the row stays one line and
 * the search keeps its width. From 900px it is one row and the search grows
 * from 200 to at most 320, so it never runs up to a view or tabs beside the
 * row (owner, 2026-11-18); when the row cannot hold everything, controls wrap as whole
 * units, the actions at the line's right end, and nothing shrinks below its
 * label. Below 900px the bar stacks into one full-width column in the same
 * order.
 *
 * `status` is a polite live region, so a filtered result count is announced.
 */
export function FilterBar({ view, search, filters, status, actions }: FilterBarProps) {
  const searched = Boolean(search);
  const full = searched && Boolean(view) && Boolean(actions);
  return (
    <fieldset
      data-filter-bar=""
      aria-label="Search and filters"
      className="rail:flex-row rail:flex-wrap rail:items-center flex min-h-[var(--control-md)] w-full min-w-0 flex-col items-stretch gap-2"
    >
      {view ? <div className="flex max-w-full min-w-0 shrink-0">{view}</div> : null}
      {search ? (
        <div className="rail:flex-[1_1_200px] rail:min-w-[200px] rail:max-w-80 min-w-0">
          {search}
        </div>
      ) : null}
      {filters ? (
        <RowFilters filters={filters} grouped={grouped(filters.length, searched, full)} />
      ) : null}
      {status === undefined ? null : (
        <output
          aria-live="polite"
          className={cn(
            'type-caption flex min-w-0 items-center gap-2 truncate empty:hidden',
            'rail:ms-auto rail:shrink',
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

/** Beside a search, the most filters the row shows as their own triggers. */
const FILTERS_BESIDE_SEARCH = 4;

/** Whether the row's filters share All filters: two or more in a full row, or more than four beside a search. */
function grouped(count: number, searched: boolean, full: boolean): boolean {
  return (full && count > 1) || (searched && count > FILTERS_BESIDE_SEARCH);
}

/** The row's filters: each its own trigger, or one All filters menu. */
function RowFilters({
  filters,
  grouped,
}: Readonly<{ filters: readonly FilterDefinition[]; grouped: boolean }>) {
  if (grouped)
    return (
      <div className="flex min-w-0 shrink-0">
        <AllFilters filters={filters} />
      </div>
    );
  return filters.map((filter) => (
    <div key={filter.id} className="flex min-w-0 shrink-0">
      <FilterMenu filter={filter} />
    </div>
  ));
}

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

/** One filter as its own trigger ("Label" or "Label: Value") that opens its options. */
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
          labelOnly={filter.isDefault && filter.defaultIsEvery === true}
          active={!filter.isDefault}
          disabled={filter.disabled}
          sizeTo={filter.kind === 'choice' ? filter.printable : [filter.valueLabel]}
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
 * The accessible name always contains the label and the current value, so a
 * voice user can say what is on screen and a reader hears what is filtered.
 *
 *   - `label` names the filter ("Status"). With a `value` it prints as a
 *     muted prefix ("Status: Open"); `hideLabel` keeps it for assistive tech
 *     only, so the name still contains the visible value.
 *   - `labelOnly`: a filter at its every value ("All statuses") prints only
 *     its label ("Status ▾"), held as wide as its widest "Status: value"
 *     when `sizeTo` is set, so choosing one moves nothing; the value is spoken only.
 *     A real default (a period, a market, an engine) never sets it.
 *   - `active` marks a choice moved off its default (`data-active`); the
 *     value says how.
 *   - `sizeTo` lists every value the trigger can show. The value then takes
 *     the width of the longest of them, at most 128px, instead of the one
 *     filter width, so it never resizes between two values. A longer value
 *     ends in an ellipsis and shows whole in a tooltip.
 *
 * Use it as `<MenuTrigger asChild><FilterTrigger …/></MenuTrigger>`; it
 * forwards the ref and the trigger's props to the button.
 */
export function FilterTrigger({
  label,
  value,
  hideLabel = false,
  labelOnly = false,
  active = false,
  sizeTo,
  className,
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
    label: string;
    value?: string;
    hideLabel?: boolean;
    /** Print the label alone; the value stays in the accessible name. */
    labelOnly?: boolean;
    active?: boolean;
    /** Every value the trigger can show; the value takes the longest one's width. */
    sizeTo?: readonly string[];
    ref?: Ref<HTMLButtonElement>;
  }
>) {
  const fit = sizeTo !== undefined && sizeTo.length > 0;
  const shown = value !== undefined && !labelOnly;
  const button = (
    <button
      ref={ref}
      type="button"
      data-active={active || undefined}
      data-fit={fit || undefined}
      // Spelled out, so the name holds the value even where only the label prints.
      aria-label={value === undefined ? undefined : `${label}: ${value}`}
      className={cn(
        SOFT_FIELD_BOX,
        'focus-input flex min-w-0 shrink-0 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-45',
        fit ? 'w-auto max-w-full' : 'shell:w-[var(--filter-width)]',
        className,
      )}
      {...props}
    >
      {shown ? (
        <span data-filter-text="" className="min-w-0 truncate">
          {hideLabel ? null : <span className="text-ink-2">{label}: </span>}
          {fit ? <SizedValue value={value} sizeTo={sizeTo} /> : <TriggerValue value={value} />}
        </span>
      ) : (
        <HeldLabel label={label} sizeTo={fit && labelOnly ? sizeTo : undefined} />
      )}
      <ChevronDown className="text-ink-2 ms-auto size-4 shrink-0" aria-hidden />
    </button>
  );
  // Always wrapped, so moving off the default keeps the same button (and its focus).
  return (
    <Tooltip content={value} describe={false} shouldOpen={valueIsCut}>
      {button}
    </Tooltip>
  );
}

function valueIsCut(trigger: HTMLElement): boolean {
  return [...trigger.querySelectorAll('[data-filter-text], [data-filter-value]')].some(isTextCut);
}

function TriggerValue({ value, className }: Readonly<{ value: string; className?: string }>) {
  return (
    <span data-filter-value="" className={cn('text-ink min-w-0', className)}>
      {value}
    </span>
  );
}

/**
 * Every option is laid in the same cell, unseen, so the value is as wide as
 * the longest (at most 128px) and never resizes between two values. The
 * sizers draw their text as generated content: no readable text, no name.
 */
function SizedValue({ value, sizeTo }: Readonly<{ value: string; sizeTo: readonly string[] }>) {
  return (
    <span className="inline-grid max-w-32 min-w-0 align-top">
      <ValueSizers sizeTo={sizeTo} />
      <TriggerValue value={value} className="col-start-1 row-start-1 truncate" />
    </span>
  );
}

/**
 * Only the longest labels can set the width; a long option list (every tracked
 * prompt) must not become one node per option. One line each, or a long option
 * wraps and makes the trigger taller than a select.
 */
function ValueSizers({ sizeTo }: Readonly<{ sizeTo: readonly string[] }>) {
  return [...new Set(sizeTo)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 6)
    .map((size) => (
      <span
        key={size}
        aria-hidden
        data-size={size}
        className="invisible col-start-1 row-start-1 min-w-0 overflow-hidden whitespace-nowrap after:content-[attr(data-size)]"
      />
    ));
}

/**
 * The label alone, held as wide as "Label: value" at its widest value, so
 * choosing a value (or clearing it) never resizes the trigger.
 */
function HeldLabel({ label, sizeTo }: Readonly<{ label: string; sizeTo?: readonly string[] }>) {
  if (!sizeTo) return <span className="truncate">{label}</span>;
  return (
    <span className="grid min-w-0">
      <span className="col-start-1 row-start-1 truncate">{label}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1 flex min-w-0">
        <span data-size={`${label}: `} className="whitespace-pre after:content-[attr(data-size)]" />
        <span className="inline-grid max-w-32 min-w-0">
          <ValueSizers sizeTo={sizeTo} />
        </span>
      </span>
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
  value,
  defaultValue,
  options,
  onChange,
  fit = false,
}: Readonly<{
  /** The trigger's accessible name prefix and the menu's heading, e.g. "Select date range". */
  label: string;
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
