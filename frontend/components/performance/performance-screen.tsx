'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { DateRangeDialog, type RangeSelection } from './date-range-dialog';
import { GranularitySelect, PerformanceNotices, PerformanceToolbar } from './performance-chrome';
import { Ga4SummaryRow, MetricCards } from './metric-cards';
import { PerformanceBreakdowns } from './performance-breakdowns';
import { PerformanceChart, type ChartSeries } from './performance-chart';
import { ReadinessLadder, useConnectedProviders } from './readiness-ladder';
import { usePerformanceSelection } from './use-performance-selection';
import { usePerformanceSync } from './use-performance-sync';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { integrationsApi } from '@/lib/api/integrations';
import {
  performanceApi,
  type PerformanceDashboard,
  type PerformanceGranularity,
} from '@/lib/api/performance';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { useProjectContext } from '@/lib/project/project-context';
import {
  COMPARE_OPTIONS,
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

/** The drawn lines: one per selected metric, each with its comparison peer. */
function chartSeries(
  selected: PerformanceDashboard['selected'],
  comparison: PerformanceDashboard['comparison'],
  active: ReadonlySet<PerformanceMetricKey>,
): ChartSeries[] {
  return METRIC_CARDS.filter((card) => active.has(card.key)).map((card) => ({
    key: card.key,
    label: card.label,
    color: METRIC_COLORS[card.key],
    selected: toChartPoints(selected.series[card.key]),
    comparison: comparison ? toChartPoints(comparison.series[card.key]) : null,
  }));
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<'filter' | 'compare'>('filter');
  const {
    selection,
    setSelection,
    granularity,
    setGranularity,
    dimension,
    setDimension,
    activeMetrics,
    toggleMetric,
    reset: resetFilters,
  } = usePerformanceSelection();

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
  const connectedProviders = useConnectedProviders(projectId);
  const sync = usePerformanceSync(projectId);
  const projection = useRangeProjection(projectId, dashboard.data);

  // No project yet is either "still resolving which one" or "there is none";
  // only the second is something to tell the reader about.
  if (!projectId)
    return isLoading ? (
      <PerformanceSkeleton />
    ) : (
      <Alert tone="info">Select or create a project to see its search performance.</Alert>
    );
  if (dashboard.isLoading) return <PerformanceSkeleton />;
  if (dashboard.isError)
    return (
      <Alert tone="danger">
        Could not load performance data. Check your connection and try again.
      </Alert>
    );

  const data = dashboard.data as PerformanceDashboard;
  // A read in flight, or a window whose projection is still being built. The
  // value slots spin instead of claiming a figure is absent — and they keep
  // their boxes, so nothing below them moves.
  const refreshing = dashboard.isFetching || projection.projecting;
  const selectedWindow = data.selected;
  const comparisonWindow = data.comparison;
  const selectedLabel = describeWindow(selectedWindow);
  const comparisonLabel = compareLabel(selection);
  const series = chartSeries(selectedWindow, comparisonWindow, activeMetrics);

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

      <ReadinessLadder projectId={projectId} />

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
            loading={refreshing}
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
        loading={refreshing}
      />

      <PerformanceBreakdowns
        projectId={projectId}
        dimension={dimension}
        onDimensionChange={setDimension}
        snapshotId={selectedWindow.snapshot_id}
        compareSnapshotId={comparisonWindow?.snapshot_id ?? null}
        unavailableDimensions={data.unavailable_dimensions}
        activeMetrics={activeMetrics}
        selectedLabel={selectedLabel}
        compareLabel={comparisonLabel}
        // Only when a Bing connection exists: Bing's panel states "measured
        // nothing", which is not what an absent connection means.
        hasBing={connectedProviders.includes('bing')}
      />

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

/**
 * The first paint, in the SAME boxes the loaded screen occupies.
 *
 * A skeleton whose shape differs from the content it stands in for does not
 * avoid a layout shift, it schedules one: the page re-flows the moment real
 * data lands. Every box below mirrors a real one — the card strip, the plot,
 * the GA4 row, the tabbed table — so the swap changes pixels inside the boxes
 * and never the boxes themselves.
 */
function PerformanceSkeleton() {
  return (
    <div
      className="grid gap-[var(--workspace-gap)]"
      aria-busy="true"
      data-testid="performance-skeleton"
    >
      <div className="flex min-h-9 items-center">
        <Skeleton className="h-9 w-80" />
      </div>
      <div className="border-border-subtle bg-panel overflow-hidden rounded-[var(--radius-panel)] border">
        <div className="border-border-subtle grid grid-cols-1 border-b sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="grid min-h-[96px] content-start gap-2 p-3.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
        <div className="p-3">
          <Skeleton className="h-[220px]" />
        </div>
      </div>
      <Skeleton className="h-[42px]" />
      <div className="grid min-h-[560px] gap-3">
        <Skeleton className="h-9" />
        <Skeleton className="min-h-[520px] flex-1" />
      </div>
    </div>
  );
}
