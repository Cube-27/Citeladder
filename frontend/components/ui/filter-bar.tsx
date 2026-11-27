import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import type { FilterDefinition } from '@/components/ui/all-filters';
import { Button } from '@/components/ui/button';
import {
  FilterChip,
  FilterOptions,
  FilterTrigger,
  focusFieldOnEntry,
  ValueChip,
} from '@/components/ui/filter-chip';
import { Icon } from '@/components/ui/icon';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/ui/menu';
import { ControlCount } from '@/components/ui/tabs';
import { PageFilterBandContext, PageTabEnd } from '@/components/templates/page-tab-end';
import { ChevronLeft, ListFilter, X } from '@/lib/icons';
import { MEDIA } from '@/lib/breakpoints';
import { batchUrlWrites } from '@/lib/navigation/url-state';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

export type TableToolbarProps = Readonly<{
  view?: ReactNode;
  search?: ReactNode;
  filters?: readonly FilterDefinition[];
  status?: ReactNode;
  actions?: ReactNode;
}>;

export type FilterBarProps = Omit<TableToolbarProps, 'search'>;

function inlineOrder(filters: readonly FilterDefinition[]): readonly FilterDefinition[] {
  const inline = filters.filter((filter) => !filter.inFilters);
  return [...inline.filter((filter) => filter.icon), ...inline.filter((filter) => !filter.icon)];
}

function dataWindow(chips: readonly FilterDefinition[]): string | undefined {
  const period = chips.find((filter) => filter.icon === 'period' && filter.isDefault);
  return period ? (period.windowLabel ?? period.valueLabel) : undefined;
}

