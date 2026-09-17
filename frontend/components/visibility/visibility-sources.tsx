'use client';

import { useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { BusyBar } from '@/components/ui/busy-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DonutChart } from '@/components/ui/donut-chart';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SeriesChart } from '@/components/ui/series-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { SourceDomainDetail } from '@/components/visibility/source-domain-detail';
import { SourceTableToolbar } from '@/components/visibility/source-toolbar';
import { SourceUrlDetail } from '@/components/visibility/source-url-detail';
import { SourcePaging } from '@/components/visibility/source-panels';
import { DomainTable, UrlTable, type SourceFilters } from '@/components/visibility/source-rows';
import { TABLE_DEFAULT_PAGE_SIZE, isTablePageSize, type TablePageSize } from '@/lib/config/tables';
import { optionalStringUrlCodec, setUrlParams, useUrlState } from '@/lib/navigation/url-state';
import {
  availableTypes,
  matchesSearch,
  seriesCeiling,
  sortItems,
  toChartSeries,
  typeSlices,
  type SortState,
} from '@/lib/visibility/sources';
import {
  useSourceAnalysis,
  useSourceSeries,
  type SourceQueries,
} from '@/lib/visibility/use-source-analysis';

/** Which half of Sources is showing. Persisted so a link reopens the same one. */
const DIMENSIONS = [
  { value: 'domain', label: 'Domains' },
  { value: 'url', label: 'URLs' },
] as const;

/**
 * Sources: the domains and URLs the engines retrieved, and how much.
 *
 * Three levels, all driven by URL state so every one of them is linkable and
 * survives a reload: the inventory, one domain's pages, and one URL's own
 * page. They are not routes because the run / engine / period controls above
 * them narrow all three identically — a route would have had to re-establish
 * that selection, and the first drill-down to forget a filter would be
 * answering a different question from the table it was opened from.
 */
export function VisibilitySources({
  filters,
  queries,
}: Readonly<{ filters: SourceFilters; queries: SourceQueries }>) {
  const [openUrl, setOpenUrl] = useUrlState('source_url', optionalStringUrlCodec);
  const [domain, setDomain] = useUrlState('source_domain', optionalStringUrlCodec, {
    clearKeys: ['source_offset', 'source_as_of', 'source_url'],
  });

  if (openUrl) {
    return (
      <SourceUrlDetail
        url={openUrl}
        domain={domain}
        filters={filters}
        queries={queries}
        onBack={() => setOpenUrl(null)}
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
    <SourcesInventory
      filters={filters}
      queries={queries}
      onOpenUrl={setOpenUrl}
      onOpenDomain={setDomain}
    />
  );
}

/** The Domains / URLs inventory: usage chart, type ring, and the table. */
function SourcesInventory({
  filters,
  queries,
  onOpenUrl,
  onOpenDomain,
}: Readonly<{
  filters: SourceFilters;
  queries: SourceQueries;
  onOpenUrl: (url: string) => void;
  onOpenDomain: (domain: string) => void;
}>) {
  // A different dimension is a different result set, so the offset cursor and
  // the type filter cannot carry over: page three of domains is not page three
  // of URLs, and `editorial` is not a page format.
  const [rawDimension, setDimension] = useUrlState('source_dim', optionalStringUrlCodec, {
    clearKeys: ['source_offset', 'source_as_of', 'source_type'],
  });
  const dimension = rawDimension === 'url' ? 'url' : 'domain';
  return (
    <SourcesPanel
      key={dimension}
      dimension={dimension}
      onChangeDimension={(value) => setDimension(value === 'domain' ? null : value)}
      filters={filters}
      queries={queries}
      onOpenUrl={onOpenUrl}
      onOpenDomain={onOpenDomain}
    />
  );
}

export function SourcesPanel({
  dimension,
  onChangeDimension,
  filters,
  queries,
  domain = null,
  onOpenUrl,
  onOpenDomain,
}: Readonly<{
  dimension: 'domain' | 'url';
  onChangeDimension?: (value: string) => void;
  filters: SourceFilters;
  queries: SourceQueries;
  /** Set on a domain's own page, where the table lists only its pages. */
  domain?: string | null;
  onOpenUrl: (url: string) => void;
  /** Required whenever the domain dimension can be shown. */
  onOpenDomain?: (domain: string) => void;
}>) {
  const [offset] = useUrlState('source_offset', optionalStringUrlCodec);
  const [asOf] = useUrlState('source_as_of', optionalStringUrlCodec);
  const [sourceType, setSourceType] = useUrlState('source_type', optionalStringUrlCodec, {
    clearKeys: ['source_offset', 'source_as_of'],
  });
  const [pageSize, setPageSize] = useState<TablePageSize>(TABLE_DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);

  const scope = { dimension, domain, offset, asOf, sourceType, pageSize };
  const { sourceQuery } = useSourceAnalysis(filters, queries, scope);
  const seriesQuery = useSourceSeries(filters, queries, { dimension, domain, sourceType });

  const data = sourceQuery.data;
  const types = availableTypes(data?.category_totals, dimension);
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

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      {onChangeDimension ? (
        <SegmentedControl
          value={dimension}
          onChange={onChangeDimension}
          options={DIMENSIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
          ariaLabel="Source dimension"
        />
      ) : null}

      <div className="grid gap-[var(--workspace-gap)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <UsageCard dimension={dimension} query={seriesQuery} />
        <TypesCard slices={slices} total={data?.total_citations ?? 0} query={sourceQuery} />
      </div>

      <Card className="relative">
        <BusyBar active={sourceQuery.isFetching} label="Updating sources" />
        <SourceTableToolbar
          dimension={dimension}
          search={search}
          onSearch={setSearch}
          rows={rows}
          domain={domain}
          typeControl={
            types.length > 1 ? (
              <AnalysisChoice
                label={dimension === 'url' ? 'Filter by URL type' : 'Filter by domain type'}
                value={sourceType ?? 'all'}
                options={[
                  {
                    value: 'all',
                    label: dimension === 'url' ? 'All URL types' : 'All domain types',
                  },
                  ...types.map((type) => ({ value: type.token, label: type.label })),
                ]}
                onChange={(value) => setSourceType(value === 'all' ? null : value)}
              />
            ) : null
          }
        />
        <CardContent className="p-0">
          <TableBody
            dimension={dimension}
            query={sourceQuery}
            rows={rows}
            sort={sort}
            onSort={onSort}
            onOpenUrl={onOpenUrl}
            onOpenDomain={onOpenDomain}
            narrowed={Boolean(search || sourceType)}
            searching={Boolean(search)}
          />
          <SourcePaging
            data={data}
            domain={domain}
            dimension={dimension}
            offset={Math.max(0, Number.parseInt(offset ?? '0', 10) || 0)}
            pageSize={pageSize}
            busy={sourceQuery.isFetching}
            onPageSizeChange={(value) => {
              setPageSize(isTablePageSize(value) ? value : TABLE_DEFAULT_PAGE_SIZE);
              setUrlParams({ source_offset: null, source_as_of: null });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** The usage-over-time chart, and the states it can be in instead. */
function UsageCard({
  dimension,
  query,
}: Readonly<{
  dimension: 'domain' | 'url';
  query: ReturnType<typeof useSourceSeries>;
}>) {
  const series = toChartSeries(query.data);
  const urls = dimension === 'url';
  return (
    <Card className="relative">
      <BusyBar active={query.isFetching} label="Updating usage" />
      <CardHeader>
        <CardTitle>{urls ? 'Source usage by URL' : 'Source usage by domain'}</CardTitle>
        <p className={textRole('meta', 'text-secondary')}>
          {`How often each of the leading ${urls ? 'pages' : 'domains'} was used as a source, as a share of the answers in each period.`}
        </p>
      </CardHeader>
      <CardContent>
        <UsagePlot query={query} series={series} />
      </CardContent>
    </Card>
  );
}

/** The plot, or the one state standing in for it. */
function UsagePlot({
  query,
  series,
}: Readonly<{
  query: ReturnType<typeof useSourceSeries>;
  series: ReturnType<typeof toChartSeries>;
}>) {
  if (query.isError) return <Alert tone="danger">Could not load source usage.</Alert>;
  if (query.isLoading) return <Skeleton className="h-[200px] w-full" />;
  if (!series.length) {
    return (
      <p className={textRole('meta', 'text-secondary')}>No sources were used in this period.</p>
    );
  }
  return (
    <SeriesChart
      series={series}
      labels={(query.data?.buckets ?? []).map(bucketLabel)}
      domainMax={seriesCeiling(series)}
      yAxisLabel="Share of answers"
    />
  );
}

/** The citation mix, counted server-side over the whole selection. */
function TypesCard({
  slices,
  total,
  query,
}: Readonly<{
  slices: ReturnType<typeof typeSlices>;
  total: number;
  query: ReturnType<typeof useSourceAnalysis>['sourceQuery'];
}>) {
  return (
    <Card className="relative">
      <BusyBar active={query.isFetching} label="Updating source types" />
      <CardHeader>
        <CardTitle>Source types</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <DonutChart
            slices={slices}
            total={total}
            totalLabel="Citations"
            emptyLabel="No citations in this selection."
          />
        )}
      </CardContent>
    </Card>
  );
}

/** Whichever table the dimension calls for, or the state standing in for it. */
function TableBody({
  dimension,
  query,
  rows,
  sort,
  onSort,
  onOpenUrl,
  onOpenDomain,
  narrowed,
  searching,
}: Readonly<{
  dimension: 'domain' | 'url';
  query: ReturnType<typeof useSourceAnalysis>['sourceQuery'];
  rows: ReturnType<typeof sortItems>;
  sort: SortState;
  onSort: (column: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenDomain?: (domain: string) => void;
  narrowed: boolean;
  searching: boolean;
}>) {
  if (query.isError) return <Alert tone="danger">Could not load sources.</Alert>;
  if (query.isLoading) return <Skeleton className="m-[var(--card-padding)] h-40" />;
  if (rows.length === 0) {
    return (
      <p className={textRole('body', 'text-secondary p-[var(--card-padding)]')}>
        {searching
          ? 'No sources on this page match your search.'
          : narrowed
            ? 'No sources of this type in this selection.'
            : 'No cited sources in this selection.'}
      </p>
    );
  }
  return dimension === 'url' ? (
    <UrlTable rows={rows} sort={sort} onSort={onSort} onOpenUrl={onOpenUrl} />
  ) : (
    <DomainTable rows={rows} sort={sort} onSort={onSort} onOpenDomain={onOpenDomain} />
  );
}

/** A bucket boundary as an axis tick — the date, never the time. */
function bucketLabel(value: string): string {
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? value
    : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
