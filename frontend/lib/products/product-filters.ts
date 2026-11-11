'use client';

import {
  commerceProductSortSchema,
  commerceProductSourceSchema,
  type CommerceProductSort,
  type CommerceProductSource,
} from '@citeladder/contracts/commerce-suite';

import {
  PRODUCT_DEFAULT_WINDOW,
  PRODUCT_PAGE_SIZE,
  PRODUCT_WINDOW_DAYS,
  type ProductWindowDays,
} from '@/lib/config/commerce';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';

export type ProductFilters = Readonly<{
  source: CommerceProductSource;
  category: string | null;
  window: ProductWindowDays;
  engine: string | null;
  promptSet: string | null;
  q: string;
  sort: CommerceProductSort;
}>;

const SOURCE_CODEC = stringUrlCodec(commerceProductSourceSchema.options, 'catalog');
const SORT_CODEC = stringUrlCodec(commerceProductSortSchema.options, 'visibility');
const WINDOW_CODEC = stringUrlCodec(PRODUCT_WINDOW_DAYS, PRODUCT_DEFAULT_WINDOW);

/** The table a reader lands on with no filter in the URL. */
export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  source: 'catalog',
  category: null,
  window: PRODUCT_DEFAULT_WINDOW,
  engine: null,
  promptSet: null,
  q: '',
  sort: 'visibility',
};

/**
 * The read's query string for the filters, in a fixed order: the cache key of
 * a page and the request it sends. Unset filters are left out.
 */
export function productSearch(filters: ProductFilters): string {
  const params = new URLSearchParams({
    source: filters.source,
    window: filters.window,
    sort: filters.sort,
    limit: String(PRODUCT_PAGE_SIZE),
  });
  if (filters.category) params.set('category', filters.category);
  if (filters.engine) params.set('engine', filters.engine);
  if (filters.promptSet) params.set('prompt_set', filters.promptSet);
  const q = filters.q.trim();
  if (q) params.set('q', q);
  return params.toString();
}

/**
 * The Products table's filters, held in the URL so a reload, a deep link and
 * the back button keep them. Typing a search replaces the entry rather than
 * pushing one per keystroke.
 */
export function useProductFilters() {
  const [source, setSource] = useUrlState('source', SOURCE_CODEC);
  const [category, setCategory] = useUrlState('category', optionalStringUrlCodec);
  const [windowDays, setWindow] = useUrlState('window', WINDOW_CODEC);
  const [engine, setEngine] = useUrlState('engine', optionalStringUrlCodec);
  const [promptSet, setPromptSet] = useUrlState('prompt_set', optionalStringUrlCodec);
  const [q, setQ] = useUrlState('q', optionalStringUrlCodec, { history: 'replace' });
  const [sort, setSort] = useUrlState('sort', SORT_CODEC);
  const filters: ProductFilters = {
    source,
    category,
    window: windowDays,
    engine,
    promptSet,
    q: q ?? '',
    sort,
  };
  return {
    filters,
    setSource,
    setCategory,
    setWindow,
    setEngine,
    setPromptSet,
    setQ: (value: string) => setQ(value || null),
    setSort,
  };
}
