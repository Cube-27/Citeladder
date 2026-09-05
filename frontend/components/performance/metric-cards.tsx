'use client';

import { Check, HelpCircle } from 'lucide-react';

import { MetricValue } from '@/components/ui/metric-value';
import { Pressable } from '@/components/ui/pressable';
import { panelClasses } from '@/components/ui/panel';
import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import type { PerformanceWindow } from '@/lib/api/performance';
import { availabilityLabel } from '@/lib/format';
import {
  METRIC_CARDS,
  formatMetric,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';
import { cn } from '@/lib/utils';

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
 * The four render as ONE connected strip rather than four detached cards:
 * they are a single control group over one window, and gaps between them
 * read as unrelated panels. Each card is always filled with its metric's
 * colour — that colour IS the series identity on the chart — so the text is
 * always on-accent. Selection is carried by the check and a dimmed fill, not
 * by whether the card is coloured at all.
 */
/**
 * The internal seams of the four-card strip, by POSITION.
 *
 * Not `divide-*`: those rules are sibling-wide, so they draw a top border on
 * cards 2-4 once the strip is one `lg` row, and a left border on the first
 * card of the `sm` second row. The strip's OUTER edges belong to the chart
 * card that contains it, so only the seams between cards are drawn here.
 */
function seamClasses(index: number): string {
  return cn(
    'border-border-subtle',
    // One column: every card after the first sits below its predecessor.
    index > 0 && 'border-t',
    // Two columns: the left seam applies to the odd cards, the top seam only
    // to the second row.
    index % 2 === 0 ? 'sm:border-l-0' : 'sm:border-l',
    index >= 2 ? 'sm:border-t' : 'sm:border-t-0',
    // Four columns: one row, so every seam is a left edge except the first.
    index === 0 ? 'lg:border-l-0' : 'lg:border-l',
    'lg:border-t-0',
  );
}

const METRIC_HELP: Record<PerformanceMetricKey, string> = {
  clicks: 'Total clicks from Google Search results',
  impressions: 'Total impressions in Google Search results',
  ctr: 'Average click-through rate (Clicks / Impressions)',
  position: 'Average ranking position in Google Search results',
};

/**
 * The comparison half of a card: the comparison window's own absolute value,
 * under a label that names THAT window.
 *
 * The label LEADS its value here rather than trailing it. The rule above this
 * block detaches it from the selected value higher up, so a label sitting at
 * the top of the block reads as this block's caption — which makes naming the
 * selected period there a mislabel of the comparison figure.
 */
function MetricCardComparison({
  metricKey,
  comparison,
  comparisonValue,
  isActive,
  compareLabel,
  loading,
}: Readonly<{
  metricKey: PerformanceMetricKey;
  comparison: PerformanceWindow;
  comparisonValue: number | null | undefined;
  isActive: boolean;
  compareLabel: string;
  loading: boolean;
}>) {
  const statusLabel =
    comparison.evidence_state === 'not_run' ? `${compareLabel} — not imported` : compareLabel;
  return (
    <div className="grid gap-0.5 border-t border-current/20 pt-1">
      <span className={textRole('meta', isActive ? 'text-inverse/80' : undefined)}>
        {statusLabel}
      </span>
      <MetricValue
        size="metricSm"
        value={measured(metricKey, comparisonValue)}
        label={NOT_MEASURED}
        loading={loading}
        tone={isActive ? 'text-inverse' : undefined}
      />
    </div>
  );
}

function MetricCard({
  card,
  index,
  isActive,
  value,
  comparisonValue,
  comparison,
  selectedLabel,
  compareLabel,
  color,
  loading,
  onToggle,
}: Readonly<{
  card: (typeof METRIC_CARDS)[number];
  index: number;
  isActive: boolean;
  value: number | null;
  comparisonValue: number | null | undefined;
  comparison: PerformanceWindow | null;
  selectedLabel: string;
  compareLabel: string;
  color: string;
  loading: boolean;
  onToggle: (key: PerformanceMetricKey) => void;
}>) {
  return (
    <Pressable
      type="button"
      aria-pressed={isActive}
      onClick={() => onToggle(card.key)}
      data-testid={`metric-card-${card.key}`}
      className={cn(
        panelClasses({ tone: 'panel', pad: 'compact', edge: 'flush' }),
        'relative flex min-h-[96px] flex-col justify-between gap-1 p-3.5 text-left transition-colors',
        index === 0 && 'rounded-tl-[var(--radius-card)]',
        seamClasses(index),
        isActive ? 'text-inverse' : 'bg-panel hover:bg-panel-hover text-foreground',
      )}
      style={
        isActive
          ? {
              backgroundColor: color,
              color: 'var(--color-inverse)',
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors',
            isActive
              ? 'border-inverse bg-inverse/20 text-inverse'
              : 'border-border-strong bg-panel text-transparent',
          )}
        >
          {isActive ? <Check className="text-inverse size-3 stroke-[2.5]" /> : null}
        </span>
        <span
          className={cn('select-none', textRole('label', isActive ? 'text-inverse' : undefined))}
        >
          {card.label}
        </span>
      </div>

      {/* The period labels earn their place only when TWO values stack: with
          one number the range is already stated once in the toolbar, and
          repeating it on four cards is noise. */}
      <div className="grid gap-0.5">
        {comparison ? (
          <span className={textRole('meta', isActive ? 'text-inverse/80' : undefined)}>
            {selectedLabel}
          </span>
        ) : null}
        <MetricValue
          value={measured(card.key, value)}
          label={NOT_MEASURED}
          loading={loading}
          tone={isActive ? 'text-inverse' : undefined}
        />
      </div>

      {comparison ? (
        <MetricCardComparison
          metricKey={card.key}
          comparison={comparison}
          comparisonValue={comparisonValue}
          isActive={isActive}
          compareLabel={compareLabel}
          loading={loading}
        />
      ) : null}

      <div className="mt-auto flex justify-end pt-1">
        <Tooltip content={METRIC_HELP[card.key]}>
          <span
            className={cn(
              'inline-flex size-4 shrink-0 items-center justify-center rounded-full text-xs transition-opacity',
              isActive ? 'text-inverse/70 hover:text-inverse' : 'text-muted hover:text-foreground',
            )}
            aria-label={METRIC_HELP[card.key]}
          >
            <HelpCircle className="size-3.5" aria-hidden />
          </span>
        </Tooltip>
      </div>
    </Pressable>
  );
}

export function MetricCards({
  selected,
  comparison,
  selectedLabel,
  compareLabel,
  active,
  onToggle,
  colors,
  loading = false,
  className,
}: Readonly<{
  selected: PerformanceWindow;
  comparison: PerformanceWindow | null;
  selectedLabel: string;
  compareLabel: string;
  active: ReadonlySet<PerformanceMetricKey>;
  onToggle: (key: PerformanceMetricKey) => void;
  colors: Record<PerformanceMetricKey, string>;
  /** A read is in flight. The cards spin rather than claiming a value is absent. */
  loading?: boolean;
  className?: string;
}>) {
  return (
    <fieldset
      className={cn(
        // The strip sits inside the chart card. Only internal seams are drawn
        // between cards; outer borders are managed by the container.
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
      data-testid="metric-card-strip"
    >
      <legend className="sr-only">Search Console metrics</legend>
      {METRIC_CARDS.map((card, index) => (
        <MetricCard
          key={card.key}
          card={card}
          index={index}
          isActive={active.has(card.key)}
          value={selected.totals[card.key]}
          comparisonValue={comparison ? comparison.totals[card.key] : undefined}
          comparison={comparison}
          selectedLabel={selectedLabel}
          compareLabel={compareLabel}
          color={colors[card.key]}
          loading={loading}
          onToggle={onToggle}
        />
      ))}
    </fieldset>
  );
}

/**
 * Sessions and Conversions for the selected range: one compact,
 * non-interactive row beneath the GSC cards.
 *
 * GA4 measures a different population than Search Console, so they never join
 * the chart or the metric selection — mixing them into one plot would imply a
 * comparability that does not exist. A null value means no included GA4 row
 * fed the window and renders as not measured, never as zero.
 */
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
  const entries = [
    { key: 'sessions' as const, label: 'Sessions' },
    { key: 'conversions' as const, label: 'Conversions' },
  ];
  return (
    <dl
      className="border-border-subtle bg-panel flex flex-wrap gap-x-8 gap-y-2 rounded-[var(--radius-control)] border px-3 py-2"
      data-testid="ga4-summary"
    >
      {entries.map((entry) => {
        const value = selected.totals[entry.key];
        const comparisonValue = comparison ? comparison.totals[entry.key] : undefined;
        return (
          <div key={entry.key} className="flex items-baseline gap-2">
            <dt className="text-muted text-xs">{entry.label}</dt>
            <dd>
              <MetricValue
                size="metricSm"
                value={value === null ? null : value.toLocaleString()}
                label={NOT_MEASURED}
                loading={loading}
              />
            </dd>
            {comparison ? (
              <dd className="text-muted mono text-xs">
                {comparisonValue === null || comparisonValue === undefined
                  ? `${compareLabel}: ${NOT_MEASURED.toLowerCase()}`
                  : `${compareLabel}: ${comparisonValue.toLocaleString()}`}
              </dd>
            ) : null}
          </div>
        );
      })}
      <p className="text-muted text-xs">Google Analytics 4</p>
    </dl>
  );
}
