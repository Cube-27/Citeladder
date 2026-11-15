import { Stack } from '@/components/ui/layout';
import { StepChart, type TrendPoint } from '@/components/ui/step-chart';
import {
  SeriesTonesContext,
  seriesTones,
  type MarkerShape,
  type SeriesTone,
} from '@/components/ui/step-chart-parts';
import { StateBlock } from '@/components/ui/state-block';
import { formatShortDate, formatWindowDate } from '@/lib/format';
import {
  formatAxisTick,
  formatMetric,
  METRIC_CARDS,
  type PerformanceChartPoint,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';

/**
 * The Performance charts: one chart per selected GSC metric, stacked so they
 * share the x axis, each on its own y scale with tick labels. Clicks and
 * impressions differ by orders of magnitude and CTR is a fraction while
 * position is a rank, so one shared scale would flatten every series but
 * the largest. The comparison window is drawn against the selection day by
 * day (position N against position N): it covers other dates, which each
 * point's label names. A null bucket is an unmeasured one: the line breaks.
 */

/** A metric's line: ink or a cool hue (never the accent: no series here is "you") and its marker. */
export type MetricMark = Readonly<{ tone: SeriesTone; shape: MarkerShape }>;

/** Each metric's mark, shared by its figure's key and its line. */
export const METRIC_MARKS: Record<PerformanceMetricKey, MetricMark> = {
  clicks: { tone: 'rival-1', shape: 'square' },
  impressions: { tone: 'rival-2', shape: 'diamond' },
  ctr: { tone: 'rival-3', shape: 'triangle' },
  position: { tone: 'rival-4', shape: 'circle' },
};

/** Every metric keeps its figure's colour on its chart, in the figures' order. */
const METRIC_TONES = seriesTones(METRIC_CARDS.map((card) => card.label));

export type ChartSeries = {
  key: PerformanceMetricKey;
  label: string;
  /** The metric's line colour and marker, shared with its figure's key. */
  mark: MetricMark;
  selected: PerformanceChartPoint[];
  comparison: PerformanceChartPoint[] | null;
};

function dayCount(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`;
}

/** The selection's days as chart points: dated, and naming the comparison day each is read against. */
function chartPoints(series: ChartSeries): TrendPoint[] {
  return series.selected.map((point, index) => {
    const peer = series.comparison?.[index]?.date ?? null;
    const day = point.date ? formatWindowDate(point.date) : `Day ${point.index}`;
    const timestamp = point.date ? Date.parse(`${point.date}T00:00:00Z`) : Number.NaN;
    return {
      label: peer ? `${day} · vs ${formatWindowDate(peer)}` : day,
      axisLabel: point.date ? formatShortDate(point.date) : `Day ${point.index}`,
      value: point.value,
      timestamp: Number.isNaN(timestamp) ? undefined : timestamp,
    };
  });
}

function MetricChart({ series, height }: Readonly<{ series: ChartSeries; height: 'sm' | 'md' }>) {
  const comparing = series.comparison !== null;
  const label = `${series.label} over ${dayCount(series.selected.length)}${
    comparing ? ', with comparison period' : ''
  }`;
  return (
    <StepChart
      data={chartPoints(series)}
      name={series.label}
      label={label}
      you={false}
      height={height}
      yMin={0}
      yFormat={(value) => formatAxisTick(series.key, value)}
      format={(value) => formatMetric(series.key, value)}
      series={
        series.comparison
          ? [
              {
                label: `${series.label} (comparison)`,
                values: series.selected.map(
                  (_, index) => series.comparison?.[index]?.value ?? null,
                ),
                other: true,
              },
            ]
          : []
      }
    />
  );
}

export function PerformanceChart({
  series,
  className,
}: Readonly<{ series: readonly ChartSeries[]; className?: string }>) {
  const plotted = series.filter((entry) => entry.selected.length > 0);
  if (!series.length)
    return <StateBlock kind="empty" inline message="Select a figure above to chart it." />;
  if (!plotted.length)
    return <StateBlock kind="empty" inline message="No measured days in the selected range." />;
  const height = plotted.length === 1 ? 'md' : 'sm';
  return (
    <SeriesTonesContext value={METRIC_TONES}>
      <Stack gap="workspace" className={className}>
        {plotted.map((entry) => (
          <MetricChart key={entry.key} series={entry} height={height} />
        ))}
      </Stack>
    </SeriesTonesContext>
  );
}
