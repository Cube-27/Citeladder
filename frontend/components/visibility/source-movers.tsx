import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';

import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { queryTableState } from '@/components/ui/state-block';
import { ClampText } from '@/components/ui/clamp-text';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl } from '@/components/ui/tabs';
import { TableCell, TableRow } from '@/components/ui/table';
import { Delta } from '@/components/ui/delta';
import type { SourceFilters } from '@/components/visibility/source-rows';
import { TrendingUp } from '@/lib/icons';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { pathOf, percent } from '@/lib/visibility/sources';
import { topicSelectionParams, type SourceQueries } from '@/lib/visibility/use-source-analysis';
import type { visibilitySourceMoversSchema } from '@citeladder/contracts/visibility-evidence';

type Movers = z.infer<typeof visibilitySourceMoversSchema>;
type Mover = Movers['risers'][number];

const MOVER_ROWS = 5;

export function useSourceMovers(
  filters: SourceFilters,
  queries: SourceQueries,
  { dimension, enabled }: Readonly<{ dimension: 'domain' | 'url'; enabled: boolean }>,
) {
  const comparison = queries.visibilityQuery.data?.comparison;
  const baseline = comparison?.status === 'comparable' ? comparison.baseline_audit_ids : undefined;
  const params = {
    ...topicSelectionParams(filters, queries),
    baseline_audit_ids: baseline,
    dimension,
    limit: MOVER_ROWS,
  };
  return useQuery({
    ...visibilityQueries.sourceMovers(
      { workspaceId: queries.workspaceId, projectId: queries.projectId },
      params,
    ),
    enabled: enabled && Boolean(queries.activeRunId && baseline?.length),
  });
}

const NO_BASELINE = 'No earlier run to compare';
const IDENTITY_UNAVAILABLE = 'The earlier period cannot be matched to this one.';

const STATUS_COPY: Record<string, string> = {
  no_baseline: NO_BASELINE,
  no_observations: 'The earlier period has no answers to compare with.',
  partial_coverage: 'One of the periods did not finish every answer, so shares would mislead.',
  changed_context: 'The earlier period was measured differently, so it is not comparable.',
  invalid_baseline: 'The earlier period does not finish before this one starts.',
  identity_unavailable: IDENTITY_UNAVAILABLE,
};

const MOVER_COLUMNS: readonly DataTableColumn[] = [
  { key: 'source', label: 'Source' },
  { key: 'share', label: 'Share', width: 'status', kind: 'number' },
  { key: 'change', label: 'Change', width: 'figure', kind: 'number' },
];

const empty = (heading: string): DataTableState => ({
  kind: 'empty',
  headingLevel: 3,
  icon: TrendingUp,
  heading,
});

function moversState({
  query,
  comparable,
  noRows,
}: Readonly<{
  query: ReturnType<typeof useSourceMovers>;
  comparable: boolean;
  noRows: DataTableState | undefined;
}>) {
  if (!comparable) return { state: empty(NO_BASELINE) };
  return queryTableState(query, {
    subject: 'the top movers',
    empty: (data) =>
      data.comparison_status === 'comparable'
        ? noRows
        : empty(STATUS_COPY[data.comparison_status] ?? IDENTITY_UNAVAILABLE),
  });
}

const DIRECTIONS = [
  { value: 'rising', label: 'Rising' },
  { value: 'falling', label: 'Falling' },
] as const;

type Direction = (typeof DIRECTIONS)[number]['value'];

function shownMovers(
  data: Movers | undefined,
  { direction, needle }: Readonly<{ direction: Direction; needle: string }>,
): Mover[] {
  const movers = (direction === 'rising' ? data?.risers : data?.fallers) ?? [];
  return needle ? movers.filter((mover) => mover.key.toLocaleLowerCase().includes(needle)) : movers;
}

export function TopMoversCard({
  dimension,
  query,
  comparable,
}: Readonly<{
  dimension: 'domain' | 'url';
  query: ReturnType<typeof useSourceMovers>;
  comparable: boolean;
}>) {
  const [direction, setDirection] = useState<Direction>('rising');
  const [search, setSearch] = useState('');
  const needle = search.trim().toLocaleLowerCase();
  const movers = shownMovers(query.data, { direction, needle });
  const noRows: DataTableState = needle
    ? { kind: 'filtered', headingLevel: 3, heading: 'No matches', onClear: () => setSearch('') }
    : empty('No source moved this way');
  return (
    <DataTable
      title="Top movers"
      columns={MOVER_COLUMNS}
      pageSize={MOVER_ROWS}
      busy={{ active: query.isFetching, label: 'Updating top movers' }}
      toolbar={{
        search: (
          <SearchField
            value={search}
            onValueChange={setSearch}
            onClear={() => setSearch('')}
            placeholder="Search"
            aria-label="Search top movers"
          />
        ),
        view: (
          <SegmentedControl
            ariaLabel="Direction"
            value={direction}
            options={DIRECTIONS}
            onChange={setDirection}
          />
        ),
      }}
      {...moversState({ query, comparable, noRows: movers.length ? undefined : noRows })}
    >
      {movers.map((mover) => (
        <TableRow key={mover.key}>
          <TableCell>
            <ClampText lines={1}>{dimension === 'url' ? pathOf(mover.key) : mover.key}</ClampText>
          </TableCell>
          <TableCell numeric tone="ink-2">
            {`${percent(mover.previous_share)} → ${percent(mover.current_share)}`}
          </TableCell>
          <TableCell numeric>
            <Delta value={mover.delta} policy="neutral" unit=" pp" />
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
