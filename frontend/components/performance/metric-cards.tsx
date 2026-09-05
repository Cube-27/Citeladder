'use client';

import { Check } from 'lucide-react';

import { Pressable } from '@/components/ui/pressable';
import { panelClasses } from '@/components/ui/panel';
import { textRole } from '@/components/ui/typography';
import type { PerformanceWindow } from '@/lib/api/performance';
import {
  METRIC_CARDS,
  formatMetric,
  type PerformanceMetricKey,
} from '@/lib/performance/performance';
import { cn } from '@/lib/utils';

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

export function MetricCards({
  selected,
  comparison,
  compareLabel,
  selectedLabel,
  active,
  onToggle,
  colors,
}: Readonly<{
  selected: PerformanceWindow;
  comparison: PerformanceWindow | null;
  /** Describes the comparison period, e.g. "Previous period". */
  compareLabel: string;
  /** Describes the selected period, e.g. "Last 3 months". */
  selectedLabel: string;
  active: ReadonlySet<PerformanceMetricKey>;
  onToggle: (key: PerformanceMetricKey) => void;
  colors: Readonly<Record<PerformanceMetricKey, string>>;
}>) {
  return (
    <fieldset
      className={cn(
        // No outer border or radius: the strip sits INSIDE the chart card,
        // which already draws them. Only the seams between cards are ours,
        // and they are drawn per card below rather than with divide-*, whose
        // sibling-wide rules put a TOP border on cards 2-4 in the lg row and
        // a LEFT border on the first card of the sm second row.
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        'border-border-subtle border-b',
      )}
      data-testid="metric-card-strip"
    >
      <legend className="sr-only">Search Console metrics</legend>
      {METRIC_CARDS.map((card, index) => {
        const isActive = active.has(card.key);
        const value = selected.totals[card.key];
        const comparisonValue = comparison ? comparison.totals[card.key] : undefined;
        return (
          <Pressable
            key={card.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(card.key)}
            data-testid={`metric-card-${card.key}`}
            className={cn(
              panelClasses({ tone: 'panel', pad: 'compact', edge: 'flush' }),
              'grid gap-1 transition-opacity',
              seamClasses(index),
              // Unselected reads as dimmed, never as a different surface —
              // the colour stays so the card keeps naming its own series.
              isActive ? 'opacity-100' : 'opacity-65 hover:opacity-85',
            )}
            style={{
              backgroundColor: colors[card.key],
              color: 'var(--color-on-accent)',
            }}
          >
            <span
              className={cn(
                'flex items-center gap-2 text-xs',
                textRole('emphasis', 'text-inherit'),
              )}
            >
              {/* Decorative: the card itself is the control and carries
                  aria-pressed, so a second focusable checkbox here would
                  announce the same state twice. */}
              <span
                aria-hidden
                className={cn(
                  'inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border',
                  isActive ? 'border-current' : 'border-current/50',
                )}
              >
                {isActive ? <Check className="size-2.5" /> : null}
              </span>
              {card.label}
            </span>
            <span className="mono text-2xl leading-tight">{formatMetric(card.key, value)}</span>
            {/* The period labels earn their place only when TWO values are
                stacked: with one number the range is already stated once, in
                the toolbar, and repeating it four times is noise. */}
            {comparison ? <span className="text-xs opacity-80">{selectedLabel}</span> : null}
            {comparison ? (
              <>
                <span className="mono text-lg leading-tight">
                  {formatMetric(card.key, comparisonValue ?? null)}
                </span>
                <span className="text-xs opacity-80">
                  {comparison.evidence_state === 'not_run'
                    ? `${compareLabel} — not imported`
                    : compareLabel}
                </span>
              </>
            ) : null}
          </Pressable>
        );
      })}
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
}: Readonly<{
  selected: PerformanceWindow;
  comparison: PerformanceWindow | null;
  compareLabel: string;
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
            <dd className="mono text-sm">
              {value === null ? 'Not measured' : value.toLocaleString()}
            </dd>
            {comparison ? (
              <dd className="text-muted mono text-xs">
                {comparisonValue === null || comparisonValue === undefined
                  ? `${compareLabel}: not measured`
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
