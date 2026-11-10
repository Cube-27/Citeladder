import type { ReactNode } from 'react';

import { Inline } from '@/components/ui/layout';
import { InlineFigure, textRole } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import type { SiteHealthDashboard } from '@citeladder/contracts';
import { formatScore } from '@/lib/format';

/** The crawl's headline scores, as the status line reads them. */
export type ScoreSummary = SiteHealthDashboard['score_summary'];

/**
 * The three headline scores as label + number entries of the status line's
 * description list (no rings: the Overview tab keeps the score cards). A score
 * with no value says which state it is in — limited evidence, excluded or not
 * measured — and never shows a fabricated zero.
 */
export function ScoreFigures({ summary }: Readonly<{ summary: ScoreSummary }>) {
  const coverage = summary?.aeo_measurement_coverage ?? null;
  return (
    <>
      <ScoreFigure
        label="Web Fundamentals"
        value={summary?.web_fundamentals_score ?? null}
        state={summary?.web_fundamentals_state}
      />
      <ScoreFigure
        label="AEO Readiness"
        value={summary?.aeo_readiness_score ?? null}
        state={summary?.aeo_measurement_state}
      />
      <ScoreFigure
        label="AEO Checklist Completion"
        value={coverage === null ? null : coverage * 100}
        unit="percent"
        state={summary?.aeo_measurement_state}
      />
    </>
  );
}

function ScoreFigure({
  label,
  value,
  unit = 'score',
  state,
}: Readonly<{ label: string; value: number | null; unit?: 'score' | 'percent'; state?: string }>) {
  return (
    <Inline className="type-body">
      <dt className="type-label">{label}</dt>
      <dd>
        {value === null ? (
          unavailable(state)
        ) : (
          <InlineFigure className={textRole('emphasis')}>
            {unit === 'percent' ? `${formatScore(value)}%` : formatScore(value)}
          </InlineFigure>
        )}
      </dd>
    </Inline>
  );
}

function unavailable(state?: string): ReactNode {
  if (state === 'limited_evidence') return <span className="type-caption">Limited evidence</span>;
  if (state === 'excluded') return <span className="type-caption">Excluded</span>;
  return <UnavailableValue state="not_measured" />;
}
