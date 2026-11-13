import { ChartNoAxesColumn } from 'lucide-react';

import { Ga4SummaryRow, MetricCards } from './metric-cards';
import { PerformanceBreakdowns } from './performance-breakdowns';
import { PerformanceChart, type ChartSeries } from './performance-chart';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { ChartTone } from '@/components/ui/chart';
import { QueryState } from '@/components/ui/query-state';
import type { PerformanceDashboard } from '@/lib/api/performance';
import {
  METRIC_CARDS,
  toChartPoints,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';

// Each metric's chart position (its colour and texture), shared by the card
// keys and the chart lines: `data-1` to `data-3`, then Position in `data-other`.
const METRIC_TONES: Record<PerformanceMetricKey, ChartTone> = {
  clicks: 1,
  impressions: 2,
  ctr: 3,
  position: 4,
};

/** The drawn lines: one per selected metric, each with its comparison peer. */
export function chartSeries(
  selected: PerformanceDashboard['selected'],
  comparison: PerformanceDashboard['comparison'],
  active: ReadonlySet<PerformanceMetricKey>,
): ChartSeries[] {
  return METRIC_CARDS.filter((card) => active.has(card.key)).map((card) => ({
    key: card.key,
    label: card.label,
    tone: METRIC_TONES[card.key],
    selected: toChartPoints(selected.series[card.key]),
    comparison: comparison ? toChartPoints(comparison.series[card.key]) : null,
  }));
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
      <QueryState
        kind="empty"
        icon={ChartNoAxesColumn}
        heading="Building this performance range"
        description="CiteLadder is preparing this view from the traffic evidence already imported."
      />
    );
  }
  const firstUse = data.coverage.covered_days === 0 && data.selected.snapshot_id === null;
  return (
    <QueryState
      kind="empty"
      icon={ChartNoAxesColumn}
      heading={firstUse ? 'No search performance evidence yet' : 'No performance evidence here'}
      description={
        firstUse
          ? undefined
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
  refreshing: boolean;
}>) {
  if (!available) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <MetricCards
          data-testid="metric-card-strip"
          className="min-w-0"
          selected={selected}
          comparison={comparison}
          compareLabel={compareLabel}
          selectedLabel={selectedLabel}
          active={activeMetrics}
          onToggle={onToggleMetric}
          tones={METRIC_TONES}
          loading={refreshing}
        />
      </CardHeader>
      <CardContent>
        <PerformanceChart series={series} />
      </CardContent>
    </Card>
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

/** The evidence below the status line: the empty state, or the chart, GA4 row and tables. */
export function PerformanceEvidence({
  data,
  hasEvidence,
  evidence,
  projection,
  selectedLabel,
  comparisonLabel,
  activeMetrics,
  toggleMetric,
  series,
  refreshing,
  projectId,
  dimension,
  setDimension,
}: Readonly<{
  data: PerformanceDashboard;
  hasEvidence: boolean;
  evidence: {
    hasSearchConsoleTotals: boolean;
    hasSearchConsoleBreakdowns: boolean;
    hasGa4: boolean;
    hasBing: boolean;
  };
  projection: { projecting: boolean; failure: unknown };
  selectedLabel: string;
  comparisonLabel: string;
  activeMetrics: ReadonlySet<PerformanceMetricKey>;
  toggleMetric: (metric: PerformanceMetricKey) => void;
  series: ChartSeries[];
  refreshing: boolean;
  projectId: string;
  dimension: Parameters<typeof PerformanceBreakdowns>[0]['dimension'];
  setDimension: Parameters<typeof PerformanceBreakdowns>[0]['onDimensionChange'];
}>) {
  const selectedWindow = data.selected;
  const comparisonWindow = data.comparison;
  return !hasEvidence ? (
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
  );
}
