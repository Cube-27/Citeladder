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
  sublabel: string;
  sort: string;
  onSort: (key: PerformanceMetricKey) => void;
}>) {
  const active = sortKey(sort) === metric;
  const descending = sortDirection(sort) === 'descending';
  const Icon = active ? (descending ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead numeric aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}>
      <Pressable
        type="button"
        onClick={() => onSort(metric)}
        className={cn(
          'inline-flex w-auto flex-col items-end gap-0.5',
          active ? 'text-accent-text' : 'hover:text-foreground',
        )}
      >
        <span className="inline-flex items-center gap-1">
          <Icon className={cn('size-3', !active && 'text-muted')} aria-hidden />
          {label}
        </span>
        <span className={textRole('meta')}>{sublabel}</span>
      </Pressable>
    </TableHead>
  );
}

/** A header cell for a derived column — not sortable, since it is not stored. */
function StaticHead({ label, sublabel }: Readonly<{ label: string; sublabel: string }>) {
  return (
    <TableHead numeric>
      <span className="inline-flex flex-col items-end gap-0.5">
        <span>{label}</span>
        <span className={textRole('meta')}>{sublabel}</span>
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
}: Readonly<{
  projectId: string;
  dimension: PerformanceDimension;
  snapshotId: string;
  compareSnapshotId: string | null;
  selectedLabel: string;
  compareLabel: string;
}>) {
  const tab = dimensionTab(dimension);
  const [sort, setSort] = useState(() => defaultSort(dimension));
  // Every value the server binds the cursor to participates, so switching
  // any of them drops the stack instead of replaying a refused cursor.
  const table = useCursorTable(`${projectId}|${snapshotId}|${dimension}|${sort}`);
  const comparing = compareSnapshotId !== null;

  const params = {
    snapshot_id: snapshotId,
    dimension,
    sort,
    cursor: table.cursor,
    page_size: table.pageSize,
    compare_snapshot_id: compareSnapshotId ?? undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.performance.table(projectId, params),
    queryFn: ({ signal }) => performanceApi.getTable(projectId, params, { signal }),
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId, previousData, previousQuery),
  });

  const rows = query.data?.items ?? [];
  const nextCursor = query.data?.next_cursor ?? null;
  const total = query.data?.total_count;
  const { from, to } = pageRange(table.page, table.pageSize, rows.length);
  const columnCount = 1 + METRIC_CARDS.length * (comparing ? 3 : 1);

  const onSort = (key: PerformanceMetricKey) => {
    setSort((current) => toggleSort(current, key));
    table.reset();
  };

  if (query.isError) {
    return (
      <Alert tone="danger">Could not load {tab.noun}. Check your connection and try again.</Alert>
    );
  }

  return (
    <div className="border-border-subtle overflow-hidden rounded-[var(--radius-panel)] border">
      <Table wrapperClassName="overflow-x-auto">
        <TableHeader>
          <TableRow>
            {/* Pinned so the row identity survives horizontal scrolling. */}
            <TableHead className="bg-panel sticky left-0 z-10">{tab.header}</TableHead>
            {METRIC_CARDS.map((metric) => (
              <SortableHead
                key={metric.key}
                metric={metric.key}
                label={metric.label.replace(/^(Total|Average) /, '')}
                sublabel={selectedLabel}
                sort={sort}
                onSort={onSort}
              />
            ))}
            {comparing
              ? METRIC_CARDS.flatMap((metric) => [
                  <StaticHead
                    key={`${metric.key}-comparison`}
                    label={metric.label.replace(/^(Total|Average) /, '')}
                    sublabel={compareLabel}
                  />,
                  <StaticHead
                    key={`${metric.key}-difference`}
                    label={metric.label.replace(/^(Total|Average) /, '')}
                    sublabel="Difference"
                  />,
                ])
              : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading
            ? Array.from({ length: 5 }, (_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {Array.from({ length: columnCount }, (_, cell) => (
                    <TableCell key={cell} numeric={cell > 0}>
                      <Skeleton className="h-4 w-16" />
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
            <TableRow key={row.dimension_key}>
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
              {METRIC_CARDS.map((metric) => (
                <TableCell key={metric.key} numeric>
                  <span className="mono">{formatMetric(metric.key, row.metrics[metric.key])}</span>
                </TableCell>
              ))}
              {comparing
                ? METRIC_CARDS.flatMap((metric) => {
                    const comparisonValue = row.comparison_metrics
                      ? row.comparison_metrics[metric.key]
                      : null;
                    const difference = metricDifference(
                      row.metrics[metric.key],
                      row.comparison_metrics ? comparisonValue : undefined,
                    );
                    return [
                      <TableCell key={`${metric.key}-comparison`} numeric>
                        <span className="mono text-muted">
                          {row.comparison_metrics
                            ? formatMetric(metric.key, comparisonValue)
                            : formatMetric(metric.key, null)}
                        </span>
                      </TableCell>,
                      <TableCell key={`${metric.key}-difference`} numeric>
                        <span
                          className={cn('mono', TONE_CLASS[differenceTone(metric.key, difference)])}
                        >
                          {formatDifference(metric.key, difference)}
                        </span>
                      </TableCell>,
                    ];
                  })
                : null}
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
