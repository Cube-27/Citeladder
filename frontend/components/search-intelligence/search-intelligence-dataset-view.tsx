'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CursorTableFooter } from '@/components/ui/cursor-table-footer';
import { Drawer } from '@/components/ui/drawer';
import { ReadError } from '@/components/ui/read-error';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { sortIndicator } from '@/components/ui/sort-indicator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { httpErrorStatus } from '@/lib/api/errors';
import {
  searchIntelligenceApi,
  type SearchIntelligenceDataset,
  type SearchIntelligenceRow,
} from '@/lib/api/search-intelligence';
import { searchIntelligenceKeys } from '@/lib/api/query-keys/search-intelligence';
import { SEARCH_HANDOFF_MAX_ROWS } from '@/lib/config/search-intelligence';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { pageRange, useCursorTable } from '@/lib/table/use-cursor-table';
import { formatEvidenceValue } from './search-intelligence-format';

type Column = { field: keyof SearchIntelligenceRow; label: string; numeric?: boolean };
const columnsByKind: Record<string, Column[]> = {
  footprint: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
    { field: 'intent', label: 'Intent' },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  ranking_keywords: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'rank_group', label: 'Rank group', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'url', label: 'Ranking URL' },
    { field: 'etv', label: 'ETV', numeric: true },
  ],
  keyword_suggestions: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
    { field: 'intent', label: 'Intent' },
  ],
  missing_keywords: [
    { field: 'keyword', label: 'Missing keyword' },
    { field: 'owned_rank_group', label: 'Owned rank', numeric: true },
    { field: 'rank_group', label: 'Competitor rank', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
  ],
  shared_keywords: [
    { field: 'keyword', label: 'Shared keyword' },
    { field: 'owned_rank_group', label: 'Owned rank', numeric: true },
    { field: 'rank_group', label: 'Competitor rank', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
  ],
  referring_domains: [
    { field: 'domain', label: 'Referring domain' },
    { field: 'backlinks', label: 'Backlinks', numeric: true },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  destination_pages: [
    { field: 'url', label: 'Destination page' },
    { field: 'backlinks', label: 'Backlinks', numeric: true },
    { field: 'referring_main_domains', label: 'Referring domains', numeric: true },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  citation_matches: [
    { field: 'domain', label: 'Cited domain' },
    { field: 'url', label: 'Cited URL' },
  ],
};

function displayValue(row: SearchIntelligenceRow, field: keyof SearchIntelligenceRow) {
  const result = row[field];
  if (result === null || result === undefined || result === '')
    return <span className="value-placeholder">Not measured</span>;
  return typeof result === 'object' ? JSON.stringify(result) : String(result);
}

function useDatasetRows(
  datasetId: string,
  projectId: string | undefined,
  workspaceId: string | undefined,
  params: { cursor?: string; limit: number; sort: string; direction: 'asc' | 'desc' },
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
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey.slice(0, scope.length).every((part, index) => part === scope[index])
        ? previous
        : undefined,
  });
  const accessFailure =
    query.isError && [401, 403, 404].includes(httpErrorStatus(query.error) ?? 0);
  const page = accessFailure
    ? undefined
    : (query.data ?? (lastPage?.scopeKey === scopeKey ? lastPage.data : undefined));
  return { query, page };
}

export function SearchIntelligenceDatasetView({
  dataset,
}: Readonly<{ dataset: SearchIntelligenceDataset }>) {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const [selected, setSelected] = useState<SearchIntelligenceRow | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Record<string, SearchIntelligenceRow>>(
    {},
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [order, setOrder] = useState<{ sort: string; direction: 'asc' | 'desc' }>({
    sort: 'id',
    direction: 'asc',
  });
  const table = useCursorTable(
    `${activeProject?.workspace_id}:${activeProject?.id}:${dataset.id}:${order.sort}:${order.direction}`,
  );
  const params = { cursor: table.cursor, limit: table.pageSize, ...order };
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
  const columns = columnsByKind[dataset.dataset_kind] ?? columnsByKind.footprint;
  if (query.isPending) return <Skeleton className="h-80 w-full" />;
  if (!page)
    return (
      <ReadError
        error={query.error}
        fallback="Dataset rows could not be loaded."
        onRetry={() => void query.refetch()}
      />
    );
  const rows = page.rows;
  const visibleRows = rows.filter((row) =>
    [row.keyword, row.domain, row.url, row.intent].some((value) =>
      value.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
    ),
  );
  const range = pageRange(table.page, table.pageSize, rows.length);
  const selectedCount = Object.keys(selectedEvidence).length;
  return (
    <>
      <Card>
        <CardHeader bordered className="flex-row items-center justify-between">
          <div>
            <CardTitle>{dataset.target_hostname}</CardTitle>
            <p className={textRole('meta')}>
              {dataset.coverage} coverage · {dataset.unique_rows_saved.toLocaleString()} saved rows
              {dataset.truncated ? ' · truncated' : ''}
            </p>
          </div>
        </CardHeader>
        <CardContent flush>
          <div className="border-border-subtle flex min-h-14 items-center border-b px-[var(--table-cell-padding-x)] py-2">
            <SearchField
              value={filter}
              onValueChange={setFilter}
              aria-label="Filter visible page"
              placeholder="Filter visible page"
              className="max-w-sm"
            />
          </div>
          <div className="border-border-subtle flex min-h-14 flex-wrap items-center justify-between gap-3 border-b px-[var(--table-cell-padding-x)] py-2">
            <span className={textRole('body')}>
              {selectedCount
                ? `${selectedCount} evidence row${selectedCount === 1 ? '' : 's'} selected`
                : 'Select evidence rows to create a content brief.'}
            </span>
            <Button size="sm" disabled={!selectedCount} onClick={() => setReviewOpen(true)}>
              Create content brief
            </Button>
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
            <Table className="min-w-[900px] table-fixed">
              <colgroup>
                <col className="w-14" />
                {columns.map((column) => (
                  <col key={column.field} className={column.numeric ? 'w-32' : undefined} />
                ))}
                <col className="w-28" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">
                    <Checkbox
                      aria-label="Select current page"
                      checked={
                        visibleRows.length > 0 &&
                        visibleRows.every((row) => Boolean(selectedEvidence[row.id]))
                      }
                      disabled={!visibleRows.length}
                      onCheckedChange={() =>
                        setSelectedEvidence((current) => {
                          const next = { ...current };
                          if (visibleRows.every((row) => Boolean(next[row.id]))) {
                            visibleRows.forEach((row) => {
                              delete next[row.id];
                            });
                          } else {
                            visibleRows.forEach((row) => {
                              if (Object.keys(next).length < SEARCH_HANDOFF_MAX_ROWS)
                                next[row.id] = row;
                            });
                          }
                          return next;
                        })
                      }
                    />
                  </TableHead>
                  {columns.map((column) => (
                    <SortableHead
                      key={column.field}
                      column={column}
                      active={order.sort === column.field}
                      descending={order.direction === 'desc'}
                      onSort={() => {
                        setOrder({
                          sort: column.field,
                          direction:
                            order.sort === column.field && order.direction === 'asc'
                              ? 'desc'
                              : 'asc',
                        });
                        table.reset();
                      }}
                    />
                  ))}
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-center">
                      <Checkbox
                        aria-label={`Select evidence row ${row.id}`}
                        checked={Boolean(selectedEvidence[row.id])}
                        disabled={
                          selectedCount >= SEARCH_HANDOFF_MAX_ROWS && !selectedEvidence[row.id]
                        }
                        onCheckedChange={() =>
                          setSelectedEvidence((current) => {
                            if (current[row.id]) {
                              const next = { ...current };
                              delete next[row.id];
                              return next;
                            }
                            return { ...current, [row.id]: row };
                          })
                        }
                      />
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell
                        key={column.field}
                        numeric={column.numeric}
                        className="truncate"
                        title={String(row[column.field] ?? '')}
                      >
                        {displayValue(row, column.field)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!visibleRows.length ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 2}>
                      No saved rows match this view.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <output
            className={textRole('meta', 'flex h-6 items-center px-[var(--table-cell-padding-x)]')}
            aria-live="polite"
          >
            {query.isFetching ? 'Updating saved rows…' : `${visibleRows.length} rows shown`}
          </output>
          <CursorTableFooter
            {...range}
            total={dataset.unique_rows_saved}
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
                  Volume: {formatEvidenceValue(row.search_volume)} · Position:{' '}
                  {formatEvidenceValue(row.rank_group)}
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

function SortableHead({
  column,
  active,
  descending,
  onSort,
}: Readonly<{
  column: Column;
  active: boolean;
  descending: boolean;
  onSort: () => void;
}>) {
  const { ariaSort, icon: Icon } = sortIndicator(active, descending, {
    ascending: ArrowUp,
    descending: ArrowDown,
    inactive: ArrowUpDown,
  });
  return (
    <TableHead numeric={column.numeric} aria-sort={ariaSort}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSort}
        className={column.numeric ? 'w-full justify-center' : 'w-full justify-start'}
      >
        <span className="truncate">{column.label}</span>
        <Icon className="size-4 shrink-0" aria-hidden />
      </Button>
    </TableHead>
  );
}
