'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DateRangeDialog, type RangeSelection } from './date-range-dialog';
import { DimensionTable } from './dimension-table';
import { Ga4SummaryRow, MetricCards } from './metric-cards';
import { PerformanceChart, type ChartSeries } from './performance-chart';
import { usePerformanceSync } from './use-performance-sync';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { integrationsApi } from '@/lib/api/integrations';
import {
  performanceApi,
  type PerformanceDashboard,
  type PerformanceDimension,
} from '@/lib/api/performance';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { useProjectContext } from '@/lib/project/project-context';
import {
  COMPARE_OPTIONS,
  DIMENSION_TABS,
  RANGE_OPTIONS,
  METRIC_CARDS,
  canCompareYearOverYear,
  describeWindow,
  toChartPoints,
  windowLength,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';

/**
 * The Performance surface: one resolved range, its optional comparison, four
 * selectable GSC metrics on one chart, a compact GA4 row, and six keyset
 * tables — all reading the SAME persisted snapshot the dashboard resolved.
 *
 * Nothing here computes a window: presets resolve server-side against the
 * latest complete GSC date, and a custom or comparison window with no
 * projection is materialized by the range task rather than derived in the
 * browser. What the screen displays is always the window actually covered.
 */

// One token-backed stroke per metric, shared by the cards and the chart so a
// card's colour is the same signal as its line.
const METRIC_COLORS: Record<PerformanceMetricKey, string> = {
  clicks: 'var(--color-chart-1)',
  impressions: 'var(--color-chart-2)',
  ctr: 'var(--color-chart-3)',
  position: 'var(--color-chart-4)',
};

const INITIAL_SELECTION: RangeSelection = {
  range: 'custom',
  from: '',
  to: '',
  compare: 'none',
  compareFrom: '',
  compareTo: '',
};

function dashboardParams(selection: RangeSelection) {
  return {
    range: selection.range,
    from: selection.range === 'custom' && selection.from ? selection.from : undefined,
    to: selection.range === 'custom' && selection.to ? selection.to : undefined,
    compare: selection.compare,
    compare_from:
      selection.compare === 'custom' && selection.compareFrom ? selection.compareFrom : undefined,
    compare_to:
      selection.compare === 'custom' && selection.compareTo ? selection.compareTo : undefined,
  };
}

function compareLabel(selection: RangeSelection): string {
  return (
    COMPARE_OPTIONS.find((option) => option.value === selection.compare)?.label ?? 'Comparison'
  );
}

function rangeLabel(selection: RangeSelection): string {
  return RANGE_OPTIONS.find((option) => option.value === selection.range)?.label ?? selection.range;
}

export function PerformanceScreen() {
  const { activeProject, isLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const workspaceId = activeProject?.workspace_id ?? null;
  const [selection, setSelection] = useState<RangeSelection>(INITIAL_SELECTION);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dimension, setDimension] = useState<PerformanceDimension>('query');
  const [activeMetrics, setActiveMetrics] = useState<ReadonlySet<PerformanceMetricKey>>(
    () => new Set<PerformanceMetricKey>(['clicks', 'impressions']),
  );

  const params = dashboardParams(selection);
  const dashboard = useQuery({
    queryKey: queryKeys.performance.dashboard(projectId ?? '', params),
    queryFn: ({ signal }) => performanceApi.getDashboard(projectId ?? '', params, { signal }),
    enabled: Boolean(projectId),
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId!, previousData, previousQuery),
  });
  const connections = useQuery({
    queryKey: queryKeys.integrations.connections(workspaceId),
    queryFn: ({ signal }) => integrationsApi.list({ signal }),
    enabled: Boolean(workspaceId),
  });
  const sync = usePerformanceSync(projectId);
  const projection = useRangeProjection(projectId, dashboard.data);

  const toggleMetric = (key: PerformanceMetricKey) =>
    setActiveMetrics((current) => {
      const next = new Set(current);
      // The chart must always draw something, so the last selected metric
      // cannot be turned off.
      if (next.has(key)) {
        if (next.size === 1) return current;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  if (isLoading || (projectId && dashboard.isLoading)) return <PerformanceSkeleton />;
  if (!projectId)
    return <Alert tone="info">Select or create a project to see its search performance.</Alert>;
  if (dashboard.isError)
    return (
      <Alert tone="danger">
        Could not load performance data. Check your connection and try again.
      </Alert>
    );

  const data = dashboard.data as PerformanceDashboard;
  const selectedWindow = data.selected;
  const comparisonWindow = data.comparison;
  const selectedLabel = describeWindow(selectedWindow);
  const comparisonLabel = compareLabel(selection);
  const series: ChartSeries[] = METRIC_CARDS.filter((card) => activeMetrics.has(card.key)).map(
    (card) => ({
      key: card.key,
      label: card.label,
      color: METRIC_COLORS[card.key],
      selected: toChartPoints(selectedWindow.series[card.key]),
      comparison: comparisonWindow ? toChartPoints(comparisonWindow.series[card.key]) : null,
    }),
  );

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PerformanceToolbar
        selection={selection}
        selectedLabel={selectedLabel}
        latestDate={data.coverage.latest_date}
        hasConnections={Boolean(connections.data?.length)}
        sync={sync}
        onOpenRange={() => setDialogOpen(true)}
      />

      <PerformanceNotices
        sync={sync}
        projecting={projection.projecting}
        selectedMissing={selectedWindow.snapshot_id === null}
        comparisonMissing={comparisonWindow !== null && comparisonWindow.snapshot_id === null}
      />

      <MetricCards
        selected={selectedWindow}
        comparison={comparisonWindow}
        selectedLabel={selectedLabel}
        compareLabel={comparisonLabel}
        active={activeMetrics}
        onToggle={toggleMetric}
        colors={METRIC_COLORS}
      />
      <div className="border-border-subtle bg-panel rounded-[var(--radius-panel)] border p-3">
        <PerformanceChart series={series} />
      </div>
      <Ga4SummaryRow
        selected={selectedWindow}
        comparison={comparisonWindow}
        compareLabel={comparisonLabel}
      />

      <Tabs
        value={dimension}
        onValueChange={setDimension}
        items={DIMENSION_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
        ariaLabel="Performance breakdowns"
        rootClassName="grid gap-3"
      >
        {DIMENSION_TABS.map((tab) => (
          <TabPanel key={tab.value} value={tab.value} className="focus-ring">
            {dimension === tab.value && selectedWindow.snapshot_id ? (
              <DimensionTable
                projectId={projectId}
                dimension={tab.value}
                snapshotId={selectedWindow.snapshot_id}
                compareSnapshotId={comparisonWindow?.snapshot_id ?? null}
                unavailable={data.unavailable_dimensions.includes(tab.value)}
                selectedLabel={selectedLabel}
                compareLabel={comparisonLabel}
              />
            ) : null}
          </TabPanel>
        ))}
      </Tabs>

      <DateRangeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selection={selection}
        onApply={setSelection}
        coverage={{
          earliest: data.coverage.earliest_date,
          latest: data.coverage.latest_date,
        }}
        yearOverYearAvailable={canCompareYearOverYear(
          data.coverage.covered_days,
          windowLength(selectedWindow) || 1,
        )}
      />
    </div>
  );
}

/**
 * Materialize any window the dashboard reported as unprojected.
 *
 * A read never builds a projection, so when the selected or comparison window
 * has no snapshot the screen queues the display-only range task and refetches
 * once it completes. The task is idempotent on the window, so a re-render or
 * a second viewer joins the same work rather than duplicating it.
 */
function useRangeProjection(projectId: string | null, data: PerformanceDashboard | undefined) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (window: { from: string; to: string }) =>
      performanceApi.enqueueRange(projectId ?? '', window),
    onSuccess: (task) => setPending(task.task_id),
  });

  const missing = missingWindow(data);
  useEffect(() => {
    if (!projectId || !missing || mutation.isPending) return;
    mutation.mutate(missing);
    // `missing` is a stable string pair derived from the response; re-running
    // on the mutation object itself would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, missing?.from, missing?.to]);

  const task = useQuery({
    queryKey: queryKeys.performance.rangeTask(projectId ?? '', pending ?? ''),
    queryFn: ({ signal }) =>
      performanceApi.getRangeTask(projectId ?? '', pending ?? '', { signal }),
    enabled: Boolean(projectId && pending),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'succeeded' || status === 'failed' || status === 'cancelled' ? false : 1500;
    },
  });

  const status = task.data?.status;
  const terminal = status === 'succeeded' || status === 'failed' || status === 'cancelled';
  useEffect(() => {
    // EVERY terminal status releases the poll — a failed or cancelled task
    // that stayed pending would leave the surface reporting work that has
    // already stopped. Only a success changed a projection, so only a
    // success invalidates.
    if (!terminal) return;
    setPending(null);
    if (status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.performance.all });
    }
  }, [terminal, status, queryClient]);

  return { projecting: Boolean(pending) && !terminal };
}

