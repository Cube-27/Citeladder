import { Absence, printed } from '@/components/ui/absence';
import { Checkbox } from '@/components/ui/checkbox';
import { InfoHint } from '@/components/ui/info-hint';
import { textRole } from '@/components/ui/typography';
import { Spinner } from '@/components/ui/spinner';
import type { PerformanceWindow } from '@/lib/api/performance';
import { formatCount, formattedText } from '@/lib/format';
import {
  METRIC_CARDS,
  formatMetric,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';
import { FigureStrip } from '@/components/ui/figure-strip';

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
            <div className="flex min-w-0 items-center justify-between gap-2">
              <Checkbox
                label={label}
                checked={plotted}
                onCheckedChange={() => onToggle(card.key)}
                className="min-w-0"
              />
              <InfoHint label={`About ${label.toLowerCase()}`}>{METRIC_HELP[card.key]}</InfoHint>
            </div>
            <span className={textRole('figure', 'tabular-nums whitespace-nowrap')}>
              {loading ? (
                <Spinner label="Loading" />
              ) : (
                printed(formatMetric(card.key, selected.totals[card.key] ?? null))
              )}
            </span>
            {comparison ? (
              <span className={textRole('caption', 'truncate tabular-nums')}>
                {comparison.evidence_state === 'not_run'
                  ? `${compareLabel} (not imported)`
                  : `${compareLabel}: ${formattedText(formatMetric(card.key, comparison.totals[card.key] ?? null))}`}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
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
    <div data-testid="ga4-summary" className="min-w-0">
      <FigureStrip
        segments={GA4_SUMMARY_ENTRIES.map((entry) => {
          const value = selected.totals[entry.key];
          const comparisonValue = comparison ? comparison.totals[entry.key] : undefined;
          return {
            key: entry.key,
            label: entry.label,
            value: value === null || value === undefined ? null : formatCount(value),
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
