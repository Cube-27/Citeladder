import { useMemo, useState } from 'react';
import { Globe } from 'lucide-react';

import { AppGrid } from '@/components/ui/app-grid';
import type { DataTableState } from '@/components/ui/data-table';
import { readErrorProps } from '@/components/ui/notice';
import { Stack } from '@/components/ui/layout';
import { SourceDomainDetail } from '@/components/visibility/source-domain-detail';
import { TopMoversCard, useSourceMovers } from '@/components/visibility/source-movers';
import { NearMissTable, useSourceNearMisses } from '@/components/visibility/source-near-misses';
import { sourceTableToolbar } from '@/components/visibility/source-toolbar';
import { TypesCard, UsageCard } from '@/components/visibility/source-charts';
import { SourceUrlDetail } from '@/components/visibility/source-url-detail';
import { sourcePager } from '@/components/visibility/source-panels';
import {
  DomainTable,
  UrlTable,
  type SourceFilters,
  type SourceTableFrame,
} from '@/components/visibility/source-rows';
import { TABLE_DEFAULT_PAGE_SIZE, isTablePageSize, type TablePageSize } from '@/lib/config/tables';
import type { SourceTab } from '@/lib/visibility/dashboard';
import { optionalStringUrlCodec, setUrlParams, useUrlState } from '@/lib/navigation/url-state';
import { matchesSearch, sortItems, typeSlices, type SortState } from '@/lib/visibility/sources';
import {
  useSourceAnalysis,
  useSourceSeries,
  type SourceQueries,
} from '@/lib/visibility/use-source-analysis';

/**
 * A Sources tab: the domains, the URLs, or your pages read but not cited.
 *
 * Three levels, all driven by URL state so every one of them is linkable and
 * survives a reload: the inventory, one domain's pages, and one URL's own
 * page. They are not routes because the run / engine / period controls above
 * them narrow all three identically — a route would have had to re-establish
 * that selection, and the first drill-down to forget a filter would be
 * answering a different question from the table it was opened from.
 */
export function VisibilitySources({
  tab,
  filters,
  queries,
}: Readonly<{ tab: SourceTab; filters: SourceFilters; queries: SourceQueries }>) {
  const [openUrl, setOpenUrl] = useUrlState('source_url', optionalStringUrlCodec);
  // `source_view` goes with the domain: opening a second domain while its
  // Prompts tab was selected would otherwise land on that domain's Prompts,
  // which is not where a reader who clicked a row expects to be.
  const [domain, setDomain] = useUrlState('source_domain', optionalStringUrlCodec, {
    clearKeys: ['source_cursor', 'source_offset', 'source_as_of', 'source_url', 'source_view'],
  });

  if (openUrl) {
    return (
      <SourceUrlDetail
        url={openUrl}
        domain={domain}
        filters={filters}
        queries={queries}
        onBack={() => setOpenUrl(null)}
        onOpenInventory={() => {
          setOpenUrl(null);
          setDomain(null);
        }}
      />
    );
  }
  if (domain) {
    return (
      <SourceDomainDetail
        domain={domain}
        filters={filters}
        queries={queries}
        onBack={() => setDomain(null)}
        onOpenUrl={setOpenUrl}
      />
    );
  }
  return (
    // Deliberately NOT keyed on the tab. Remounting threw away the React Query
    // observer along with the panel, so `retainPreviousDataForScope` had no
    // previous data to hold and the table emptied to a skeleton on every
    // switch. The panel resets its own local state instead.
    <SourcesPanel
      dimension={tab === 'domains' ? 'domain' : 'url'}
      readNotCited={tab === 'read-not-cited'}
      filters={filters}
      queries={queries}
      onOpenUrl={setOpenUrl}
      onOpenDomain={setDomain}
    />
  );
}

