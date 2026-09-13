'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { DateRangeDialog } from './date-range-dialog';
import { GranularitySelect, PerformanceNotices, PerformanceToolbar } from './performance-chrome';
import { Ga4SummaryRow, MetricCards } from './metric-cards';
import { PerformanceBreakdowns } from './performance-breakdowns';
import { PerformanceChart, type ChartSeries } from './performance-chart';
import { ReadinessLadder, useConnectedProviders } from './readiness-ladder';
import { usePerformanceSelection } from './use-performance-selection';
import { usePerformanceSync } from './use-performance-sync';
import { PageLoading } from '@/components/layout/page-loading';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartNoAxesColumn } from 'lucide-react';
import { integrationsApi } from '@/lib/api/integrations';
import {
  performanceApi,
  performanceQueries,
  type PerformanceDashboard,
} from '@/lib/api/performance';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { useProjectContext } from '@/lib/project/project-context';
import {
  resolveActiveProjectRequestScope,
  type ProjectRequestScope,
} from '@/lib/project/request-scope';
import {
  COMPARE_OPTIONS,
  METRIC_CARDS,
  canCompareYearOverYear,
  dashboardParams,
  describeWindow,
  toChartPoints,
  windowLength,
  type PerformanceMetricKey,
  type RangeSelection,
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

function evidenceAvailability(data: PerformanceDashboard, connectedProviders: readonly string[]) {
  const { totals, snapshot_id: snapshotId } = data.selected;
  const hasSearchConsole = totals.clicks !== null || totals.impressions !== null;
  const hasGa4 = totals.sessions !== null || totals.conversions !== null;
  const hasBing =
    snapshotId !== null &&
    (connectedProviders.includes('bing') ||
      data.dimension_counts.bing_query > 0 ||
      data.dimension_counts.bing_page > 0);
  return { hasSearchConsole, hasGa4, hasBing };
}

function PerformanceEmptyState({
  data,
  projecting,
}: Readonly<{ data: PerformanceDashboard; projecting: boolean }>) {
  if (projecting) {
    return (
      <EmptyState
        icon={ChartNoAxesColumn}
        heading="Building this performance range"
        description="CiteLadder is preparing this view from the traffic evidence already imported."
      />
    );
  }
  const firstUse = data.coverage.covered_days === 0 && data.selected.snapshot_id === null;
  return (
    <EmptyState
      icon={ChartNoAxesColumn}
      heading={firstUse ? 'No search performance evidence yet' : 'No performance evidence here'}
      description={
        firstUse
          ? 'Connect and import a supported traffic source to measure this project’s performance.'
          : 'Choose a range inside the imported history, or sync the missing dates.'
      }
    />
  );
}

function SearchConsoleWorkspace({
  available,
  selected,
  comparison,
  selectedLabel,
  compareLabel,
  activeMetrics,
  onToggleMetric,
  series,
  granularity,
  onGranularityChange,
  refreshing,
}: Readonly<{
  available: boolean;
  selected: PerformanceDashboard['selected'];
  comparison: PerformanceDashboard['comparison'];
  selectedLabel: string;
  compareLabel: string;
  activeMetrics: ReadonlySet<PerformanceMetricKey>;
  onToggleMetric: (metric: PerformanceMetricKey) => void;
  series: ChartSeries[];
  granularity: PerformanceDashboard['granularity'];
  onGranularityChange: (value: PerformanceDashboard['granularity']) => void;
  refreshing: boolean;
}>) {
  if (!available) return null;
  return (
    <div className="border-border-subtle bg-panel overflow-hidden rounded-[var(--radius-panel)] border">
      <div className="border-border-subtle flex flex-col border-b lg:flex-row lg:items-stretch lg:justify-between">
        <MetricCards
          selected={selected}
          comparison={comparison}
          compareLabel={compareLabel}
          selectedLabel={selectedLabel}
          active={activeMetrics}
          onToggle={onToggleMetric}
          colors={METRIC_COLORS}
          loading={refreshing}
          className="flex-1"
        />
        <div className="border-border-subtle flex shrink-0 items-center justify-end border-t px-3 py-2 lg:border-t-0 lg:border-l">
          <GranularitySelect value={granularity} onChange={onGranularityChange} />
        </div>
      </div>
      <div className="p-3">
        <PerformanceChart series={series} />
      </div>
    </div>
  );
}

function Ga4Workspace({
  available,
  selected,
  comparison,
  compareLabel,
  refreshing,
}: Readonly<{
  available: boolean;
  selected: PerformanceDashboard['selected'];
  comparison: PerformanceDashboard['comparison'];
  compareLabel: string;
  refreshing: boolean;
}>) {
  if (!available) return null;
  return (
    <Ga4SummaryRow
      selected={selected}
      comparison={comparison}
      compareLabel={compareLabel}
      loading={refreshing}
    />
  );
}

export function PerformanceScreen() {
  const { activeProject, isLoading } = useProjectContext();
  const scope = resolveActiveProjectRequestScope(activeProject);
  const { projectId, workspaceId } = scope;
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

  const dashboard = useQuery({
    ...performanceQueries.dashboard(
      workspaceId,
      projectId,
      dashboardParams(selection, granularity),
    ),
    enabled: scope.enabled,
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId, previousData, previousQuery),
  });
  const connections = useQuery({
    queryKey: queryKeys.integrations.connections(workspaceId),
    queryFn: ({ signal }) => integrationsApi.list({ signal, workspaceId }),
    enabled: Boolean(workspaceId),
  });
  const connectedProviders = useConnectedProviders(projectId);
  const sync = usePerformanceSync(projectId);
  const projection = useRangeProjection(scope, dashboard.data);

  // No project yet is either "still resolving which one" or "there is none";
  // only the second is something to tell the reader about.
  if (!projectId)
    return isLoading ? (
      <PageLoading label="Loading performance…" />
    ) : (
      <Alert tone="info">Select or create a project to see its search performance.</Alert>
    );
  if (dashboard.isLoading) return <PageLoading label="Loading performance…" />;
  if (dashboard.isError)
    return (
      <Alert tone="danger">
        Could not load performance data. Check your connection and try again.
      </Alert>
    );

  const data = dashboard.data as PerformanceDashboard;
  // The figures on screen belong to a DIFFERENT selection (retained while the
  // new one loads), or the window's projection is still being built. The value
  // slots spin instead of claiming a figure is absent — and they keep their
  // boxes, so nothing below them moves.
  //
  // Not `isFetching`: a background revalidation of the same selection keeps
  // figures that are still current, and swapping them for spinners only to
  // put the identical numbers back was the return-to-Performance flicker.
  const refreshing = dashboard.isPlaceholderData || projection.projecting;
  const selectedWindow = data.selected;
  const comparisonWindow = data.comparison;
  const selectedLabel = describeWindow(selectedWindow);
  const comparisonLabel = compareLabel(selection);
  const series = chartSeries(selectedWindow, comparisonWindow, activeMetrics);
  const evidence = evidenceAvailability(data, connectedProviders);
  const hasEvidence = evidence.hasSearchConsole || evidence.hasGa4 || evidence.hasBing;

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

      {!hasEvidence ? (
        <PerformanceEmptyState data={data} projecting={projection.projecting} />
      ) : (
        <>
          {/* One card holds the strip and the plot it drives: selecting a card
          changes the lines directly beneath it, so a gap between them would
          split a control from its own result. The strip sits flush with the
          granularity control aligned on the right of the header row. */}
          <SearchConsoleWorkspace
            available={evidence.hasSearchConsole}
            selected={selectedWindow}
            comparison={comparisonWindow}
            selectedLabel={selectedLabel}
            compareLabel={comparisonLabel}
            activeMetrics={activeMetrics}
            onToggleMetric={toggleMetric}
            series={series}
            granularity={granularity}
            onGranularityChange={setGranularity}
            refreshing={refreshing}
          />
          <Ga4Workspace
            available={evidence.hasGa4}
            selected={selectedWindow}
            comparison={comparisonWindow}
            compareLabel={comparisonLabel}
            refreshing={refreshing}
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
            hasSearchConsole={evidence.hasSearchConsole}
            // Only when a Bing connection exists: Bing's panel states "measured
            // nothing", which is not what an absent connection means.
            hasBing={evidence.hasBing}
          />
        </>
      )}
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
function useRangeProjection(scope: ProjectRequestScope, data: PerformanceDashboard | undefined) {
  const { workspaceId, projectId } = scope;
  const queryClient = useQueryClient();
  const scopeKey = `${workspaceId}:${projectId}`;
  const [queued, setQueued] = useState<{ scopeKey: string; taskId: string } | null>(null);
  const pending = queued?.scopeKey === scopeKey ? queued.taskId : null;
  const mutation = useMutation({
    mutationFn: async (window: { from: string; to: string }) => {
      if (!scope.enabled) throw new Error('Project is not available.');
      const task = await performanceApi.enqueueRange(projectId, window, { workspaceId });
      return { scopeKey, taskId: task.task_id };
    },
    onSuccess: setQueued,
  });

  const missing = missingWindow(data);
  useEffect(() => {
    if (!scope.enabled || !missing) return;
    mutation.mutate(missing);
    // `missing` is a stable string pair derived from the response; re-running
    // on the mutation object itself would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.enabled, workspaceId, projectId, missing?.from, missing?.to]);

  const task = useQuery({
    queryKey: queryKeys.performance.rangeTask(projectId, pending ?? ''),
    queryFn: ({ signal }) =>
      performanceApi.getRangeTask(projectId, pending ?? '', { signal, workspaceId }),
    enabled: scope.enabled && Boolean(pending),
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
    setQueued(null);
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
