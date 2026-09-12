import { ScoreRing } from '@/components/ui/score-ring';
import { Label } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { hairlineBandClasses, hairlineBandItemClasses } from '@/components/ui/workspace';
import type { PageDetail } from '@/lib/api/types';

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
        value={detail.aeo_readiness_score}
        coverage={detail.aeo_measurement_coverage}
        state={detail.aeo_measurement_state}
        reason={detail.aeo_measurement_reason}
      />
      <ScoreTile
        label="AEO Checklist Completion"
        value={
          detail.aeo_measurement_coverage === null ? null : detail.aeo_measurement_coverage * 100
        }
        coverage={detail.aeo_measurement_coverage}
        state={detail.aeo_measurement_state}
        reason={detail.aeo_measurement_reason}
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
  const coverageLabel =
    coverage === null ? 'Completion unavailable' : `${Math.round(coverage * 100)}% complete`;
  return (
    <div className={`${hairlineBandItemClasses} flex min-h-20 items-center gap-3`}>
      {value === null ? (
        scoreUnavailableState(state)
      ) : (
        <ScoreRing value={value} size={56} label={`${label}: ${Math.round(value)}`} />
      )}
      <div className="grid min-w-0 gap-1">
        <Label>{label}</Label>
        <span className="text-muted text-xs">
          {coverageLabel} · {scoreCompletionLabel(state, reason)}
        </span>
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

function scoreCompletionLabel(state: string, reason?: string): string {
  if (state === 'measured') return 'Complete checklist';
  if (state === 'limited_evidence') return 'Partial audit';
  if (state === 'excluded') return 'Excluded';
  if (reason === 'unsupported_purpose_checklist') return 'Unsupported purpose checklist';
  return 'Completion unavailable';
}
