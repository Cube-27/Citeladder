'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { CursorTableFooter } from '@/components/ui/cursor-table-footer';
import { sortIndicator } from '@/components/ui/sort-indicator';
import { pageRange, useCursorTable } from '@/lib/table/use-cursor-table';
import { formatEvidenceValue } from './search-intelligence-format';
import { SEARCH_HANDOFF_MAX_ROWS } from '@/lib/config/search-intelligence';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import { Checkbox } from '@/components/ui/checkbox';
import { Stack } from '@/components/ui/layout';
import { EmptyState } from '@/components/ui/empty-state';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  searchIntelligenceApi,
  type SearchIntelligenceDataset,
  type SearchIntelligenceRow,
} from '@/lib/api/search-intelligence';
import { searchIntelligenceKeys } from '@/lib/api/query-keys/search-intelligence';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { ArrowDown, ArrowUp, ArrowUpDown, Database } from 'lucide-react';

const fields: Record<string, Array<[keyof SearchIntelligenceRow, string]>> = {
  footprint: [
    ['keyword', 'Keyword'],
    ['search_volume', 'Volume'],
    ['difficulty', 'Difficulty'],
    ['intent', 'Intent'],
    ['dataforseo_rank', 'DataForSEO rank'],
  ],
  ranking_keywords: [
    ['keyword', 'Keyword'],
    ['rank_group', 'Rank group'],
    ['search_volume', 'Volume'],
    ['url', 'Ranking URL'],
    ['etv', 'ETV'],
  ],
  keyword_suggestions: [
    ['keyword', 'Keyword'],
    ['search_volume', 'Volume'],
    ['difficulty', 'Difficulty'],
    ['intent', 'Intent'],
  ],
  missing_keywords: [
    ['keyword', 'Missing keyword'],
    ['owned_rank_group', 'Owned rank'],
    ['rank_group', 'Competitor rank'],
    ['search_volume', 'Volume'],
    ['difficulty', 'Difficulty'],
  ],
  shared_keywords: [
    ['keyword', 'Shared keyword'],
    ['owned_rank_group', 'Owned rank'],
    ['rank_group', 'Competitor rank'],
    ['search_volume', 'Volume'],
  ],
  referring_domains: [
    ['domain', 'Referring domain'],
    ['backlinks', 'Backlinks'],
    ['dataforseo_rank', 'DataForSEO rank'],
  ],
  destination_pages: [
    ['url', 'Destination page'],
    ['backlinks', 'Backlinks'],
    ['referring_main_domains', 'Referring domains'],
    ['dataforseo_rank', 'DataForSEO rank'],
  ],
  citation_matches: [
    ['domain', 'Cited domain'],
    ['url', 'Cited URL'],
  ],
};

function value(row: SearchIntelligenceRow, field: keyof SearchIntelligenceRow) {
  const result = row[field];
  if (result === null || result === undefined || result === '')
    return <span className="value-placeholder">Not measured</span>;
  return typeof result === 'object' ? JSON.stringify(result) : String(result);
}

