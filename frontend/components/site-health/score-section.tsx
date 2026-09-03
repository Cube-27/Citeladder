'use client';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';
import { hairlineBandClasses, hairlineBandItemClasses } from '@/components/ui/workspace';
import { ScoreRing } from '@/components/ui/score-ring';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import type { SiteCrawl, SiteHealthDashboard } from '@/lib/api/types';
import { formatScore } from '@/lib/site-health/status';
import { textRole } from '@/components/ui/typography';
import { Card, CardContent } from '@/components/ui/card';
import { Stack } from '@/components/ui/layout';

/**
 * Always-mounted score section of the canonical Site Health screen.
 *
 * The three scores (Web Fundamentals / AEO / coverage) share one hairline-divided
 * band rather than three cards, and render in every phase:
 * placeholders before any analysis has produced data, a live running mean
 * while analysis is in flight, and the final `score_summary` once it lands.
 * Scores appear IN PLACE — the section never unmounts, so finishing a crawl
 * updates them in place instead of jumping to a different screen. Missing scores
 * render `Not measured`, never a fabricated zero.
 */
export function ScoreSection({
  crawl,
  dashboard,
}: Readonly<{
  crawl: SiteCrawl | null;
  dashboard: SiteHealthDashboard | undefined;
}>) {
  const summary = dashboard?.score_summary ?? crawl?.score_summary ?? null;
  const technical = scoredValue(summary?.web_fundamentals_score);
  const aeo = scoredValue(summary?.aeo_readiness_score);
  const coverageValue =
    summary?.aeo_measurement_coverage === null || summary?.aeo_measurement_coverage === undefined
      ? null
      : summary.aeo_measurement_coverage * 100;
  const coverage = coverageValue;

  return (
    <Card data-testid="score-section">
      <CardContent>
        {/* One strip, not three cards: the scores are three readings of the
            same crawl, and hairlines say that better than three edges do. What
            changed is the ground under it — a white card rather than canvas. */}
        <div className={cn(hairlineBandClasses, 'border-y-0 sm:grid-cols-3')}>
          <ScoreCard
            label="Web Fundamentals"
            value={technical}
            state={summary?.web_fundamentals_state}
            sub={measurementSub(
              summary?.web_fundamentals_state,
              summary?.web_fundamentals_coverage,
            )}
          />
          <ScoreCard
            label="AEO Readiness"
            value={aeo}
            state={summary?.aeo_measurement_state}
            sub={measurementSub(summary?.aeo_measurement_state, summary?.aeo_measurement_coverage)}
          />
          <ScoreCard
            label="AEO Measurement Coverage"
            value={coverage}
            state={summary?.aeo_measurement_state}
            sub="Determinate evidence across applicable pillars"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function scoredValue(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value;
}

function measurementSub(state: string | undefined, coverage: number | null | undefined): string {
  const measured =
    coverage === null || coverage === undefined ? null : `${Math.round(coverage * 100)}% measured`;
  if (state === 'limited_evidence')
    return measured ? `${measured} · Limited confidence` : 'Limited confidence';
  if (state === 'not_measured' || !state) return 'Not measured';
  if (state === 'excluded') return 'Excluded from this audit';
  return measured ?? 'Measured';
}

function ScoreCard({
  label,
  value,
  state,
  sub,
}: Readonly<{ label: string; value: number | null; state: string | undefined; sub: string }>) {
  return (
    <div className={hairlineBandItemClasses}>
      {value === null ? (
        // No sub-line in the unmeasured state: "Not measured" already says
        // everything, and one cell carrying an extra line made the strip read
        // as three different heights.
        <Stack gap="tight" className="h-full content-center">
          <p className={eyebrowClasses}>{label}</p>
          {state === 'limited_evidence' || state === 'excluded' ? (
            <span className="value-placeholder">
              {state === 'limited_evidence' ? 'Limited evidence' : 'Excluded'}
            </span>
          ) : (
            <UnavailableValue state="not_measured" />
          )}
        </Stack>
      ) : (
        <div className="flex h-full items-center gap-4">
          <ScoreRing value={value} size={56} label={`${label} score: ${Math.round(value)}`} />
          <Stack gap="tight">
            <p className={eyebrowClasses}>{label}</p>
            <span className={textRole('metric', 'leading-none')}>{formatScore(value)} / 100</span>
            <span className={textRole('meta', 'leading-relaxed')}>{sub}</span>
          </Stack>
        </div>
      )}
    </div>
  );
}
