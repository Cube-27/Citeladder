'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CursorTableFooter } from '@/components/ui/cursor-table-footer';
import { Drawer } from '@/components/ui/drawer';
import { ReadError } from '@/components/ui/read-error';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { httpErrorStatus } from '@/lib/api/errors';
import {
  searchIntelligenceApi,
  type SearchIntelligenceDataset,
  type SearchIntelligenceRow,
} from '@/lib/api/search-intelligence';
import { searchIntelligenceKeys } from '@/lib/api/query-keys/search-intelligence';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { pageRange, useCursorTable } from '@/lib/table/use-cursor-table';
import { formatEvidenceValue, formatSearchNumber } from './search-intelligence-format';
import { searchScopeLabel } from '@/lib/config/search-intelligence';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SearchIntelligenceExport } from './search-intelligence-export';
import { SearchIntelligenceRowsTable } from './search-intelligence-rows-table';

function useDatasetRows(
  datasetId: string,
  projectId: string | undefined,
  workspaceId: string | undefined,
  params: {
    cursor?: string;
    limit: number;
    sort: string;
    direction: 'asc' | 'desc';
    search: string;
    min_volume?: number;
  },
) {
  const scope = searchIntelligenceKeys.dataset(workspaceId, projectId, datasetId);
  const scopeKey = scope.join(':');
  const [lastPage, setLastPage] = useState<{
    scopeKey: string;
    data: Awaited<ReturnType<typeof searchIntelligenceApi.rows>>;
  } | null>(null);
  const query = useQuery({
    queryKey: [...scope, params],
    queryFn: async ({ signal }) => {
      const data = await searchIntelligenceApi.rows(
        projectId!,
        datasetId,
        { signal, workspaceId },
        params,
      );
      setLastPage({ scopeKey, data });
      return data;
    },
    enabled: Boolean(projectId && workspaceId),
    retry: false,
  });
  const accessFailure =
    query.isError && [401, 403, 404].includes(httpErrorStatus(query.error) ?? 0);
  const retainedPage = lastPage?.scopeKey === scopeKey ? lastPage.data : undefined;
  const page = accessFailure ? undefined : (query.data ?? retainedPage);
  return { query, page };
}

