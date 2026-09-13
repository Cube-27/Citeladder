import { ScoreRing } from '@/components/ui/score-ring';
import { Label } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { hairlineBandClasses, hairlineBandItemClasses } from '@/components/ui/workspace';
import type { PageDetail } from '@/lib/api/types';
import { measurementCaveat } from '@/lib/site-health/status';

export function UrlScoreSummary({ detail }: Readonly<{ detail: PageDetail }>) {
  return (
    <div className={`${hairlineBandClasses} sm:grid-cols-3`}>
      <ScoreTile
        label="Web Fundamentals"
        value={detail.web_fundamentals_score}
        coverage={detail.web_fundamentals_coverage}
        state={detail.web_fundamentals_state}
      />
      <ScoreTile
        label="AEO Readiness"
        reason={detail.aeo_measurement_reason}
        value={detail.aeo_readiness_score}
        coverage={detail.aeo_measurement_coverage}
        state={detail.aeo_measurement_state}
      />
      <ScoreTile
        label="AEO Checklist Completion"
        reason={detail.aeo_measurement_reason}
        value={
          detail.aeo_measurement_coverage === null ? null : detail.aeo_measurement_coverage * 100
        }
        coverage={detail.aeo_measurement_coverage}
        state={detail.aeo_measurement_state}
      />
    </div>
  );
}

function ScoreTile({
  label,
  value,
  coverage,
  state,
  reason,
}: Readonly<{
  label: string;
  value: number | null;
  coverage: number | null;
  state: string;
  reason?: string;
}>) {
  // The fourth surface that carried "100% complete · Complete checklist" under
  // a score. Same rule as the others now: a complete measurement says nothing,
  // and only a qualified one gets a line.
  const caveat = measurementCaveat(state, coverage, reason);
  return (
    <div className={`${hairlineBandItemClasses} flex min-h-20 items-center gap-3`}>
      {value === null ? (
        scoreUnavailableState(state)
      ) : (
        <ScoreRing value={value} size={56} label={`${label}: ${Math.round(value)}`} />
      )}
      <div className="grid min-w-0 gap-1">
        <Label>{label}</Label>
        {caveat ? <span className="text-muted text-xs">{caveat}</span> : null}
      </div>
    </div>
  );
}

function scoreUnavailableState(state: string) {
  if (state === 'limited_evidence') {
    return <span className="text-muted text-xs">Limited evidence</span>;
  }
  if (state === 'excluded') {
    return <span className="text-muted text-xs">Excluded</span>;
  }
  return <UnavailableValue state="not_measured" />;
}
