'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type { FilterDefinition } from '@/components/ui/all-filters';

type Registry = Readonly<{
  filters: readonly FilterDefinition[];
  setFilters: Dispatch<SetStateAction<readonly FilterDefinition[]>>;
}>;

const SourceFiltersContext = createContext<Registry | null>(null);

/**
 * Where the Sources table's filters (type, standing, domain) are listed: in
 * the page's All filters menu with the run, surface and period filters, not in
 * the table's own toolbar, which keeps the Domains | URLs switch, search and
 * export.
 *
 * The filters stay owned by the Sources panel, which holds the page size and
 * the read their options come from; the panel publishes them here and the
 * page's menu lists them. The provider spans both.
 */
export function SourceFiltersProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [filters, setFilters] = useState<readonly FilterDefinition[]>([]);
  const registry = useMemo(() => ({ filters, setFilters }), [filters]);
  return <SourceFiltersContext value={registry}>{children}</SourceFiltersContext>;
}

/** The Sources filters the mounted panel published; none while no panel is showing. */
export function useSourceFilters(): readonly FilterDefinition[] {
  return useContext(SourceFiltersContext)?.filters ?? [];
}

/**
 * Whether a page menu lists the Sources filters. A panel rendered outside the
 * provider (on its own) has none, and keeps its filters in its toolbar.
 */
export function useHasSourceFiltersMenu(): boolean {
  return useContext(SourceFiltersContext) !== null;
}

/**
 * What a filter shows and offers. The handlers are not part of it: every one
 * writes the live address (`useUrlState`), so an earlier render's handler
 * writes the same thing.
 */
function signature(filters: readonly FilterDefinition[]): string {
  return JSON.stringify(
    filters.map((filter) =>
      filter.kind === 'choice'
        ? [filter.id, filter.label, filter.valueLabel, filter.value, filter.groups]
        : [filter.id, filter.label, filter.valueLabel],
    ),
  );
}

/** Lists the panel's filters in the page menu while the panel is mounted. */
export function usePublishSourceFilters(filters: readonly FilterDefinition[]): void {
  const setFilters = useContext(SourceFiltersContext)?.setFilters;
  const key = signature(filters);
  useEffect(() => {
    setFilters?.(filters);
    // Republished only when what the menu shows changes; see `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFilters, key]);
  useEffect(() => () => setFilters?.([]), [setFilters]);
}