export function SourcesPanel({
  dimension,
  filters,
  queries,
  domain = null,
  onOpenUrl,
  onOpenDomain,
  readNotCited = false,
}: Readonly<{
  dimension: 'domain' | 'url';
  filters: SourceFilters;
  queries: SourceQueries;
  /** Set on a domain's own page, where the table lists only its pages. */
  domain?: string | null;
  onOpenUrl: (url: string) => void;
  /** Required whenever the domain dimension can be shown. */
  onOpenDomain?: (domain: string) => void;
  /** The Read, not cited tab: your read pages lead in the table's place. */
  readNotCited?: boolean;
}>) {
  const [offset] = useUrlState('source_offset', optionalStringUrlCodec);
  const [cursor] = useUrlState('source_cursor', optionalStringUrlCodec);
  const [asOf] = useUrlState('source_as_of', optionalStringUrlCodec);
  // The table's filters are the page's (`useTableFilters`); the panel reads them.
  const [sourceType] = useUrlState('source_type', optionalStringUrlCodec);
  const gapOnly = useGapOnly(dimension, readNotCited);
  const [pageSize, setPageSize] = useState<TablePageSize>(TABLE_DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  // What the panel was showing last render, so a dimension change can clear the
  // controls that do not carry over -- page three of domains is not page three
  // of URLs, and `editorial` is not a page format. Done during render rather
  // than in an effect so the table never paints one frame of the old sort
  // applied to the new dimension.
  const [shownDimension, setShownDimension] = useState(dimension);
  if (shownDimension !== dimension) {
    setShownDimension(dimension);
    setPageSize(TABLE_DEFAULT_PAGE_SIZE);
    setSearch('');
    setSort(null);
  }

  // On a domain's own page the publisher is fixed by the route above, so a
  // pick never applies there.
  const [pickedDomain] = useUrlState('source_pick', optionalStringUrlCodec);
  // The publisher filter is a URL-table filter: the Domains view neither
  // offers it nor reads a pick left over from the URLs view.
  const activeDomain = domain ?? (dimension === 'url' ? pickedDomain : null);
  const scope = { dimension, domain: activeDomain, cursor, asOf, sourceType, gapOnly, pageSize };
  const { sourceQuery } = useSourceAnalysis(filters, queries, scope);
  const seriesQuery = useSourceSeries(filters, queries, {
    dimension,
    domain: activeDomain,
    sourceType,
  });
  const nearMissQuery = useSourceNearMisses(filters, queries, {
    enabled: readNotCited,
    limit: pageSize,
  });
  // Movement is an inventory question; a domain's own page has no peers to rank.
  const moversQuery = useSourceMovers(filters, queries, { dimension, enabled: !domain });
  const comparable = queries.visibilityQuery.data?.comparison?.status === 'comparable';
  const onPageSizeChange = (value: number) => {
    setPageSize(isTablePageSize(value) ? value : TABLE_DEFAULT_PAGE_SIZE);
    setUrlParams({ source_cursor: null, source_offset: null, source_as_of: null });
  };

  const data = sourceQuery.data;
  const slices = typeSlices(data?.category_totals, dimension);
  // Search and sort narrow what is LOADED. The footer reports the loaded count
  // against the server's total, so a reader can see the difference.
  const rows = useMemo(
    () =>
      sortItems(
        (data?.items ?? []).filter((item) => matchesSearch(item, search)),
        sort,
      ),
    [data, search, sort],
  );

  const onSort = (column: string) =>
    setSort((current) =>
      current?.column === column
        ? { column, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { column, direction: 'desc' },
    );

  // One toolbar for both bodies, so switching to near misses moves nothing.
  const toolbar = sourceTableToolbar({
    dimension,
    search,
    onSearch: setSearch,
    rows,
    domain: activeDomain,
  });

  return (
    <Stack gap="workspace">
      {readNotCited ? (
        <NearMissTable
          query={nearMissQuery}
          pageSize={pageSize}
          toolbar={toolbar}
          onOpenUrl={onOpenUrl}
          onPageSizeChange={onPageSizeChange}
        />
      ) : (
        <SourceTable
          dimension={dimension}
          query={sourceQuery}
          rows={rows}
          sort={sort}
          onSort={onSort}
          onOpenUrl={onOpenUrl}
          onOpenDomain={onOpenDomain}
          frame={{
            toolbar,
            pageSize,
            busy: { active: sourceQuery.isFetching, label: 'Updating sources' },
            state: tableState({
              query: sourceQuery,
              rows,
              narrowed: Boolean(search || sourceType),
              searching: Boolean(search),
              gapOnly,
            }),
            pager: sourcePager({
              data,
              domain: activeDomain,
              dimension,
              offset: pageOffset(offset),
              pageSize,
              busy: sourceQuery.isFetching,
              onPageSizeChange,
            }),
          }}
        />
      )}

      {/* The table leads; the usage over time and the type mix explain it below.
          Both chart citations, which near misses by definition are not. */}
      {readNotCited ? null : (
        <AppGrid layout="main-aside">
          <UsageCard dimension={dimension} query={seriesQuery} />
          <TypesCard slices={slices} total={data?.total_citations ?? 0} query={sourceQuery} />
        </AppGrid>
      )}
      {domain ? null : (
        <TopMoversCard dimension={dimension} query={moversQuery} comparable={comparable} />
      )}
    </Stack>
  );
}

/** The page's first row from the address: zero when absent or not a count. */
function pageOffset(raw: string | null): number {
  return Math.max(0, Number.parseInt(raw ?? '0', 10) || 0);
}

/** Only pages have a standing, so the gaps filter applies to the URL table alone. */
function useGapOnly(dimension: 'domain' | 'url', readNotCited: boolean) {
  const [standing] = useUrlState('source_standing', optionalStringUrlCodec);
  return dimension === 'url' && !readNotCited && standing === 'gap';
}

/**
 * Which of the four things the table is doing right now.
 *
 * Four states, kept apart on purpose: nothing has been measured yet, the
 * filters exclude everything, the rows are on their way, and the read failed.
 * They are not interchangeable -- "no cited sources in this selection" is a
 * finding, "could not load sources" is a fault -- and a reader who cannot tell
 * them apart cannot tell whether to change the filter or retry.
 */
function tableState({
  query,
  rows,
  narrowed,
  searching,
  gapOnly,
}: Readonly<{
  query: ReturnType<typeof useSourceAnalysis>['sourceQuery'];
  rows: ReturnType<typeof sortItems>;
  narrowed: boolean;
  searching: boolean;
  gapOnly: boolean;
}>): DataTableState | undefined {
  // A failed read keeps the header and columns, with the fault stated in the
  // body: an error is a fault to retry, never presented as an empty finding.
  if (query.isError) {
    return {
      kind: 'error',
      ...readErrorProps(query),
      title: "Couldn't load the sources",
      fallback: 'Check your connection and try again.',
    };
  }
  // The selection has settled on a measured run (`SelectionGate`), so no data
  // yet is this read on its way, never an empty finding.
  if (!query.data) return { kind: 'loading', label: 'Loading sources…' };
  if (rows.length) return undefined;
  return {
    kind: 'empty',
    headingLevel: 3,
    icon: Globe,
    heading: emptyHeading(searching, gapOnly, narrowed),
  };
}

function emptyHeading(searching: boolean, gapOnly: boolean, narrowed: boolean): string {
  if (searching) return 'No sources on this page match your search';
  if (gapOnly) return 'No read page in this selection lists competitors without you';
  if (narrowed) return 'No sources of this type in this selection';
  return 'No cited sources in this selection';
}

/** Whichever table the dimension calls for, carrying its own state inside it. */
function SourceTable({
  dimension,
  query,
  rows,
  sort,
  onSort,
  onOpenUrl,
  onOpenDomain,
  frame,
}: Readonly<{
  dimension: 'domain' | 'url';
  query: ReturnType<typeof useSourceAnalysis>['sourceQuery'];
  rows: ReturnType<typeof sortItems>;
  sort: SortState;
  onSort: (column: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenDomain?: (domain: string) => void;
  frame: SourceTableFrame;
}>) {
  const retrieval = query.data?.retrieval;
  return dimension === 'url' ? (
    <UrlTable
      rows={rows}
      sort={sort}
      onSort={onSort}
      onOpenUrl={onOpenUrl}
      retrieval={retrieval}
      frame={frame}
    />
  ) : (
    <DomainTable
      rows={rows}
      sort={sort}
      onSort={onSort}
      onOpenDomain={onOpenDomain}
      retrieval={retrieval}
      frame={frame}
    />
  );
}