export function SearchIntelligenceDatasetView({
  dataset,
  title = 'Ranking keywords',
  onExpand,
}: Readonly<{ dataset: SearchIntelligenceDataset; title?: string; onExpand?: () => void }>) {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const [selected, setSelected] = useState<SearchIntelligenceRow | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Record<string, SearchIntelligenceRow>>(
    {},
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [minVolume, setMinVolume] = useState('');
  const [intent, setIntent] = useState('');
  const [order, setOrder] = useState<{ sort: string; direction: 'asc' | 'desc' }>({
    sort: 'id',
    direction: 'asc',
  });
  const table = useCursorTable(
    `${activeProject?.workspace_id}:${activeProject?.id}:${dataset.id}:${order.sort}:${order.direction}:${filter}:${minVolume}:${intent}`,
  );
  const params = {
    cursor: table.cursor,
    limit: table.pageSize,
    ...order,
    search: filter,
    intent,
    min_volume: minVolume === '' ? undefined : Number(minVolume),
  };
  const { query, page } = useDatasetRows(
    dataset.id,
    activeProject?.id,
    activeProject?.workspace_id,
    params,
  );
  const handoff = useMutation({
    mutationFn: () =>
      searchIntelligenceApi.contentHandoff(
        activeProject!.id,
        dataset.id,
        Object.keys(selectedEvidence),
        { workspaceId: activeProject!.workspace_id },
      ),
    onSuccess: (payload) => {
      sessionStorage.setItem('citeladder:search-intelligence-handoff', JSON.stringify(payload));
      navigate(projectHref('/content?source=search-intelligence'));
    },
  });
  const selectable = [
    'ranking_keywords',
    'keyword_suggestions',
    'missing_keywords',
    'shared_keywords',
  ].includes(dataset.dataset_kind);
  if (query.isPending && !page) return <Skeleton className="h-80 w-full" />;
  if (!page)
    return (
      <ReadError
        error={query.error}
        fallback="Dataset rows could not be loaded."
        onRetry={() => void query.refetch()}
      />
    );
  if (!dataset.unique_rows_saved && !page.rows.length)
    return <EmptyDataset dataset={dataset} title={title} />;
  const rows = page.rows;
  const range = pageRange(table.page, table.pageSize, rows.length);
  const selectedCount = Object.keys(selectedEvidence).length;
  return (
    <>
      <Card className="min-w-0">
        <DatasetHeader dataset={dataset} title={title} />
        <CardContent flush>
          <div className="border-border-subtle flex min-h-14 flex-wrap items-center gap-2 border-b px-[var(--table-cell-padding-x)] py-2">
            <SearchField
              value={filter}
              onValueChange={setFilter}
              aria-label="Filter saved results"
              placeholder="Filter saved results"
              className="min-w-0 flex-1 basis-48"
            />
            <KeywordFilters
              enabled={selectable}
              minVolume={minVolume}
              setMinVolume={setMinVolume}
              intent={intent}
              setIntent={setIntent}
            />
            <SearchIntelligenceExport dataset={dataset} params={params} />
            <DepthReviewAction onExpand={onExpand} />
          </div>
          {handoff.isError ? <Alert>{handoff.error.message}</Alert> : null}
          {query.isError ? (
            <Alert>
              Saved rows could not be updated.{' '}
              <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
                Retry read
              </Button>
            </Alert>
          ) : null}
          <div
            aria-busy={query.isFetching}
            style={{
              minHeight: `calc(var(--table-header-height) + ${table.pageSize} * var(--table-row-height))`,
            }}
          >
            <SearchIntelligenceRowsTable
              kind={dataset.dataset_kind}
              rows={rows}
              selectable={selectable}
              selectedEvidence={selectedEvidence}
              setSelectedEvidence={setSelectedEvidence}
              order={order}
              onSelect={setSelected}
              onSort={(sort) => {
                setOrder({
                  sort,
                  direction: order.sort === sort && order.direction === 'asc' ? 'desc' : 'asc',
                });
                table.reset();
              }}
            />
          </div>
          <output
            className={textRole('meta', 'flex h-6 items-center px-[var(--table-cell-padding-x)]')}
            aria-live="polite"
          >
            {query.isFetching ? 'Updating saved rows…' : `${rows.length} rows shown`}
          </output>
          <EvidenceSelection
            selectable={selectable}
            count={selectedCount}
            onReview={() => setReviewOpen(true)}
          />
          <CursorTableFooter
            {...range}
            total={filteredSavedCount(page.dataset)}
            noun="evidence rows"
            pageSize={table.pageSize}
            onPageSizeChange={table.setPageSize}
            canPrev={table.canPrev}
            canNext={Boolean(page.next_cursor)}
            onPrev={table.pop}
            onNext={() => table.push(page.next_cursor)}
            busy={query.isFetching}
          />
        </CardContent>
      </Card>
      <Drawer
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title="Use this evidence in Content"
        description={`${selectedCount} saved rows · ${dataset.target_hostname}`}
        footer={
          <Button disabled={handoff.isPending} onClick={() => handoff.mutate()}>
            Continue to Content
          </Button>
        }
      >
        <div className="grid gap-4">
          <p className={textRole('body')}>
            These saved facts will be attached as read-only context. Write your instructions in
            Content.
          </p>
          <ul className="grid gap-3">
            {Object.values(selectedEvidence).map((row) => (
              <li key={row.id} className="border-border rounded-[var(--radius-card)] border p-3">
                <p className={textRole('bodyStrong')}>{row.keyword || row.domain || row.url}</p>
                <p className={textRole('meta')}>
                  Volume: {formatSearchNumber(row.search_volume)} · Position:{' '}
                  {formatSearchNumber(row.rank_group)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Drawer>
      <EvidenceDrawer selected={selected} onClose={() => setSelected(null)} />
    </>
  );
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
      title="Provider evidence"
      description="Persisted normalized row and provider metadata."
    >
      {selected?.row_kind === 'citation_match' &&
      typeof selected.auxiliary.audit_id === 'string' ? (
        <ProjectLink
          className="focus-ring text-accent-text inline-flex underline"
          href={`/visibility?tab=sources&audit=${selected.auxiliary.audit_id}`}
        >
          View in Sources
        </ProjectLink>
      ) : null}
      {selected ? (
        <dl className="grid gap-3 text-sm">
          {Object.entries(selected).map(([key, item]) => (
            <div key={key} className="border-border-subtle grid gap-1 border-b pb-2">
              <dt className="text-muted">{key.replaceAll('_', ' ')}</dt>
              <dd className="break-all">{formatEvidenceValue(item)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Drawer>
  );
}

function EmptyDataset({
  dataset,
  title,
}: Readonly<{ dataset: SearchIntelligenceDataset; title: string }>) {
  return (
    <Card>
      <CardHeader bordered>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 py-[var(--workspace-gap)]">
        <p className={textRole('bodyStrong')}>
          {dataset.coverage === 'unknown'
            ? 'Provider evidence is unavailable for this saved scope.'
            : 'The provider returned no data for this saved scope.'}
        </p>
        <p className={textRole('body')}>
          Requests can incur charges even when no results are returned. Check the website and market
          in Analysis settings before reviewing another fetch.
        </p>
        <p className={textRole('meta')}>
          {dataset.target_hostname}
          {dataset.comparison_origin
            ? ` · compared with ${new URL(dataset.comparison_origin).hostname}`
            : ''}{' '}
          · 0 saved rows
        </p>
      </CardContent>
    </Card>
  );
}

function KeywordFilters({
  enabled,
  minVolume,
  setMinVolume,
  intent,
  setIntent,
}: Readonly<{
  enabled: boolean;
  minVolume: string;
  setMinVolume: (value: string) => void;
  intent: string;
  setIntent: (value: string) => void;
}>) {
  if (!enabled) return null;
  return (
    <>
      <Input
        aria-label="Minimum search volume"
        placeholder="Min. search volume"
        className="w-40"
        type="number"
        min={0}
        value={minVolume}
        onChange={(event) => setMinVolume(event.target.value)}
      />
      <Select
        ariaLabel="Saved keyword intent"
        value={intent || 'any'}
        onValueChange={(value) => setIntent(value === 'any' ? '' : value)}
        options={['any', 'informational', 'commercial', 'navigational', 'transactional'].map(
          (value) => ({ value, label: value === 'any' ? 'Any intent' : value }),
        )}
      />
    </>
  );
}

function EvidenceSelection({
  selectable,
  count,
  onReview,
}: Readonly<{ selectable: boolean; count: number; onReview: () => void }>) {
  if (!selectable || count === 0) return null;
  return (
    <div className="border-border-subtle flex min-h-14 flex-wrap items-center justify-between gap-3 border-b px-[var(--table-cell-padding-x)] py-2">
      <span className={textRole('body')}>
        {count} evidence {count === 1 ? 'row' : 'rows'} selected
      </span>
      <Button size="sm" onClick={onReview}>
        Create content brief
      </Button>
    </div>
  );
}

function filteredSavedCount(dataset: SearchIntelligenceDataset) {
  return typeof dataset.filtered_saved_count === 'number'
    ? dataset.filtered_saved_count
    : dataset.unique_rows_saved;
}

function DepthReviewAction({ onExpand }: Readonly<{ onExpand?: () => void }>) {
  return onExpand ? (
    <Button variant="ghost" size="sm" onClick={onExpand}>
      Review depth
    </Button>
  ) : null;
}

function DatasetHeader({
  dataset,
  title,
}: Readonly<{ dataset: SearchIntelligenceDataset; title: string }>) {
  return (
    <CardHeader bordered className="flex-row items-center justify-between">
      <div>
        <CardTitle>{title}</CardTitle>
        <p className={textRole('meta')}>
          {formatSearchNumber(dataset.unique_rows_saved)} saved rows
          {dataset.provider_total !== null
            ? ` of ${formatSearchNumber(dataset.provider_total)} available`
            : ''}
          {' · '}
          {dataset.target_hostname}
          {' · '}
          {searchScopeLabel(dataset.research_scope)}
          {dataset.truncated ? ' · truncated' : ''}
        </p>
      </div>
    </CardHeader>
  );
}