export function SearchIntelligenceDatasetView({
  dataset,
}: Readonly<{ dataset: SearchIntelligenceDataset }>) {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const [selected, setSelected] = useState<SearchIntelligenceRow | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [sort, setSort] = useState('id');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const table = useCursorTable(`${activeProject?.id}:${dataset.id}:${sort}:${direction}`);
  const params = { cursor: table.cursor, limit: table.pageSize, sort, direction };
  const handoff = useMutation({
    mutationFn: () =>
      searchIntelligenceApi.contentHandoff(
        activeProject!.id,
        dataset.id,
        selectedRows,
        instructions.trim(),
        { workspaceId: activeProject!.workspace_id },
      ),
    onSuccess: (payload) => {
      sessionStorage.setItem('citeladder:search-intelligence-handoff', JSON.stringify(payload));
      navigate(projectHref('/content?source=search-intelligence'));
    },
  });
  const query = useQuery({
    queryKey: [
      ...searchIntelligenceKeys.dataset(activeProject?.workspace_id, activeProject?.id, dataset.id),
      params,
    ],
    queryFn: ({ signal }) =>
      searchIntelligenceApi.rows(
        activeProject!.id,
        dataset.id,
        { signal, workspaceId: activeProject!.workspace_id },
        params,
      ),
    enabled: Boolean(activeProject),
  });
  const columns = fields[dataset.dataset_kind] ?? fields.footprint;
  if (query.isPending) return <Skeleton className="h-52 w-full" />;
  if (!query.data)
    return (
      <ReadError
        error={query.error}
        fallback="Dataset rows could not be loaded."
        onRetry={() => void query.refetch()}
      />
    );
  const rows = query.data.rows;
  const range = pageRange(table.page, table.pageSize, rows.length);
  if (!rows.length)
    return (
      <EmptyState
        icon={Database}
        heading="No rows collected"
        description="This dataset completed without matching provider rows. Zero is preserved separately from unavailable data."
      />
    );
  return (
    <>
      <Card>
        <CardHeader bordered className="flex-row items-center justify-between">
          <div>
            <CardTitle>{dataset.target_domain}</CardTitle>
            <p className="text-muted text-sm">
              {dataset.coverage} coverage · {dataset.unique_rows_saved.toLocaleString()} saved rows
              {dataset.truncated ? ' · truncated' : ''}
            </p>
          </div>
        </CardHeader>
        <CardContent flush>
          <div className="border-border-subtle grid gap-3 border-b p-[var(--card-padding-large)]">
            <Textarea
              aria-label="Content instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="What should the content workflow create from the selected evidence?"
            />
            <div>
              <Button
                size="sm"
                disabled={!selectedRows.length || !instructions.trim() || handoff.isPending}
                onClick={() => handoff.mutate()}
              >
                Write content from {selectedRows.length} selected row
                {selectedRows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
          {handoff.isError ? <Alert>{handoff.error.message}</Alert> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Select</TableHead>
                {columns.map(([field, label]) => (
                  <SortableHead
                    key={field}
                    label={label}
                    active={sort === field}
                    descending={direction === 'desc'}
                    onSort={() => {
                      setDirection(sort === field && direction === 'asc' ? 'desc' : 'asc');
                      setSort(String(field));
                      table.reset();
                    }}
                  />
                ))}
                <TableHead>Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select evidence row ${row.id}`}
                      checked={selectedRows.includes(row.id)}
                      disabled={
                        selectedRows.length >= SEARCH_HANDOFF_MAX_ROWS &&
                        !selectedRows.includes(row.id)
                      }
                      onCheckedChange={() =>
                        setSelectedRows((current) =>
                          current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : [...current, row.id],
                        )
                      }
                    />
                  </TableCell>
                  {columns.map(([field]) => (
                    <TableCell key={field}>{value(row, field)}</TableCell>
                  ))}
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                      Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CursorTableFooter
            {...range}
            total={dataset.unique_rows_saved}
            noun="evidence rows"
            pageSize={table.pageSize}
            onPageSizeChange={table.setPageSize}
            canPrev={table.canPrev}
            canNext={Boolean(query.data.next_cursor)}
            onPrev={table.pop}
            onNext={() => table.push(query.data.next_cursor)}
            busy={query.isFetching}
          />
        </CardContent>
      </Card>
      <EvidenceDrawer selected={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function EvidenceDrawer({
  selected,
  onClose,
}: Readonly<{
  selected: SearchIntelligenceRow | null;
  onClose: () => void;
}>) {
  return (
    <Drawer
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Provider evidence"
      description="Persisted normalized row and provider metadata."
    >
      <Stack gap="compact">
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
      </Stack>
    </Drawer>
  );
}

function SortableHead({
  label,
  active,
  descending,
  onSort,
}: Readonly<{
  label: string;
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
    <TableHead aria-sort={ariaSort}>
      <Button variant="ghost" size="sm" onClick={onSort}>
        {label}
        <Icon className="size-4" aria-hidden />
      </Button>
    </TableHead>
  );
}
