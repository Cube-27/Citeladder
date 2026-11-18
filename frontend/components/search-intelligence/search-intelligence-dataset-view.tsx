import { useState } from 'react';
import { SearchX } from 'lucide-react';

import { ProjectLink } from '@/components/ui/project-link';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { Inline, Stack } from '@/components/ui/layout';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { SearchField } from '@/components/ui/search-field';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { agentHandoffHref, type HandoffInput } from '@/lib/agent/handoff';
import { useAgentPanelSeed } from '@/lib/agent/panel-context';
import {
  searchIntelligenceQueries,
  type SearchIntelligenceDataset,
  type SearchIntelligenceRow,
} from '@/lib/api/search-intelligence';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';
import { Absence } from '@/components/ui/absence';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { TABLE_SEARCH_DEBOUNCE_MS } from '@/lib/config/operational';
import { useDebounced } from '@/lib/use-debounced';
import { evidenceFields, searchNumber } from './search-intelligence-format';
import { SEARCH_COLUMNS_BY_KIND } from '@/lib/config/search-intelligence';
import { visibilityRunSourcesHref } from '@/lib/visibility/use-visibility-dashboard';
import { SearchIntelligenceExport } from './search-intelligence-export';
import type { KeywordFilterValues } from './search-intelligence-collection-state';
import {
  SearchIntelligenceRows,
  searchIntelligenceColumns,
} from './search-intelligence-rows-table';
import { StateBlock } from '@/components/ui/state-block';

/**
 * One saved dataset's rows. The table's own toolbar keeps only the search,
 * Export and Ask agent; the keyword filters (minimum volume, intent) ride the
 * page's control strip with the other pickers and arrive here as values.
 */
