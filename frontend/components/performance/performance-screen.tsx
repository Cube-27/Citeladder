import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { DateRangeDialog } from './date-range-dialog';
import {
  granularityFilter,
  PerformanceActions,
  PerformanceToolbar,
  PerformanceWindowCaption,
  performanceNotices,
  ProjectionFailure,
} from './performance-chrome';
import { chartSeries, PerformanceEvidence } from './performance-evidence';
import { ReadinessLadder, useProjectReadiness } from './readiness-ladder';
import { DataSourceSetup } from '@/components/integrations/data-source-setup';
import { usePerformanceSelection } from './use-performance-selection';
import { usePerformanceSync } from './use-performance-sync';
import { useRangeProjection } from './use-range-projection';
import { ListScreen, RESERVED_CONTROLS } from '@/components/layout/page-shell';
import { Stack } from '@/components/ui/layout';
import type { FilterBarProps } from '@/components/ui/filter-bar';
import { QueryState } from '@/components/ui/query-state';
import { readErrorProps } from '@/components/ui/read-error';
import { StatusLine } from '@/components/ui/status-line';
import { formatCount, formatWindowDate } from '@/lib/format';
import { integrationsQueries } from '@/lib/api/integrations';
import {
  performanceQueries,
  type PerformanceDashboard,
  type PerformanceGranularity,
  type ProjectReadiness,
} from '@/lib/api/performance';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { useProjectScope } from '@/lib/project/active-project-scope';
import {
  COMPARE_OPTIONS,
  canCompareYearOverYear,
  dashboardParams,
  describeWindow,
  windowLength,
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

function compareLabel(selection: RangeSelection): string {
  return (
    COMPARE_OPTIONS.find((option) => option.value === selection.compare)?.label ?? 'Comparison'
  );
}

/**
 * What the selected snapshot can show. A connected Bing (readiness
 * `providers`) that measured nothing still has its panel, stating zero rows,
 * while a project without one never shows it.
 */
function evidenceAvailability(data: PerformanceDashboard, readiness: ProjectReadiness | undefined) {
  const { totals, snapshot_id: snapshotId } = data.selected;
  const bingConnected = readiness?.providers.includes('bing') ?? false;
  const hasSearchConsoleTotals = totals.clicks !== null || totals.impressions !== null;
  const hasSearchConsoleDimensions = [
    data.dimension_counts.query,
    data.dimension_counts.page,
    data.dimension_counts.country,
    data.dimension_counts.device,
    data.dimension_counts.search_appearance,
    data.dimension_counts.day,
  ].some((count) => count > 0);
  const hasSearchConsoleBreakdowns = hasSearchConsoleTotals || hasSearchConsoleDimensions;
  const hasGa4 = totals.sessions !== null || totals.key_events !== null;
  const hasBing =
    snapshotId !== null &&
    (bingConnected || data.dimension_counts.bing_query > 0 || data.dimension_counts.bing_page > 0);
  return {
    hasSearchConsoleTotals,
    hasSearchConsoleBreakdowns,
    hasGa4,
    hasBing,
  };
}

function performanceCoverage(data: PerformanceDashboard, hasEvidence: boolean) {
  const firstUse =
    !hasEvidence && data.coverage.covered_days === 0 && data.selected.snapshot_id === null;
  return {
    firstUse,
    selectedMissing: !firstUse && data.selected.snapshot_id === null,
    comparisonMissing:
      !firstUse && data.comparison !== null && data.comparison.snapshot_id === null,
  };
}

function hasQualityFlags(quality: PerformanceDashboard['coverage']['analytics_quality']) {
  return Object.values(quality).some((days) => days.some((day) => day.flags.length > 0));
}

/** The status line at rest: the history the dashboard can draw from. */
function coverageSummary(coverage: PerformanceDashboard['coverage']): string {
  // The extent spans the imported metric rows, so no dates means no rows —
  // which is not the same as no import having run.
  if (!coverage.earliest_date || !coverage.latest_date) return 'No imported search rows yet.';
  return `Imported history ${formatWindowDate(coverage.earliest_date)} – ${formatWindowDate(
    coverage.latest_date,
  )} · ${formatCount(coverage.covered_days)} days`;
}

/**
 * The page's control row: the range is its most used control, so it leads as
 * the view; the chart interval waits in All filters while there is a chart,
 * and the window it covers closes the row.
 */
function performanceControls({
  selection,
  onSelectRange,
  onOpenDialog,
  onReset,
  hasChart,
  granularity,
  onGranularityChange,
  windowLabel,
}: Readonly<{
  selection: RangeSelection;
  onSelectRange: (selection: RangeSelection) => void;
  onOpenDialog: (tab: 'filter' | 'compare') => void;
  onReset: () => void;
  /** The chart interval is a filter only while there is a chart to draw. */
  hasChart: boolean;
  granularity: PerformanceGranularity;
  onGranularityChange: (next: PerformanceGranularity) => void;
  windowLabel: string;
}>): FilterBarProps {
  return {
    view: (
      <PerformanceToolbar
        selection={selection}
        onOpenRange={() => onOpenDialog('filter')}
        onOpenCompare={() => onOpenDialog('compare')}
        onSelectRange={onSelectRange}
        comparing={selection.compare !== 'none'}
        onReset={onReset}
      />
    ),
    filters: hasChart ? [granularityFilter(granularity, onGranularityChange)] : undefined,
    status: <PerformanceWindowCaption label={windowLabel} />,
  };
}

/**
 * The first load holds the control band the loaded page draws its range
 * toolbar in, so the work starts on the same line before and after.
 */
function PerformanceLoading() {
  return (
    <ListScreen controls={RESERVED_CONTROLS}>
      <QueryState kind="loading" label="Loading performance…" />
    </ListScreen>
  );
}

/**
 * Only an answered, empty list is "no connections". While the read is pending
 * or after it failed the server decides: the sync itself says "nothing to
 * sync" when there is nothing.
 */
function answeredNoConnections(
  read: Readonly<{ isSuccess: boolean; data: readonly unknown[] | undefined }>,
): boolean {
  return read.isSuccess && read.data?.length === 0;
}

export function PerformanceScreen() {
  const { projectId, workspaceId } = useProjectScope();
  const scope = { workspaceId, projectId };
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
    ...performanceQueries.dashboard(scope, dashboardParams(selection, granularity)),
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId, previousData, previousQuery),
  });
  const connections = useQuery(integrationsQueries.connections(workspaceId));
  const sync = usePerformanceSync();
  const readiness = useProjectReadiness();
  const projection = useRangeProjection(scope, dashboard.data);

  // Every state keeps its identity band: a page that loses its heading and its
  // rule while loading is a different-looking page, and the work below it moves
  // when the real one arrives.
  if (dashboard.isError)
    return (
      <ListScreen>
        <QueryState
          kind="error"
          {...readErrorProps(dashboard)}
          fallback="Could not load performance data. Check your connection and try again."
        />
      </ListScreen>
    );
  // Only the dashboard controls the screen's first paint. Connections feeds
  // one toolbar button and readiness one advisory ladder — both render into
  // an already-drawn page, so a slow secondary read must not hold the whole
  // surface on the slowest of three independent requests. Retained previous
  // scope data (a placeholder) counts as paintable.
  if (!dashboard.data) return <PerformanceLoading />;

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
  const evidence = evidenceAvailability(data, readiness.data);
  const hasEvidence = evidence.hasSearchConsoleBreakdowns || evidence.hasGa4 || evidence.hasBing;
  const coverage = performanceCoverage(data, hasEvidence);

  return (
    <ListScreen
      actions={
        <PerformanceActions
          latestDate={data.coverage.latest_date}
          noConnections={answeredNoConnections(connections)}
          sync={sync}
        />
      }
      controls={performanceControls({
        selection,
        onSelectRange: setSelection,
        onOpenDialog: (tab) => {
          setDialogTab(tab);
          setDialogOpen(true);
        },
        onReset: resetFilters,
        hasChart: evidence.hasSearchConsoleTotals,
        granularity,
        onGranularityChange: setGranularity,
        windowLabel: selectedLabel,
      })}
    >
      <Stack gap="workspace">
        <DataSourceSetup
          required={['gsc']}
          optional={['ga4', 'bing']}
          title="Connect Search Console"
        />
        {readiness.isError ? null : (
          <ReadinessLadder
            data={readiness.data}
            sync={sync.syncing || sync.mutation.isPending ? undefined : sync.start}
          />
        )}

        <StatusLine
          testId="performance-status"
          resting={coverageSummary(data.coverage)}
          messages={performanceNotices({
            sync,
            projecting: projection.projecting,
            projectionFailed: projection.failure !== null,
            selectedMissing: coverage.selectedMissing,
            comparisonMissing: coverage.comparisonMissing,
            qualityFlagged: hasQualityFlags(data.coverage.analytics_quality),
            readinessFailed: readiness.isError,
          })}
        />

        <ProjectionFailure failure={projection.failure} />
        <PerformanceEvidence
          data={data}
          hasEvidence={hasEvidence}
          evidence={evidence}
          projection={projection}
          selectedLabel={selectedLabel}
          comparisonLabel={comparisonLabel}
          activeMetrics={activeMetrics}
          toggleMetric={toggleMetric}
          series={series}
          refreshing={refreshing}
          projectId={projectId}
          dimension={dimension}
          setDimension={setDimension}
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
      </Stack>
    </ListScreen>
  );
}
