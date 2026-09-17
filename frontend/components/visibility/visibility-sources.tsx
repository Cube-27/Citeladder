'use client';

import { useState, type ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stack } from '@/components/ui/layout';
import { AnalysisChoice } from '@/components/visibility/analysis-choice';
import { CitedSourcesStrip } from '@/components/visibility/cited-sources-strip';
import { SourcePaging, SourceTotals, SourceTypes } from '@/components/visibility/source-panels';
import { SourcePageDrawer } from '@/components/visibility/source-page-drawer';
import { SourceTable, type SourceFilters } from '@/components/visibility/source-rows';
import { TABLE_DEFAULT_PAGE_SIZE, isTablePageSize, type TablePageSize } from '@/lib/config/tables';
import { optionalStringUrlCodec, setUrlParams, useUrlState } from '@/lib/navigation/url-state';
import { textRole } from '@/components/ui/typography';
import {
  useSourceAnalysis,
  useSourceTypes,
  type SourceQueries,
} from '@/lib/visibility/use-source-analysis';

/**
 * Mentions & Citations: the persisted answer evidence, with the cited-source
 * rollup above it and the full domain table behind one switch.
 */
export function VisibilitySources({
  filters,
  queries,
  children,
}: Readonly<{
  filters: SourceFilters;
  queries: SourceQueries;
  children: ReactNode;
}>) {
  const [domain] = useUrlState('source_domain', optionalStringUrlCodec);
  const [offset] = useUrlState('source_offset', optionalStringUrlCodec);
  const [asOf] = useUrlState('source_as_of', optionalStringUrlCodec);
  const [pageSize, setPageSize] = useState<TablePageSize>(TABLE_DEFAULT_PAGE_SIZE);
  // A different type is a different result set, so its offset cursor cannot
  // carry over — page three of one filter is not page three of another.
  const [sourceType, setSourceType] = useUrlState('source_type', optionalStringUrlCodec, {
    clearKeys: ['source_offset', 'source_as_of'],
  });
  // `filters.sourceMode` is the one reader of `?mode=`; declaring a second
  // codec here meant the default lived in three files that had to agree.
  const { params, sourceQuery } = useSourceAnalysis(filters, queries, {
    mode: filters.sourceMode,
    domain,
    offset,
    asOf,
    sourceType,
    pageSize,
  });

  if (filters.sourceMode === 'answers') {
    return (
      <Stack gap="workspace">
        {filters.competitor ? (
          <p className={textRole('meta', 'text-secondary')}>
            Answers naming {filters.competitor} but not you.
          </p>
        ) : null}
        <CitedSourcesStrip
          data={sourceQuery.data}
          activeDomain={filters.domain}
          onSelectDomain={(value) => filters.openEvidence({ domain: value })}
          onOpenTable={() => setUrlParams({ mode: 'sources' })}
        />
        {children}
      </Stack>
    );
  }
  return (
    <Stack gap="workspace">
      <SourcesPanel
        filters={filters}
        queries={queries}
        sourceQuery={sourceQuery}
        domain={domain}
        offset={params.offset}
        pageSize={pageSize}
        onPageSizeChange={(value) => {
          setPageSize(isTablePageSize(value) ? value : TABLE_DEFAULT_PAGE_SIZE);
          setUrlParams({ source_offset: null, source_as_of: null });
        }}
        sourceType={sourceType}
        onChangeSourceType={setSourceType}
      />
    </Stack>
  );
}

/** The cited-sources half: the totals band, the domain table, and the mix. */
function SourcesPanel({
  filters,
  queries,
  sourceQuery,
  domain,
  offset,
  pageSize,
  onPageSizeChange,
  sourceType,
  onChangeSourceType,
}: Readonly<{
  filters: SourceFilters;
  queries: SourceQueries;
  sourceQuery: ReturnType<typeof useSourceAnalysis>['sourceQuery'];
  domain: string | null;
  offset: number;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  sourceType: string | null;
  onChangeSourceType: (value: string | null) => void;
}>) {
  const [openHash, setOpenHash] = useState<string | null>(null);
  const data = sourceQuery.data;
  const types = useSourceTypes(data);
  const rows = data?.items ?? [];
  return (
    <>
      <SourceTotals
        data={data}
        domain={domain}
        citations={queries.visibilityQuery.data?.citation_totals}
      />
      <div className="grid gap-[var(--workspace-gap)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>{domain ? `Cited pages · ${domain}` : 'Source domains'}</CardTitle>
              <p className={textRole('meta', 'text-secondary')}>
                {domain
                  ? 'The pages on this domain the models cited.'
                  : 'Ordered by how many answers cited them.'}
              </p>
            </div>
            {types.length > 1 ? (
              <AnalysisChoice
                label="Filter by source type"
                value={sourceType ?? 'all'}
                options={[
                  { value: 'all', label: 'All source types' },
                  ...types.map((type) => ({ value: type.token, label: type.label })),
                ]}
                onChange={(value) => onChangeSourceType(value === 'all' ? null : value)}
              />
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {sourceQuery.isError ? (
              <Alert tone="danger">Could not load cited sources.</Alert>
            ) : null}
            {sourceQuery.isLoading ? <p aria-busy="true">Loading sources…</p> : null}
            <SourceTable
              rows={rows}
              domain={domain}
              filters={filters}
              activeRunId={queries.activeRunId}
              onInspectPage={setOpenHash}
            />
            {data && rows.length === 0 ? (
              <p className={textRole('body', 'text-secondary p-[var(--card-padding)]')}>
                {sourceType
                  ? 'No sources of this type in this selection.'
                  : 'No cited sources in this selection.'}
              </p>
            ) : null}
            <SourcePaging
              data={data}
              domain={domain}
              offset={offset}
              pageSize={pageSize}
              busy={sourceQuery.isFetching}
              onPageSizeChange={onPageSizeChange}
            />
          </CardContent>
        </Card>
        <SourceTypes types={types} selected={sourceType} />
      </div>
      <SourcePageDrawer
        projectId={queries.projectId}
        workspaceId={queries.workspaceId}
        urlHash={openHash}
        onClose={() => setOpenHash(null)}
      />
    </>
  );
}
