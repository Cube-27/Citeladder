'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { DateRangeDialog, INITIAL_SELECTION, type RangeSelection } from './date-range-dialog';
import { GranularitySelect, PerformanceNotices, PerformanceToolbar } from './performance-chrome';
import { DimensionTable } from './dimension-table';
import { Ga4SummaryRow, MetricCards } from './metric-cards';
import { PerformanceChart, type ChartSeries } from './performance-chart';
import { usePerformanceSync } from './use-performance-sync';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { integrationsApi } from '@/lib/api/integrations';
import {
  performanceApi,
  type PerformanceDashboard,
  type PerformanceDimension,
  type PerformanceGranularity,
} from '@/lib/api/performance';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { useProjectContext } from '@/lib/project/project-context';
import {
  COMPARE_OPTIONS,
  DIMENSION_TABS,
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

// Authentic Search Console colors: Blue for Clicks, Purple for Impressions,
// Teal for CTR, Orange for Position. Shared by cards and chart lines.
const METRIC_COLORS: Record<PerformanceMetricKey, string> = {
  clicks: 'var(--color-gsc-clicks)',
  impressions: 'var(--color-gsc-impressions)',
  ctr: 'var(--color-gsc-ctr)',
  position: 'var(--color-gsc-position)',
};

function dashboardParams(selection: RangeSelection, granularity: PerformanceGranularity) {
  return {
    range: selection.range,
    granularity,
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

export function PerformanceScreen() {
  const { activeProject, isLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const workspaceId = activeProject?.workspace_id ?? null;
  const [selection, setSelection] = useState<RangeSelection>(INITIAL_SELECTION);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<'filter' | 'compare'>('filter');
  const [dimension, setDimension] = useState<PerformanceDimension>('query');
  const [granularity, setGranularity] = useState<PerformanceGranularity>('day');
  const [activeMetrics, setActiveMetrics] = useState<ReadonlySet<PerformanceMetricKey>>(
    () => new Set<PerformanceMetricKey>(['clicks', 'impressions']),
  );

  // Reset returns the surface to its landing state: the newest synced
  // window, daily buckets, no comparison, the first tab, and the two default
  // metrics. It is offered only while a comparison is active — that is the
  // state it exists to clear.
  const DEFAULT_METRICS: readonly PerformanceMetricKey[] = ['clicks', 'impressions'];
  const resetFilters = () => {
    setSelection(INITIAL_SELECTION);
    setGranularity('day');
    setDimension('query');
    setActiveMetrics(new Set<PerformanceMetricKey>(DEFAULT_METRICS));
  };

  const params = dashboardParams(selection, granularity);
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
        onOpenRange={() => {
          setDialogTab('filter');
          setDialogOpen(true);
        }}
        onOpenCompare={() => {
          setDialogTab('compare');
          setDialogOpen(true);
        }}
        onSelectRange={setSelection}
        comparing={selection.compare !== 'none'}
        onReset={resetFilters}
      />

      <PerformanceNotices
        sync={sync}
        projecting={projection.projecting}
        selectedMissing={selectedWindow.snapshot_id === null}
        comparisonMissing={comparisonWindow !== null && comparisonWindow.snapshot_id === null}
      />

      {/* One card holds the strip and the plot it drives: selecting a card
          changes the lines directly beneath it, so a gap between them would
          split a control from its own result. The strip sits flush with the
          granularity control aligned on the right of the header row. */}
      <div className="border-border-subtle bg-panel overflow-hidden rounded-[var(--radius-panel)] border">
        <div className="border-border-subtle flex flex-col border-b lg:flex-row lg:items-stretch lg:justify-between">
          <MetricCards
            selected={selectedWindow}
            comparison={comparisonWindow}
            compareLabel={comparisonLabel}
            selectedLabel={selectedLabel}
            active={activeMetrics}
            onToggle={toggleMetric}
            colors={METRIC_COLORS}
            className="flex-1"
          />
          <div className="border-border-subtle flex shrink-0 items-center justify-end border-t px-3 py-2 lg:border-t-0 lg:border-l">
            <GranularitySelect value={granularity} onChange={setGranularity} />
          </div>
        </div>
        <div className="p-3">
          <PerformanceChart series={series} />
        </div>
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
        rootClassName="grid gap-3 min-h-[560px]"
        // The tab row heads the table card, so it spans the full width
        // rather than hugging six labels and leaving dead space to the right.
        fill
      >
        {DIMENSION_TABS.map((tab) => (
          <TabPanel key={tab.value} value={tab.value} className="focus-ring min-h-[520px]">
            {dimension === tab.value && selectedWindow.snapshot_id ? (
              <DimensionTable
                projectId={projectId}
                dimension={tab.value}
                snapshotId={selectedWindow.snapshot_id}
                compareSnapshotId={comparisonWindow?.snapshot_id ?? null}
                activeMetrics={activeMetrics}
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
        initialTab={dialogTab}
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
