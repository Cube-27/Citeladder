import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { DateRangeDialog } from './date-range-dialog';
import {
  granularityFilter,
  PerformanceActions,
  PerformanceNotice,
  PerformanceToolbar,
  PerformanceWindowCaption,
  performanceNotices,
  ProjectionFailure,
} from './performance-chrome';
import { Ga4SummaryRow, MetricCards, MetricDefinitions } from './metric-cards';
import { PerformanceBreakdowns } from './performance-breakdowns';
import { METRIC_MARKS, PerformanceChart, type ChartSeries } from './performance-chart';
import { ReadinessLadder, useProjectReadiness } from './readiness-ladder';
import { DataSourceSetup } from '@/components/integrations/data-source-setup';
import { usePerformanceSelection } from './use-performance-selection';
import { usePerformanceSync } from './use-performance-sync';
import { useRangeProjection } from './use-range-projection';
import { RESERVED_CONTROLS } from '@/components/layout/page-shell';
import { ReportPage } from '@/components/templates/report-page';
import { Stack } from '@/components/ui/layout';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatWindowDate, pluralCount } from '@/lib/format';
import { ChartNoAxesColumn } from 'lucide-react';
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
  METRIC_CARDS,
  canCompareYearOverYear,
  dashboardParams,
  describeWindow,
  toChartPoints,
  windowLength,
  type PerformanceMetricKey,
  type RangeSelection,
} from '@/lib/performance/performance';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

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

/** The drawn lines: one per selected metric, each with its comparison peer. */
function chartSeries(
  selected: PerformanceDashboard['selected'],
  comparison: PerformanceDashboard['comparison'],
  active: ReadonlySet<PerformanceMetricKey>,
): ChartSeries[] {
  return METRIC_CARDS.filter((card) => active.has(card.key)).map((card) => ({
    key: card.key,
    label: card.label,
    mark: METRIC_MARKS[card.key],
    selected: toChartPoints(selected.series[card.key]),
    comparison: comparison ? toChartPoints(comparison.series[card.key]) : null,
  }));
}

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

function performanceCoverage(
  data: PerformanceDashboard,
  evidence: ReturnType<typeof evidenceAvailability>,
) {
  const hasEvidence = evidence.hasSearchConsoleBreakdowns || evidence.hasGa4 || evidence.hasBing;
  const firstUse =
    !hasEvidence && data.coverage.covered_days === 0 && data.selected.snapshot_id === null;
  return {
    hasEvidence,
    firstUse,
    selectedMissing: !firstUse && data.selected.snapshot_id === null,
    comparisonMissing:
      !firstUse && data.comparison !== null && data.comparison.snapshot_id === null,
  };
}

function hasQualityFlags(quality: PerformanceDashboard['coverage']['analytics_quality']) {
  return Object.values(quality).some((days) => days.some((day) => day.flags.length > 0));
}

/** The history the dashboard can draw from, or nothing before any rows. */
function coverageSummary(coverage: PerformanceDashboard['coverage']): string | null {
  if (!coverage.earliest_date || !coverage.latest_date) return null;
  return `Imported history ${formatWindowDate(coverage.earliest_date)} – ${formatWindowDate(
    coverage.latest_date,
  )} · ${pluralCount(coverage.covered_days, 'day')}`;
}

/**
 * Search Console is connected and nothing is imported yet: there is nothing
 * to range over, so the page shows this and its one step, and no range
 * controls.
 */
function FirstUseEmptyState({ action }: Readonly<{ action: ReactNode }>) {
  return (
    <Section>
      <StateBlock
        kind="empty"
        icon={ChartNoAxesColumn}
        heading="No Search Console history yet"
        description="Performance charts the clicks and impressions Search Console reports. Sync to import your history."
        action={action}
      />
    </Section>
  );
}

