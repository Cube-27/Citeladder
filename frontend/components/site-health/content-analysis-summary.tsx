import type { ContentStructure } from '@citeladder/contracts/site-health';
import { Alert } from '@/components/ui/alert';

const reasonLabels: Record<string, string> = {
  funding_unavailable: 'Insufficient AI credits',
  permission_unavailable: 'Run permission unavailable',
  provider_unconfigured: 'Analysis provider not configured',
  deadline_exceeded: 'Analysis time limit reached',
  interrupted_dispatch: 'Interrupted provider requests',
};

export function ContentAnalysisSummary({ analysis }: Readonly<{ analysis: ContentStructure }>) {
  const summary = analysis.diagnostics;
  if (!summary) return null;
  return (
    <div className="space-y-3">
      <output className="type-caption">
        {summary.completed} of {summary.candidates} judgments completed · {summary.requests}{' '}
        requests · {Math.round(summary.elapsed_seconds)} seconds
      </output>
      {summary.pending ? (
        <p className="type-body">
          {summary.links_pending} link checks and {summary.topics_pending} topic checks remaining.
          You can review the suggestions already available.
        </p>
      ) : null}
      {Object.entries(summary.reasons).map(([reason, count]) => (
        <Alert key={reason} tone="warning">
          {reasonLabels[reason] ?? 'Provider judgments unavailable'}: {count}.
        </Alert>
      ))}
      <details>
        <summary className="type-caption cursor-pointer">Analysis details</summary>
        <p className="type-caption">
          {summary.link_candidates} link candidates · {summary.topic_candidates} topic
          classifications · {summary.below_threshold} below the review threshold ·{' '}
          {summary.no_anchor} without a suitable anchor · {summary.rejected_label} unusable topic
          labels · {summary.singleton_topics} topics with only one member · {summary.unavailable}{' '}
          unavailable judgments · {analysis.omitted_candidates} candidates outside this analysis
          budget
        </p>
        {summary.probability_bands.map((band) => (
          <p key={band.threshold} className="type-caption">
            Probability ≥ {Math.round(band.threshold * 100)}%: {band.links} link judgments,{' '}
            {band.topics} topic-fit judgments
          </p>
        ))}
      </details>
    </div>
  );
}