export function SearchIntelligenceDatasetView({
  dataset,
  title = 'Ranking keywords',
  description,
  keywordFilters,
}: Readonly<{
  dataset: SearchIntelligenceDataset;
  title?: string;
  /** The caption under the title, e.g. which competitor the rows compare with. */
  description?: string;
  keywordFilters?: KeywordFilterValues;
}>) {
  const { workspaceId, projectId } = useProjectScope();
  const [selected, setSelected] = useState<SearchIntelligenceRow | null>(null);
  const [filter, setFilter] = useState('');
  const search = useDebounced(filter, TABLE_SEARCH_DEBOUNCE_MS);
  const [order, setOrder] = useState<{ sort: string; direction: 'asc' | 'desc' }>({
    sort: 'id',
    direction: 'asc',
  });
  const minVolume = keywordFilters?.minVolume ?? '';
  const filters = {
    ...order,
    search,
    intent: keywordFilters?.intent ?? '',
    min_volume: minVolume === '' ? undefined : Number(minVolume),
  };
  const hasRows = dataset.unique_rows_saved > 0;
  // A sort or filter edit restarts from the first page: the server binds the
  // cursor to them. A page turn or a filter edit keeps the rows and the pager
  // on screen until the next rows land; the first load, a failed read and an
  // empty view draw inside the table at its full height.
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
    // A dataset that saved nothing has no rows to read.
    enabled: hasRows,
    total: (current) => (current ? filteredSavedCount(current.dataset) : undefined),
  });
  const rows = page?.items ?? [];
  useRowsPanelSeed(dataset.id, selected, page?.items, title);
  if (!hasRows) return <EmptyDataset dataset={dataset} />;
  return (
    <>
      <DataTable
        title={title}
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
          // The pager states the row count; the live note only reports a read.
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
            setOrder({
              sort,
              direction: order.sort === sort && order.direction === 'asc' ? 'desc' : 'asc',
            }),
        })}
        {...table}
        footer={datasetSummary(dataset)}
      >
        <SearchIntelligenceRows kind={dataset.dataset_kind} rows={rows} onSelect={setSelected} />
      </DataTable>
      <EvidenceDrawer selected={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/** The agent panel starts from the open row, or else the rows on this page. */
function useRowsPanelSeed(
  datasetId: string,
  selected: SearchIntelligenceRow | null,
  pageRows: readonly SearchIntelligenceRow[] | undefined,
  title?: string,
): void {
  const rows = selected ? [selected] : (pageRows ?? []);
  useAgentPanelSeed(rows.length > 0 ? rowsHandoff(datasetId, rows, title) : null);
}

/**
 * Ask agent about saved rows. Only their ids travel; the server re-reads and
 * authorizes them. A table page never exceeds the 100-row reference cap.
 */
function rowsHandoff(
  datasetId: string,
  rows: readonly SearchIntelligenceRow[],
  title?: string,
): HandoffInput {
  const [first] = rows;
  const subject =
    rows.length === 1 && first
      ? `the Keyword research row for "${first.keyword || first.url || first.domain}"`
      : `these ${rows.length} ${title ?? 'Keyword research'} rows`;
  return {
    searchIntelligence: { datasetId, rowIds: rows.map((row) => row.id) },
    prompt: `Help me act on ${subject}.`,
  };
}

function EvidenceDrawer({
  selected,
  onClose,
}: Readonly<{ selected: SearchIntelligenceRow | null; onClose: () => void }>) {
  return (
    <Drawer
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Row details"
      description="What the provider reported for this result when it was saved."
    >
      {selected ? (
        <Inline className="flex-wrap">
          {selected.action_id ? (
            <ActionButton action="openAction" href={`/actions/${selected.action_id}`} />
          ) : null}
          <Button variant="secondary" asChild className="w-fit">
            <ProjectLink href={agentHandoffHref(rowsHandoff(selected.dataset_id, [selected]))}>
              Ask agent about this row
            </ProjectLink>
          </Button>
        </Inline>
      ) : null}
      {selected?.row_kind === 'citation_match' &&
      typeof selected.auxiliary.audit_id === 'string' ? (
        <TextLink href={visibilityRunSourcesHref(selected.auxiliary.audit_id)} className="w-fit">
          View in Sources
        </TextLink>
      ) : null}
      {selected ? <RowFields row={selected} /> : null}
    </Drawer>
  );
}

function RowFields({ row }: Readonly<{ row: SearchIntelligenceRow }>) {
  const timeZone = useDisplayTimeZone();
  const labels = Object.fromEntries(
    (SEARCH_COLUMNS_BY_KIND[row.row_kind] ?? []).map((column) => [column.field, column.label]),
  );
  return (
    <dl className={ledgerClasses('type-body text-ink-2')}>
      {evidenceFields(row, labels, timeZone).map((field) => (
        <Stack key={field.key} gap="tight" className={ledgerItemClasses('min-w-0')}>
          <dt className="text-ink-2">{field.label}</dt>
          <dd className="min-w-0">
            {field.value === null ? <Absence /> : <ClampText>{field.value}</ClampText>}
          </dd>
        </Stack>
      ))}
    </dl>
  );
}

/** A saved dataset with no rows: what the provider answered, as the region's one state. */
function EmptyDataset({ dataset }: Readonly<{ dataset: SearchIntelligenceDataset }>) {
  const scope = `${dataset.target_hostname}${
    dataset.comparison_origin
      ? `, compared with ${new URL(dataset.comparison_origin).hostname}`
      : ''
  }`;
  return (
    <StateBlock
      kind="empty"
      icon={SearchX}
      heading={emptyDatasetHeading(dataset)}
      description={`0 saved rows for ${scope}. Requests can incur charges even when no results are returned, so check the website and market before reviewing another analysis.`}
    />
  );
}

/**
 * What a dataset that saved no rows means, by the coverage acquisition
 * recorded: `empty` (the provider answered with no rows) is a measured
 * "no data"; `complete` is "no data" only when no raw rows arrived either,
 * otherwise rows arrived and none were saved; `unknown` is unavailable
 * evidence; `partial` is incomplete evidence, never "no data".
 */
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

/**
 * What the saved dataset covers, under its table, or null when there is
 * nothing to add. The pager already counts the rows and the page's caption
 * names the website, so this says only what neither does: how many results
 * the provider had, and whether the save was cut short.
 */
function datasetSummary(dataset: SearchIntelligenceDataset) {
  const coverage = [
    dataset.provider_total === null
      ? null
      : `${searchNumber(dataset.provider_total)} available from the provider`,
    dataset.truncated ? 'Truncated' : null,
  ].filter((part) => part !== null);
  const actions = dataset.dataset_kind === 'missing_keywords';
  if (!coverage.length && !actions) return null;
  return (
    <>
      {coverage.length ? <p className={textRole('caption')}>{coverage.join(' · ')}</p> : null}
      {actions ? (
        <p className={textRole('caption')}>
          Gaps with real search volume where a competitor ranks in the top 10 become{' '}
          <TextLink href="/actions">Actions</TextLink>. Open a row to see its Action.
        </p>
      ) : null}
    </>
  );
}
