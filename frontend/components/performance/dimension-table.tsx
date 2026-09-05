'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { CursorTableFooter } from '@/components/ui/cursor-table-footer';
import { Pressable } from '@/components/ui/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { performanceApi, type PerformanceDimension } from '@/lib/api/performance';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { pageRange, useCursorTable } from '@/lib/table/use-cursor-table';
import {
  METRIC_CARDS,
  DIMENSION_SORT_KEY,
  defaultSort,
  differenceTone,
  dimensionTab,
  formatDifference,
  formatDimensionValue,
  formatMetric,
  metricDifference,
  sortDirection,
  sortKey,
  toggleSort,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';
import { cn } from '@/lib/utils';

/**
 * One of the six Performance tables.
 *
 * With a comparison active every metric widens to THREE columns — the
 * selected period, the comparison period, and their absolute difference —
 * exactly as Search Console renders it. Twelve numeric columns will not fit
 * most viewports, so the table scrolls horizontally inside its own container
 * with the dimension column pinned left: the row's identity stays readable
 * while the reader scrolls the measures, and the page body never scrolls
 * sideways.
 *
 * Rows are paged by keyset against the SNAPSHOT the dashboard resolved, so
 * this table and the chart above it always read the same persisted
 * projection. The exact total comes from that snapshot's persisted
 * per-dimension count — no `COUNT(*)` runs on a page navigation.
 */

const TONE_CLASS: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-success-text',
  down: 'text-danger-text',
  flat: 'text-muted',
};

function SortableHead({
  metric,
  label,
  sublabel,
  sort,
  onSort,
}: Readonly<{
  metric: PerformanceMetricKey;
  label: string;
  /** Omitted when the column needs no qualifier (no comparison active). */
  sublabel?: string;
  sort: string;
  onSort: (key: PerformanceMetricKey) => void;
}>) {
  const active = sortKey(sort) === metric;
  const descending = sortDirection(sort) === 'descending';
  const Icon = active ? (descending ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead
      numeric
      aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}
      className={cn('text-right', sublabel ? 'min-w-[7.5rem]' : undefined)}
    >
      <Pressable
        type="button"
        onClick={() => onSort(metric)}
        className={cn(
          'inline-flex w-full flex-col items-end gap-0.5 text-right',
          active ? 'text-accent-text' : 'hover:text-foreground',
        )}
      >
        <span className="inline-flex items-center gap-1">
          <Icon className={cn('size-3', !active && 'text-muted')} aria-hidden />
          {label}
        </span>
        {sublabel ? (
          <span className={cn('max-w-[10rem] truncate', textRole('meta'))} title={sublabel}>
            {sublabel}
          </span>
        ) : null}
      </Pressable>
    </TableHead>
  );
}

/**
 * The sort ACTUALLY applied, given which columns are on screen.
 *
 * Deselecting a metric removes its header, so an ordering by that column
 * would have no visible indicator and no way back to it — the rows would just
 * be in an order the reader cannot explain. The row-identity column is always
 * present, so ordering by that is never orphaned.
 */
function orderableSort(
  sort: string,
  dimension: PerformanceDimension,
  displayed: readonly { key: PerformanceMetricKey }[],
): string {
  const key = sortKey(sort);
  if (key === DIMENSION_SORT_KEY) return sort;
  return displayed.some((card) => card.key === key) ? sort : defaultSort(dimension);
}

/** A header cell for a derived column — not sortable, since it is not stored. */
function StaticHead({ label, sublabel }: Readonly<{ label: string; sublabel: string }>) {
  return (
    <TableHead numeric className="min-w-[7.5rem] text-right">
      <span className="inline-flex w-full flex-col items-end gap-0.5 text-right">
        <span>{label}</span>
        <span className={cn('max-w-[10rem] truncate', textRole('meta'))} title={sublabel}>
          {sublabel}
        </span>
      </span>
    </TableHead>
  );
}