export function FilterBar({ view, filters = [], status, actions }: FilterBarProps) {
  const windowLabel = dataWindow(inlineOrder(filters));
  return (
    <fieldset
      data-filter-bar=""
      aria-label="Filters"
      className="min-h-control-md flex w-full min-w-0 flex-wrap items-center gap-2"
    >
      {view ? <div className="flex max-w-full min-w-0 shrink-0">{view}</div> : null}
      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-2',
          view ? 'min-w-[min(100%,16rem)] grow basis-0 justify-end' : 'contents',
        )}
      >
        {filters.length > 0 ? <ChipGroup filters={filters} /> : null}
        {windowLabel || status !== undefined ? (
          <StripMeta windowLabel={windowLabel} status={status} afterView={Boolean(view)} />
        ) : null}
        {actions ? (
          <div className="phone:ms-0 phone:justify-start phone:flex-wrap ms-auto flex max-w-full min-w-0 shrink-0 items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

export function HeadControls({ view, filters = [], status, actions }: FilterBarProps) {
  return (
    <>
      {filters.length > 0 ? <ChipGroup filters={filters} end /> : null}
      {view ? <div className="flex max-w-full min-w-0 shrink-0">{view}</div> : null}
      {status === undefined ? null : <StatusLine status={status} />}
      {actions}
    </>
  );
}

function StatusLine({ status }: Readonly<{ status: ReactNode }>) {
  return (
    <output
      aria-live="polite"
      className="text-caption text-ink-2 block min-w-0 shrink truncate *:not-first:ms-2 empty:hidden"
    >
      {status}
    </output>
  );
}

export const hasHeadControls = ({ view, filters, status, actions }: FilterBarProps) =>
  Boolean(view || filters?.length || status !== undefined || actions);

function ChipGroup({
  filters,
  end = false,
}: Readonly<{ filters: readonly FilterDefinition[]; end?: boolean }>) {
  const grouped = filters.filter((filter) => filter.inFilters);
  const pinned = grouped.length > 1 ? grouped : [];
  const inline = [...inlineOrder(filters), ...grouped.filter((filter) => !pinned.includes(filter))];
  const { ref, kept } = useKeptFilters(inline, pinned.length > 0);
  const chips = inline.slice(0, kept);
  const menu = [...inline.slice(kept), ...pinned];
  const set = filters.filter((filter) => !filter.isDefault);
  return (
    <div
      ref={ref}
      data-filter-chips=""
      className={cn(
        'phone:basis-full flex min-w-0 grow basis-0 flex-wrap items-center gap-2',
        end && 'justify-end',
      )}
    >
      {chips.map((filter) => (
        <div key={filter.id} data-filter-slot={filter.id} className="flex min-w-0 shrink-0">
          <FilterChip filter={filter} align={end ? 'end' : 'start'} />
        </div>
      ))}
      {menu.length > 0 ? (
        <div data-filter-menu="" className="flex min-w-0 shrink-0">
          <AllFiltersMenu filters={menu} align={end ? 'end' : 'start'} />
        </div>
      ) : null}
      {menu
        .filter((filter) => !filter.isDefault)
        .map((filter) => (
          <div
            key={filter.id}
            {...(pinned.includes(filter)
              ? { 'data-filter-trailing': '' }
              : { 'data-filter-value': filter.id })}
            className="flex min-w-0 shrink-0"
          >
            <ValueChip filter={filter} />
          </div>
        ))}
      {set.length > 0 ? (
        <div data-filter-trailing="" className="flex shrink-0">
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
    </div>
  );
}

function StripMeta({
  windowLabel,
  status,
  afterView,
}: Readonly<{ windowLabel: string | undefined; status: ReactNode; afterView: boolean }>) {
  const inBand = useContext(PageFilterBandContext);
  const content = (
    <>
      {windowLabel ? (
        <span className="text-caption text-ink-2 min-w-0 shrink truncate">
          {windowLabel}
          {status ? ' ·' : null}
        </span>
      ) : null}
      {status === undefined ? null : <StatusLine status={status} />}
    </>
  );
  const hidden = 'has-[>output:empty]:not-has-[>span]:hidden';
  const row = (
    <div
      data-strip-meta=""
      className={cn(
        afterView && 'rail:-order-1',
        'rail:grow rail:basis-0 rail:justify-end rail:overflow-hidden flex min-w-0 items-center gap-1 whitespace-nowrap',
        hidden,
      )}
    >
      {content}
    </div>
  );
  if (!inBand) return row;
  return (
    <PageTabEnd fallback={row}>
      <div data-strip-meta="" className={cn('flex min-w-0 items-center gap-1', hidden)}>
        {content}
      </div>
    </PageTabEnd>
  );
}

export function FilterControls({
  filters,
  align = 'start',
}: Readonly<{ filters: readonly FilterDefinition[]; align?: 'start' | 'end' }>) {
  const [only, ...rest] = filters;
  if (!only) return null;
  if (rest.length > 0) return <AllFiltersMenu filters={filters} align={align} />;
  return <FilterChip filter={only} align={align} />;
}

export function FilterChoice<T extends string>({
  label,
  value,
  defaultValue,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
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
      <MenuContent align="end">
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

const ALL_FILTERS = 'All filters';

export function AllFiltersMenu({
  filters,
  align = 'start',
}: Readonly<{ filters: readonly FilterDefinition[]; align?: 'start' | 'end' }>) {
  const narrow = useMediaQuery(MEDIA.narrow);
  if (filters.length === 0) return null;
  const active = filters.filter((filter) => !filter.isDefault).length;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="secondary"
          data-active={active > 0 || undefined}
          aria-label={active > 0 ? `${ALL_FILTERS} (${active})` : ALL_FILTERS}
        >
          <Icon icon={ListFilter} />
          <span>
            {ALL_FILTERS}
            {active > 0 ? <ControlCount count={active} /> : null}
          </span>
        </Button>
      </MenuTrigger>
      <MenuContent align={align}>
        {narrow ? (
          <DrillInFilters filters={filters} />
        ) : (
          filters.map((filter) => (
            <MenuSub key={filter.id}>
              <MenuSubTrigger value={filter.valueLabel} disabled={filter.disabled}>
                {filter.label}
              </MenuSubTrigger>
              <MenuSubContent onFocus={focusFieldOnEntry}>
                <FilterOptions filter={filter} />
              </MenuSubContent>
            </MenuSub>
          ))
        )}
      </MenuContent>
    </Menu>
  );
}

function DrillInFilters({ filters }: Readonly<{ filters: readonly FilterDefinition[] }>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = filters.find((filter) => filter.id === openId);
  useEffect(() => {
    const root = panel.current;
    if (!root) return;
    const target = open
      ? root.querySelector<HTMLElement>('input, [role="menuitemradio"]')
      : root.querySelector<HTMLElement>(`[data-filter-id="${returnTo ?? ''}"]`);
    target?.focus();
  }, [open, returnTo]);
  if (!open) {
    return (
      <div ref={panel} className="contents">
        {filters.map((filter) => (
          <MenuItem
            key={filter.id}
            data-filter-id={filter.id}
            aria-label={`${filter.label}: ${filter.valueLabel}`}
            value={filter.valueLabel}
            disabled={filter.disabled}
            onSelect={(event) => {
              event.preventDefault();
              setOpenId(filter.id);
            }}
          >
            {filter.label}
          </MenuItem>
        ))}
      </div>
    );
  }
  return (
    <div ref={panel} className="contents">
      <MenuItem
        icon={<ChevronLeft />}
        onSelect={(event) => {
          event.preventDefault();
          setReturnTo(open.id);
          setOpenId(null);
        }}
      >
        {ALL_FILTERS}
      </MenuItem>
      <MenuSeparator />
      <FilterOptions filter={open} />
    </div>
  );
}

export type FilterFit = Readonly<{
  widths: readonly number[];
  values: readonly number[];
  available: number;
  gap: number;
  trailing: number;
  menu: number;
  menuAlways: boolean;
}>;

function spanOf(widths: readonly number[], gap: number): number {
  const parts = widths.filter((width) => width > 0);
  return parts.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, parts.length - 1);
}

export function keptFilterCount({
  widths,
  values,
  available,
  gap,
  trailing,
  menu,
  menuAlways,
}: FilterFit): number {
  if (available <= 0) return widths.length;
  const span = (count: number) =>
    spanOf(
      [
        ...widths.slice(0, count),
        count < widths.length || menuAlways ? menu : 0,
        ...values.slice(count),
        trailing,
      ],
      gap,
    );
  for (let count = widths.length; count > 0; count -= 1) if (span(count) <= available) return count;
  return 0;
}

const CHIP_GAP = 8;
const MENU_FALLBACK = 96;

function widthsOf(node: HTMLElement, selector: string): number[] {
  return [...node.querySelectorAll<HTMLElement>(selector)].map((item) => item.offsetWidth);
}

function useKeptFilters(
  filters: readonly Readonly<{ id: string; isDefault: boolean }>[],
  menuAlways: boolean,
) {
  const ref = useRef<HTMLDivElement>(null);
  const widths = useRef(new Map<string, number>());
  const values = useRef(new Map<string, number>());
  const menu = useRef(MENU_FALLBACK);
  const measure = useRef(() => {});
  const [kept, setKept] = useState(filters.length);
  useLayoutEffect(() => {
    measure.current = () => {
      const node = ref.current;
      if (!node) return;
      for (const slot of node.querySelectorAll<HTMLElement>('[data-filter-slot]'))
        widths.current.set(slot.dataset.filterSlot ?? '', slot.offsetWidth);
      for (const chip of node.querySelectorAll<HTMLElement>('[data-filter-value]'))
        values.current.set(chip.dataset.filterValue ?? '', chip.offsetWidth);
      const trigger = node.querySelector<HTMLElement>('[data-filter-menu]');
      if (trigger?.offsetWidth) menu.current = trigger.offsetWidth;
      setKept(
        keptFilterCount({
          widths: filters.map((filter) => widths.current.get(filter.id) ?? 0),
          values: filters.map((filter) =>
            filter.isDefault ? 0 : (values.current.get(filter.id) ?? 0),
          ),
          available: node.clientWidth,
          gap: CHIP_GAP,
          trailing: spanOf(widthsOf(node, '[data-filter-trailing]'), CHIP_GAP),
          menu: menu.current,
          menuAlways,
        }),
      );
    };
    measure.current();
  });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => measure.current());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, kept: Math.min(kept, filters.length) };
}
