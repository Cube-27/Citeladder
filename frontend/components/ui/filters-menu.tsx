import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ListFilter } from 'lucide-react';

import type { FilterDefinition } from '@/components/ui/all-filters';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { FilterOptions, focusFieldOnEntry } from '@/components/ui/filter-options';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/ui/menu';
import { ControlCount } from '@/components/ui/tabs';
import { useMediaQuery } from '@/lib/use-media-query';

/** How many filters are off their default value. */
function activeFilterCount(filters: readonly FilterDefinition[]): number {
  return filters.filter((filter) => !filter.isDefault).length;
}

/**
 * FiltersMenu — the row's less frequent filters behind one button, with a
 * count of those set. Its menu lists each filter's name and current value;
 * each opens a submenu of its options (the filter's name as the heading,
 * "Reset to …" once set). Long lists get a search box. Radix's menu keyboard
 * model throughout: arrows move, Right or Enter opens a filter, Left comes
 * back, Escape closes. The menu opens toward the content from the button's
 * edge on that side (`align`: `end` for a button at its row's far right).
 *
 * On a phone a submenu has no room beside the menu, so there a filter opens
 * its options in the menu itself, under a Back row.
 *
 * The filters' state stays with their owners (URL state on every current
 * page); this only draws them.
 */
export function FiltersMenu({
  filters,
  align = 'start',
}: Readonly<{ filters: readonly FilterDefinition[]; align?: 'start' | 'end' }>) {
  const narrow = useMediaQuery(NARROW_QUERY);
  if (filters.length === 0) return null;
  const active = activeFilterCount(filters);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="secondary"
          data-active={active > 0 || undefined}
          aria-label={active > 0 ? `Filters (${active})` : 'Filters'}
        >
          <Icon icon={ListFilter} />
          <span>
            Filters
            {active > 0 ? <ControlCount count={active} /> : null}
          </span>
        </Button>
      </MenuTrigger>
      <MenuContent align={align}>
        {narrow ? (
          <DrillInFilters filters={filters} />
        ) : (
          <>
            <MenuLabel>More filters</MenuLabel>
            {filters.map((filter) => (
              <MenuSub key={filter.id}>
                <MenuSubTrigger value={filter.valueLabel} disabled={filter.disabled}>
                  {filter.label}
                </MenuSubTrigger>
                <FilterSubmenu filter={filter} />
              </MenuSub>
            ))}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

/** Below this width a submenu cannot stand beside the menu (two 224px panels). */
const NARROW_QUERY = '(max-width: 639px)';

/**
 * The phone form: the menu lists the filters; choosing one shows its options
 * in the same panel under a Back row, and Back returns to the list. The menu
 * unmounts on close, so it always reopens on the list.
 */
function DrillInFilters({ filters }: Readonly<{ filters: readonly FilterDefinition[] }>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = filters.find((filter) => filter.id === openId);
  // Focus follows the step: the options (or their search box) going in, the
  // filter's own row coming back.
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
        Filters
      </MenuItem>
      <MenuSeparator />
      <FilterOptions filter={open} />
    </div>
  );
}

function FilterSubmenu({ filter }: Readonly<{ filter: FilterDefinition }>) {
  return (
    <MenuSubContent onFocus={focusFieldOnEntry}>
      <FilterOptions filter={filter} />
    </MenuSubContent>
  );
}
