import { useState } from 'react';

import { ProjectLink } from '@/components/ui/project-link';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/typography';
import { SearchX } from '@/lib/icons';
import { agentHandoffHref, type HandoffInput } from '@/lib/agent/handoff';
import { useAgentPanelSeed } from '@/lib/agent/panel-context';
import {
  searchIntelligenceQueries,
  type SearchIntelligenceDataset,
  type SearchIntelligenceRow,
} from '@/lib/api/search-intelligence';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';
import { TABLE_SEARCH_DEBOUNCE_MS } from '@/lib/config/operational';
import { useDebounced } from '@/lib/use-debounced';
import { datasetCoverage } from './search-intelligence-format';
import { defaultRowOrder, type SearchRowOrder } from '@/lib/config/search-intelligence';
import { SearchIntelligenceExport } from './search-intelligence-export';
import type { KeywordFilterValues } from './search-intelligence-collection-state';
import {
  SearchIntelligenceRows,
  searchIntelligenceColumns,
} from './search-intelligence-rows-table';
import { StateBlock } from '@/components/ui/state-block';

export function SearchIntelligenceDatasetView({
  dataset,
  title = 'Ranking keywords',
  description,
  keywordFilters,
}: Readonly<{
  dataset: SearchIntelligenceDataset;
  title?: string;
  description?: string;
  keywordFilters?: KeywordFilterValues;
}>) {
  const { workspaceId, projectId } = useProjectScope();
  const [filter, setFilter] = useState('');
  const search = useDebounced(filter, TABLE_SEARCH_DEBOUNCE_MS);
  const [chosenOrder, setChosenOrder] = useState<SearchRowOrder | null>(null);
  const order = chosenOrder ?? defaultRowOrder(dataset.dataset_kind);
  const minVolume = keywordFilters?.minVolume ?? '';
  const filters = {
    ...order,
    search,
    intent: keywordFilters?.intent ?? '',
    min_volume: minVolume === '' ? undefined : Number(minVolume),
  };
  const hasRows = dataset.unique_rows_saved > 0;
  const { query, page, table } = useCursorTableQuery({
    workspaceId,
    scopeId: dataset.id,
    scope: filters,
    query: (request) =>
      searchIntelligenceQueries.datasetRows({ workspaceId, projectId }, dataset.id, {
        ...filters,
        ...request,
      }),
    noun: 'evidence rows',
    loading: 'Loading saved rows…',
    subject: 'the saved rows',
    empty: () => ({
      kind: 'empty',
      icon: SearchX,
      heading: 'No saved rows match this view',
      headingLevel: 3,
    }),
    enabled: hasRows,
    total: (current) => (current ? filteredSavedCount(current.dataset) : undefined),
  });
  const rows = page?.items ?? [];
  useAgentPanelSeed(rows.length > 0 ? rowsHandoff(dataset.id, rows, title) : null);
  if (!hasRows) return <EmptyDataset dataset={dataset} />;
  return (
    <DataTable
      label={title}
      description={description}
      toolbar={{
        search: (
          <SearchField
            value={filter}
            onValueChange={setFilter}
            aria-label="Filter saved results"
            placeholder="Filter saved results"
          />
        ),
        status: query.isFetching ? 'Updating saved rows…' : null,
        actions: (
          <>
            <SearchIntelligenceExport dataset={dataset} params={filters} />
            {rows.length > 0 ? (
              <Button variant="secondary" asChild>
                <ProjectLink href={agentHandoffHref(rowsHandoff(dataset.id, rows, title))}>
                  Ask agent
                </ProjectLink>
              </Button>
            ) : null}
          </>
        ),
      }}
      columns={searchIntelligenceColumns({
        kind: dataset.dataset_kind,
        order,
        onSort: (sort) =>
          setChosenOrder({
            sort,
            direction: order.sort === sort && order.direction === 'asc' ? 'desc' : 'asc',
          }),
      })}
      {...table}
      footer={datasetSummary(dataset)}
    >
      <SearchIntelligenceRows kind={dataset.dataset_kind} rows={rows} />
    </DataTable>
  );
}

function rowsHandoff(
  datasetId: string,
  rows: readonly SearchIntelligenceRow[],
  title?: string,
): HandoffInput {
  return {
    searchIntelligence: { datasetId, rowIds: rows.map((row) => row.id) },
    prompt: `Help me act on these ${rows.length} ${title ?? 'Keyword research'} rows.`,
  };
}

function EmptyDataset({ dataset }: Readonly<{ dataset: SearchIntelligenceDataset }>) {
  if (dataset.dataset_kind === 'citation_matches' && dataset.coverage !== 'unknown')
    return (
      <StateBlock
        kind="empty"
        icon={SearchX}
        heading="No citations matched"
        description={datasetCoverage(dataset) ?? undefined}
      />
    );
  return (
    <StateBlock
      kind="empty"
      icon={SearchX}
      heading={emptyDatasetHeading(dataset)}
      description="Charged even with no results."
    />
  );
}

function emptyDatasetHeading({
  coverage,
  raw_rows_received,
}: Pick<SearchIntelligenceDataset, 'coverage' | 'raw_rows_received'>) {
  const noData = 'The provider returned no data for this saved scope.';
  if (coverage === 'empty') return noData;
  if (coverage === 'complete')
    return raw_rows_received > 0
      ? 'The provider returned results, but none were saved for this scope.'
      : noData;
  if (coverage === 'unknown') return 'Provider evidence is unavailable for this saved scope.';
  return 'Provider evidence for this saved scope is incomplete, and no rows were saved.';
}

function filteredSavedCount(dataset: SearchIntelligenceDataset) {
  return typeof dataset.filtered_saved_count === 'number'
    ? dataset.filtered_saved_count
    : dataset.unique_rows_saved;
}

function datasetSummary(dataset: SearchIntelligenceDataset) {
  const coverage = datasetCoverage(dataset);
  return coverage ? (
    <Text as="p" variant="caption">
      {coverage}
    </Text>
  ) : null;
}
