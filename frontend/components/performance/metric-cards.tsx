import { SERIES_FILL, SERIES_STROKE } from '@/components/ui/step-chart-parts';
import { cn } from '@/lib/utils';
import { Absence } from '@/components/ui/absence';
import { InfoHint } from '@/components/ui/info-hint';
import type { PerformanceWindow } from '@/lib/api/performance';
import { availabilityLabel, formatCount } from '@/lib/format';
import {
  METRIC_CARDS,
  formatMetric,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';
import { FigureStrip } from '@/components/ui/figure-strip';

import type { MetricMark } from './performance-chart';

/** The one missing-figure label on this surface. */
const NOT_MEASURED = availabilityLabel('not_measured');

/** A formatted figure, or null when the window measured nothing for it. */
function measured(key: PerformanceMetricKey, value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : formatMetric(key, value);
}

/**
 * The four selectable GSC metric cards.
 *
 * Each card shows the EXACT value for the selected range and, when a
 * comparison is active, the comparison window's own absolute value beneath
 * it — never a percentage. A derived ratio would hide the denominator a
 * reader needs to judge whether a change matters at all; two absolute numbers
 * do not.
 *
 * Selecting a card toggles its series on the chart below. At least one metric
 * always stays selected, so the chart never renders as an empty plot.
 *
 * The four render as ONE connected band (a `FigureStrip`) rather
 * than four detached cards: they are a single control group over one window.
 * The cards are neutral; the metric's chart colour appears only as the series
 * key beside the label, and only while the metric is plotted. Selection is the
 * shared selected-row face plus `aria-pressed`.
 */
const METRIC_HELP: Record<PerformanceMetricKey, string> = {
  clicks: 'Total clicks from Google Search results',
  impressions: 'Total impressions in Google Search results',
  ctr: 'Average click-through rate (Clicks / Impressions)',
  position: 'Average ranking position in Google Search results',
};

/**
 * The comparison half of a card: the comparison window's own absolute value,
 * under a label that names THAT window.
 */
function metricComparison(
  metricKey: PerformanceMetricKey,
  comparison: PerformanceWindow,
  compareLabel: string,
) {
  return {
    label:
      comparison.evidence_state === 'not_run' ? `${compareLabel} — not imported` : compareLabel,
    value: measured(metricKey, comparison.totals[metricKey]),
  };
}

/**
 * The label row's end: the series key, shown only while the metric is
 * plotted (a key on an unplotted metric would point at a line that is not
 * there). The definitions sit in one hint beside the section's title, so no
 * second target nests inside a card's toggle.
 */
/** The metric's series colour: filled while plotted, a hollow 2px ring otherwise (the non-colour mark). */
function MetricMarker({ mark, plotted }: Readonly<{ mark: MetricMark; plotted: boolean }>) {
  return (
    <svg aria-hidden width={12} height={12} viewBox="0 0 12 12" className="shrink-0">
      <circle
        cx={6}
        cy={6}
        r={5}
        strokeWidth={2}
        fill={plotted ? undefined : 'none'}
        className={cn(SERIES_STROKE[mark.tone], plotted && SERIES_FILL[mark.tone])}
      />
    </svg>
  );
}

/** What each Search Console metric means, in one hint for the strip. */
export function MetricDefinitions() {
  return (
    <InfoHint label="What these metrics mean">
      {METRIC_CARDS.map((card) => (
        <span key={card.key} className="block">{`${card.label}: ${METRIC_HELP[card.key]}.`}</span>
      ))}
    </InfoHint>
  );
}

export function MetricCards({
  selected,
  comparison,
  selectedLabel,
  compareLabel,
  active,
  onToggle,
  marks,
  loading = false,
  className,
  'data-testid': testId,
}: Readonly<{
  selected: PerformanceWindow;
  comparison: PerformanceWindow | null;
  selectedLabel: string;
  compareLabel: string;
  active: ReadonlySet<PerformanceMetricKey>;
  onToggle: (key: PerformanceMetricKey) => void;
  /** Each metric's line colour and marker, shared with its line on the chart. */
  marks: Record<PerformanceMetricKey, MetricMark>;
  /** A read is in flight. The cards spin rather than claiming a value is absent. */
  loading?: boolean;
  className?: string;
  'data-testid'?: string;
}>) {
  return (
    <div className={className}>
      <FigureStrip
        label="Search Console metrics"
        testId={testId}
        segments={METRIC_CARDS.map((card) => {
          const plotted = active.has(card.key);
          return {
            key: card.key,
            label: card.label,
            // The period labels earn their place only when TWO values stack:
            // with one number the range is already stated in the toolbar.
            caption: comparison ? selectedLabel : undefined,
            value: measured(card.key, selected.totals[card.key]),
            missingLabel: NOT_MEASURED,
            loading,
            comparison: comparison
              ? metricComparison(card.key, comparison, compareLabel)
              : undefined,
            marker: <MetricMarker mark={marks[card.key]} plotted={plotted} />,
            onSelect: () => onToggle(card.key),
            actionLabel: `Plot ${card.label.toLowerCase()}`,
            selected: plotted,
          };
        })}
      />
    </div>
  );
}

const GA4_SUMMARY_ENTRIES = [
  { key: 'sessions' as const, label: 'Sessions' },
  { key: 'key_events' as const, label: 'Key events' },
];

/**
 * Sessions and key events for the selected range: one compact,
 * non-interactive row beneath the GSC cards.
 *
 * GA4 measures a different population than Search Console, so they never join
 * the chart or the metric selection — mixing them into one plot would imply a
 * comparability that does not exist. A null value means no included GA4 row
 * fed the window and renders as not measured, never as zero.
 */
/** An unimported window is a different fact from a metric missing in an imported one. */
function ga4ComparisonLabel(
  comparison: PerformanceWindow,
  value: number | null | undefined,
  compareLabel: string,
) {
  if (comparison.evidence_state === 'not_run') return `${compareLabel} — not imported`;
  if (value === null || value === undefined)
    return (
      <>
        {compareLabel}: <Absence state="not_measured" />
      </>
    );
  return `${compareLabel}: ${formatCount(value)}`;
}

export function Ga4SummaryRow({
  selected,
  comparison,
  compareLabel,
  loading = false,
}: Readonly<{
  selected: PerformanceWindow;
  comparison: PerformanceWindow | null;
  compareLabel: string;
  loading?: boolean;
}>) {
  return (
    <div data-testid="ga4-summary" className="min-w-0">
      <FigureStrip
        segments={GA4_SUMMARY_ENTRIES.map((entry) => {
          const value = selected.totals[entry.key];
          const comparisonValue = comparison ? comparison.totals[entry.key] : undefined;
          return {
            key: entry.key,
            label: entry.label,
            value: value === null || value === undefined ? null : formatCount(value),
            missingLabel: NOT_MEASURED,
            loading,
            sub: comparison ? (
              <span className="tabular-nums">
                {ga4ComparisonLabel(comparison, comparisonValue, compareLabel)}
              </span>
            ) : undefined,
          };
        })}
      />
    </div>
  );
}
