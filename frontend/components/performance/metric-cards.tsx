import { Absence, printed } from '@/components/ui/absence';
import { Checkbox } from '@/components/ui/checkbox';
import { InfoHint } from '@/components/ui/info-hint';
import { Text } from '@/components/ui/typography';
import { Spinner } from '@/components/ui/spinner';
import type { PerformanceWindow } from '@/lib/api/performance';
import { formatCount, formattedText } from '@/lib/format';
import {
  METRIC_CARDS,
  formatMetric,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';
import { FigureStrip } from '@/components/ui/figure-strip';
import { SectionBleed } from '@/components/ui/section';
import './metric-tiles.css';
import { Inline } from '@/components/ui/layout';

const METRIC_HELP: Record<PerformanceMetricKey, string> = {
  clicks: 'Total clicks from Google Search results',
  impressions: 'Total impressions in Google Search results',
  ctr: 'Average click-through rate (Clicks / Impressions)',
  position: 'Average ranking position in Google Search results',
};

const TILE_LABEL: Record<PerformanceMetricKey, string> = {
  clicks: 'Total clicks',
  impressions: 'Total impressions',
  ctr: 'Average CTR',
  position: 'Average position',
};

export function MetricCards({
  selected,
  comparison,
  compareLabel,
  active,
  onToggle,
  loading = false,
  'data-testid': testId,
}: Readonly<{
  selected: PerformanceWindow;
  comparison: PerformanceWindow | null;
  compareLabel: string;
  active: ReadonlySet<PerformanceMetricKey>;
  onToggle: (key: PerformanceMetricKey) => void;
  loading?: boolean;
  'data-testid'?: string;
}>) {
  return (
    <SectionBleed>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="group"
        aria-label="Search Console metrics"
        data-testid={testId}
        className="metric-tiles"
      >
        {METRIC_CARDS.map((card) => {
          const plotted = active.has(card.key);
          const label = TILE_LABEL[card.key];
          return (
            <div
              key={card.key}
              data-metric={card.key}
              data-on={plotted || undefined}
              className="metric-tile"
            >
              <Inline justify="between">
                <Checkbox
                  label={label}
                  checked={plotted}
                  onCheckedChange={() => onToggle(card.key)}
                  className="min-w-0"
                />
                <span data-metric-help="">
                  <InfoHint label={`About ${label.toLowerCase()}`}>
                    {METRIC_HELP[card.key]}
                  </InfoHint>
                </span>
              </Inline>
              <Text variant="figure" numeric wrap="nowrap">
                {loading ? (
                  <Spinner label="Loading" />
                ) : (
                  printed(formatMetric(card.key, selected.totals[card.key] ?? null))
                )}
              </Text>
              {comparison ? (
                <Text variant="caption" wrap="truncate" numeric>
                  {comparison.evidence_state === 'not_run'
                    ? `${compareLabel} (not imported)`
                    : `${compareLabel}: ${formattedText(formatMetric(card.key, comparison.totals[card.key] ?? null))}`}
                </Text>
              ) : null}
            </div>
          );
        })}
      </div>
    </SectionBleed>
  );
}

const GA4_SUMMARY_ENTRIES = [
  { key: 'sessions' as const, label: 'Sessions' },
  { key: 'key_events' as const, label: 'Key events' },
];

function ga4ComparisonLabel(
  comparison: PerformanceWindow,
  value: number | null | undefined,
  compareLabel: string,
) {
  if (comparison.evidence_state === 'not_run') return `${compareLabel} (not imported)`;
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
    <FigureStrip
      testId="ga4-summary"
      segments={GA4_SUMMARY_ENTRIES.map((entry) => {
        const value = selected.totals[entry.key];
        const comparisonValue = comparison ? comparison.totals[entry.key] : undefined;
        return {
          key: entry.key,
          label: entry.label,
          value: value === null || value === undefined ? null : formatCount(value),
          loading,
          sub: comparison ? (
            <Text variant="caption" numeric>
              {ga4ComparisonLabel(comparison, comparisonValue, compareLabel)}
            </Text>
          ) : undefined,
        };
      })}
    />
  );
}
