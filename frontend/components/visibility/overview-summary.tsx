'use client';

import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Visibility } from '@/lib/api/types';

/** Rounds a 0–100 rate for display; `null` stays null (never coerced to 0). */
function pct(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value);
}

/**
 * One inline metric in the right-hand rail: "Visibility 62% ↗".
 *
 * The arrow is rendered ONLY when a real delta exists. `direction` never
 * carries meaning alone — the signed delta is always written next to it
 * (WCAG 1.4.1), and the arrow itself is aria-hidden.
 */
function InlineMetric({
  label,
  value,
  delta,
}: Readonly<{ label: string; value: string; delta?: number | null }>) {
  const up = delta !== null && delta !== undefined && delta > 0;
  const down = delta !== null && delta !== undefined && delta < 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-muted text-2xs">{label}</span>
      <span className="mono text-foreground text-xs font-medium">{value}</span>
      {up || down ? (
        <span className={cn('mono text-2xs', up ? 'text-success' : 'text-danger')}>
          <Arrow className="inline size-3 align-[-1px]" aria-hidden strokeWidth={2} />
          {`${delta! > 0 ? '+' : ''}${delta!.toFixed(1)}`}
        </span>
      ) : null}
    </span>
  );
}

/**
 * OverviewSummary — the sentence + inline metrics under the filter chips.
 *
 * Every figure is derived from the selected-run projection; nothing here is
 * hardcoded. Where the MVP projection genuinely has no value the metric is
 * omitted rather than invented:
 *   - there is no cross-run delta in the selected-run projection, so the
 *     "up N points this month" clause and the metric arrows appear only when
 *     the caller can supply a real `visibilityDelta`;
 *   - `sentiment` is not computed at MVP (always null), so the sentiment
 *     metric renders only once the backend fills it in.
 */
export function OverviewSummary({
  visibility,
  brandName,
  visibilityDelta = null,
  className,
}: Readonly<{
  visibility: Visibility;
  brandName: string;
  /**
   * Signed month-over-month change in visibility points, when a trend is
   * available. Omitted/null renders the sentence without the change clause.
   */
  visibilityDelta?: number | null;
  className?: string;
}>) {
  const score = pct(visibility.visibility_score);
  const brandRow = visibility.rankings.find((row) => row.is_brand) ?? null;
  const position = visibility.avg_position;
  const rank = brandRow
    ? visibility.rankings
        .slice()
        .sort((a, b) => (b.share_of_voice ?? 0) - (a.share_of_voice ?? 0))
        .findIndex((row) => row.is_brand) + 1
    : null;

  const rose = visibilityDelta !== null && visibilityDelta > 0;

  return (
    <div
      data-testid="overview-summary"
      className={cn('flex flex-wrap items-baseline gap-x-4 gap-y-2', className)}
    >
      <p className="text-muted min-w-0 flex-1 text-sm">
        {score === null ? (
          <>Visibility for {brandName} is not available for this run.</>
        ) : (
          <>
            {brandName} is mentioned in <b className="text-foreground font-medium">{score}%</b> of
            answers
            {visibilityDelta !== null ? (
              <>
                , {rose ? 'up' : 'down'}{' '}
                <b className="text-foreground font-medium">
                  {Math.abs(visibilityDelta).toFixed(1)}
                </b>{' '}
                points this month
              </>
            ) : null}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {score !== null ? (
          <InlineMetric label="Visibility" value={`${score}%`} delta={visibilityDelta} />
        ) : null}
        {/* Sentiment is not computed at MVP — shown only once it is real. */}
        {visibility.sentiment ? (
          <InlineMetric label="Sentiment" value={visibility.sentiment} />
        ) : null}
        {position !== null ? <InlineMetric label="Position" value={position.toFixed(1)} /> : null}
        {rank !== null ? <InlineMetric label="Rank" value={`#${rank}`} /> : null}
      </div>
    </div>
  );
}