function PerformanceEmptyState({
  data,
  projecting,
  failed,
}: Readonly<{ data: PerformanceDashboard; projecting: boolean; failed: boolean }>) {
  // A failed build is reported by `ProjectionFailure`, never as "no evidence".
  if (failed) return null;
  if (projecting) {
    return (
      <Section>
        <StateBlock
          kind="empty"
          icon={ChartNoAxesColumn}
          heading="Building this performance range"
          description="CiteLadder is preparing this view from the traffic evidence already imported."
        />
      </Section>
    );
  }
  // Before any import the setup card or the first-use state says what to do.
  if (data.coverage.covered_days === 0 && data.selected.snapshot_id === null) return null;
  return (
    <Section>
      <StateBlock
        kind="empty"
        icon={ChartNoAxesColumn}
        heading="No performance evidence here"
        description="Choose a range inside the imported history, or sync the missing dates."
      />
    </Section>
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
  refreshing,
  coverage,
}: Readonly<{
  available: boolean;
  selected: PerformanceDashboard['selected'];
  comparison: PerformanceDashboard['comparison'];
  selectedLabel: string;
  compareLabel: string;
  activeMetrics: ReadonlySet<PerformanceMetricKey>;
  onToggleMetric: (metric: PerformanceMetricKey) => void;
  series: ChartSeries[];
  refreshing: boolean;
  /** The imported history the figures draw from. */
  coverage: string | null;
}>) {
  if (!available) return null;
  // The strip and the charts it drives are one section: selecting a figure
  // changes the charts directly beneath it. The figure row sits on the ground;
  // only the chart keeps a card (owner 2026-11-18: no cards but tables, charts).
  return (
    <Section variant="group" aria-labelledby="performance-search-console">
      <SectionHeader actions={<MetricDefinitions />}>
        <SectionTitle id="performance-search-console">Google Search</SectionTitle>
        {coverage ? (
          <SectionDescription data-testid="performance-coverage">{coverage}</SectionDescription>
        ) : null}
      </SectionHeader>
      <Stack gap="workspace" className="min-w-0">
        <MetricCards
          data-testid="metric-card-strip"
          className="min-w-0"
          selected={selected}
          comparison={comparison}
          compareLabel={compareLabel}
          selectedLabel={selectedLabel}
          active={activeMetrics}
          onToggle={onToggleMetric}
          marks={METRIC_MARKS}
          loading={refreshing}
        />
        <Section aria-label="Search Console chart">
          <PerformanceChart series={series} />
        </Section>
      </Stack>
    </Section>
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
    <Section variant="group" aria-labelledby="performance-ga4">
      <SectionHeader>
        <SectionTitle id="performance-ga4">Google Analytics 4</SectionTitle>
        <SectionDescription>
          Property-wide organic and AI sessions · Key events as configured in GA4
        </SectionDescription>
      </SectionHeader>
      <Ga4SummaryRow
        selected={selected}
        comparison={comparison}
        compareLabel={compareLabel}
        loading={refreshing}
      />
    </Section>
  );
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
  latestDate,
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
  latestDate: string | null;
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
    status: <PerformanceWindowCaption label={windowLabel} latestDate={latestDate} />,
  };
}

/**
 * The first load holds the control band the loaded page draws its range
 * toolbar in, and the Google Search card in its loaded shape (its head, four
 * figures, a chart), so the figures start on the same line before and after.
 */
function PerformanceLoading() {
  return (
    <ReportPage filters={<FilterBar {...RESERVED_CONTROLS} />}>
      <Section aria-labelledby="performance-search-console-loading">
        <SectionHeader>
          <SectionTitle id="performance-search-console-loading">Google Search</SectionTitle>
        </SectionHeader>
        <Stack gap="workspace">
          <Skeleton variant="stat" count={4} label="Loading performance" />
          <Skeleton variant="chart" height="md" />
        </Stack>
      </Section>
    </ReportPage>
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

/** The ladder's Sync again, offered only while no sync is starting or running. */
function idleSync(sync: ReturnType<typeof usePerformanceSync>) {
  return sync.syncing || sync.mutation.isPending ? undefined : sync.start;
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
      <ReportPage>
        <StateBlock
          kind="error"
          {...readErrorProps(dashboard)}
          fallback="Couldn't load performance data. Check your connection and try again."
          title="Couldn't load performance data"
        />
      </ReportPage>
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
  const coverage = performanceCoverage(data, evidence);
  const syncAction = (
    <PerformanceActions noConnections={answeredNoConnections(connections)} sync={sync} />
  );

  return (
    <ReportPage
      // Before any history there is nothing to range over or re-sync: the
      // empty state holds the one step, and no range controls are drawn.
      actions={coverage.firstUse ? undefined : syncAction}
      filters={
        coverage.firstUse ? undefined : (
          <FilterBar
            {...performanceControls({
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
              latestDate: data.coverage.latest_date,
            })}
          />
        )
      }
    >
      <Stack gap="workspace">
        <DataSourceSetup
          required={['gsc']}
          optional={['ga4', 'bing']}
          title="Connect Search Console"
          unconnected={{
            heading: 'Connect Google and Bing',
            description:
              'Performance shows clicks, impressions and AI referral sessions from Search Console, Analytics 4 and Bing Webmaster Tools.',
          }}
          whenReady={coverage.firstUse ? <FirstUseEmptyState action={syncAction} /> : null}
        />
        {readiness.isError ? null : <ReadinessLadder data={readiness.data} sync={idleSync(sync)} />}

        <PerformanceNotice
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
        {!coverage.hasEvidence ? (
          <PerformanceEmptyState
            data={data}
            projecting={projection.projecting}
            failed={projection.failure !== null}
          />
        ) : (
          <>
            {/* One card holds the strip and the plot it drives: selecting a card
          changes the lines directly beneath it, so a gap between them would
          split a control from its own result. The strip sits flush with the
          granularity control aligned on the right of the header row. */}
            <SearchConsoleWorkspace
              available={evidence.hasSearchConsoleTotals}
              selected={selectedWindow}
              comparison={comparisonWindow}
              selectedLabel={selectedLabel}
              compareLabel={comparisonLabel}
              activeMetrics={activeMetrics}
              onToggleMetric={toggleMetric}
              series={series}
              refreshing={refreshing}
              coverage={coverageSummary(data.coverage)}
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
              dimensionCounts={data.dimension_counts}
              unavailableDimensions={data.unavailable_dimensions}
              activeMetrics={activeMetrics}
              selectedLabel={selectedLabel}
              compareLabel={comparisonLabel}
              hasSearchConsole={evidence.hasSearchConsoleBreakdowns}
              // Only when Bing is connected or has rows: Bing's panel states
              // "measured nothing", which is not what an absent connection means.
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
      </Stack>
    </ReportPage>
  );
}