export function DimensionTable({
  projectId,
  dimension,
  snapshotId,
  compareSnapshotId,
  selectedLabel,
  compareLabel,
  activeMetrics,
  unavailable,
}: Readonly<{
  projectId: string;
  dimension: PerformanceDimension;
  snapshotId: string;
  compareSnapshotId: string | null;
  selectedLabel: string;
  compareLabel: string;
  activeMetrics?: ReadonlySet<PerformanceMetricKey>;
  /** The provider report behind this table is never collected. */
  unavailable?: boolean;
}>) {
  const tab = dimensionTab(dimension);
  const [sort, setSort] = useState(() => defaultSort(dimension));
  // Every value the server binds the cursor to participates, so switching
  // any of them drops the stack instead of replaying a refused cursor.
  const table = useCursorTable(`${projectId}|${snapshotId}|${dimension}|${sort}`);
  // NOTE: keyed on the raw `sort` so hiding a column drops the cursor stack
  // too — the page it points at was ordered by the column just removed.
  const comparing = compareSnapshotId !== null;
  const displayedMetrics = METRIC_CARDS.filter((card) =>
    activeMetrics ? activeMetrics.has(card.key) : true,
  );
  const activeSort = orderableSort(sort, dimension, displayedMetrics);

  const params = {
    snapshot_id: snapshotId,
    dimension,
    sort: activeSort,
    cursor: table.cursor,
    page_size: table.pageSize,
    compare_snapshot_id: compareSnapshotId ?? undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.performance.table(projectId, params),
    queryFn: ({ signal }) => performanceApi.getTable(projectId, params, { signal }),
    enabled: !unavailable,
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId, previousData, previousQuery),
  });

  const rows = query.data?.items ?? [];
  const nextCursor = query.data?.next_cursor ?? null;
  const total = query.data?.total_count;
  const { from, to } = pageRange(table.page, table.pageSize, rows.length);
  const columnCount = 1 + displayedMetrics.length * (comparing ? 3 : 1);

  const onSort = (key: PerformanceMetricKey) => {
    setSort(toggleSort(activeSort, key));
    table.reset();
  };

  if (unavailable) {
    // Distinct from an empty table: Search Console does not serve this
    // breakdown in a form this project imports, so nothing was measured —
    // which is not the same as having measured nothing.
    return (
      <Alert tone="info">
        Search Console does not provide {tab.noun} alongside a date range, so this breakdown is not
        imported. Every other tab is unaffected.
      </Alert>
    );
  }
  if (query.isError) {
    return (
      <Alert tone="danger">Could not load {tab.noun}. Check your connection and try again.</Alert>
    );
  }

  return (
    <div className="border-border-subtle bg-panel flex min-h-[520px] flex-col justify-between overflow-hidden rounded-[var(--radius-panel)] border">
      {/* 12px for the data inside the tab: these tables are dense and read
          as a block of figures, so the smaller size fits more of a row on
          screen without shrinking the tab labels that head them. */}
      <Table
        wrapperClassName="overflow-x-auto"
        // Fixed layout with an explicit first column: every tab then lays
        // out identically, so switching QUERIES -> PAGES does not reflow
        // the metric columns under the pointer. Without it each tab sizes
        // to its own longest cell and the whole table jumps.
        className={cn(
          'w-full table-fixed text-xs [&_td]:text-xs [&_th]:text-xs',
          comparing ? 'min-w-[48rem]' : 'min-w-[32rem]',
        )}
      >
        <colgroup>
          <col className="w-[32%] min-w-[14rem]" />
          {Array.from({ length: columnCount - 1 }, (_, index) => (
            <col key={index} className={comparing ? 'min-w-[7.5rem]' : 'min-w-[6rem]'} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {/* Pinned so the row identity survives horizontal scrolling. */}
            <TableHead className="bg-panel sticky left-0 z-10">{tab.header}</TableHead>
            {displayedMetrics.flatMap((metric) => {
              const label = metric.label.replace(/^(Total|Average) /, '');
              const head = (
                <SortableHead
                  key={metric.key}
                  metric={metric.key}
                  label={label}
                  // The range is stated once, in the toolbar. Repeating it
                  // under every column adds no information — it only earns
                  // its place when a comparison makes the columns AMBIGUOUS
                  // (selected vs comparison vs difference).
                  sublabel={comparing ? selectedLabel : undefined}
                  sort={activeSort}
                  onSort={onSort}
                />
              );
              // Search Console groups each metric with its own comparison
              // and difference rather than appending all comparisons at the
              // end, so a reader compares adjacent columns.
              return comparing
                ? [
                    head,
                    <StaticHead
                      key={`${metric.key}-comparison`}
                      label={label}
                      sublabel={compareLabel}
                    />,
                    <StaticHead
                      key={`${metric.key}-difference`}
                      label={label}
                      sublabel="Difference"
                    />,
                  ]
                : [head];
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading
            ? // As many rows as a full page holds, so the table does not
              // resize when the real ones arrive.
              Array.from({ length: table.pageSize }, (_, index) => (
                <TableRow key={`skeleton-${index}`} className="h-11">
                  {Array.from({ length: columnCount }, (_, cell) => (
                    <TableCell
                      key={cell}
                      numeric={cell > 0}
                      className={cell > 0 ? 'text-right' : undefined}
                    >
                      <Skeleton className={cell === 0 ? 'h-4 w-3/4' : 'ml-auto h-4 w-16'} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : null}
          {!query.isLoading && rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount}>
                <span className="text-muted">No {tab.noun} measured for this range.</span>
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.dimension_key} className="h-11">
              <TableCell className="bg-panel sticky left-0 z-10">
                <span
                  className={cn(
                    dimension === 'page' && 'mono text-xs break-all',
                    dimension === 'day' && 'mono text-xs',
                  )}
                >
                  {formatDimensionValue(dimension, row.display_value)}
                </span>
              </TableCell>
              {displayedMetrics.flatMap((metric) => {
                const selectedCell = (
                  <TableCell key={metric.key} numeric className="text-right">
                    <span className="mono">
                      {formatMetric(metric.key, row.metrics[metric.key])}
                    </span>
                  </TableCell>
                );
                if (!comparing) return [selectedCell];
                const comparisonValue = row.comparison_metrics
                  ? row.comparison_metrics[metric.key]
                  : null;
                const difference = metricDifference(
                  row.metrics[metric.key],
                  row.comparison_metrics ? comparisonValue : undefined,
                );
                return [
                  selectedCell,
                  <TableCell key={`${metric.key}-comparison`} numeric className="text-right">
                    <span className="mono text-muted">
                      {formatMetric(metric.key, comparisonValue)}
                    </span>
                  </TableCell>,
                  <TableCell key={`${metric.key}-difference`} numeric className="text-right">
                    <span
                      className={cn('mono', TONE_CLASS[differenceTone(metric.key, difference)])}
                    >
                      {formatDifference(metric.key, difference)}
                    </span>
                  </TableCell>,
                ];
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <CursorTableFooter
        from={from}
        to={to}
        total={total}
        noun={tab.noun}
        pageSize={table.pageSize}
        onPageSizeChange={table.setPageSize}
        canPrev={table.canPrev}
        canNext={Boolean(nextCursor)}
        onPrev={table.pop}
        onNext={() => table.push(nextCursor)}
        busy={query.isFetching}
      />
    </div>
  );
}