/** The first window the response reported as unprojected, if any. */
function missingWindow(data: PerformanceDashboard | undefined) {
  if (!data) return null;
  for (const window of [data.selected, data.comparison]) {
    if (window && window.snapshot_id === null && window.window_start && window.window_end) {
      return { from: window.window_start, to: window.window_end };
    }
  }
  return null;
}

/** The dashboard's control bar: resolved range, imported coverage, and sync. */
function PerformanceToolbar({
  selection,
  selectedLabel,
  latestDate,
  hasConnections,
  sync,
  onOpenRange,
}: Readonly<{
  selection: RangeSelection;
  selectedLabel: string;
  latestDate: string | null;
  hasConnections: boolean;
  sync: ReturnType<typeof usePerformanceSync>;
  onOpenRange: () => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" onClick={onOpenRange}>
        <CalendarDays className="size-4" aria-hidden />
        {rangeLabel(selection)}
        {selection.compare === 'none' ? null : ` · ${compareLabel(selection)}`}
      </Button>
      <span className="text-muted text-sm" data-testid="performance-window">
        {selectedLabel}
      </span>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-muted text-xs">
          {latestDate ? `Data through ${latestDate}` : 'No imported history'}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => sync.mutation.mutate()}
          disabled={!hasConnections || sync.syncing || sync.mutation.isPending}
          data-testid="sync-now-button"
        >
          {sync.syncing || sync.mutation.isPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Syncing…
            </>
          ) : (
            <>
              <RefreshCw className="size-4" aria-hidden />
              Sync now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function PerformanceNotices({
  sync,
  projecting,
  selectedMissing,
  comparisonMissing,
}: Readonly<{
  sync: ReturnType<typeof usePerformanceSync>;
  projecting: boolean;
  selectedMissing: boolean;
  comparisonMissing: boolean;
}>) {
  return (
    <>
      {sync.syncing ? (
        <Alert tone="info" hideIcon>
          <span className="flex items-center gap-2" data-testid="sync-status-banner">
            <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
            <span>
              Sync in progress — importing the dates not yet covered. Charts and tables update when
              it completes.
            </span>
          </span>
        </Alert>
      ) : null}
      {sync.notice ? <Alert tone="info">{sync.notice}</Alert> : null}
      {sync.outcome === 'failed' ? (
        <Alert tone="warning">
          Sync finished with errors — previously imported data is unchanged. Check Settings →
          Integrations for details.
        </Alert>
      ) : null}
      {projecting ? <Alert tone="info">Building this range from imported data…</Alert> : null}
      {!projecting && selectedMissing ? (
        <Alert tone="info">
          No imported data covers this range yet. Sync to import it, or choose a range inside the
          covered history.
        </Alert>
      ) : null}
      {!projecting && comparisonMissing ? (
        <Alert tone="info">
          The comparison period has no imported data, so its columns show as not measured.
        </Alert>
      ) : null}
    </>
  );
}

function PerformanceSkeleton() {
  return (
    <div
      className="grid gap-[var(--workspace-gap)]"
      aria-busy="true"
      data-testid="performance-skeleton"
    >
      <Skeleton className="h-9 w-80" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-60" />
      <Skeleton className="h-80" />
    </div>
  );
}
