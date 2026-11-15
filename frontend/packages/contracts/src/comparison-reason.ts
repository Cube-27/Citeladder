/**
 * Why a run shows no change against an earlier one, from the comparison status
 * finalization persisted: the one sentence every screen prints, or null for a
 * comparable run. Visibility shows a `matched_subset` change over the shared
 * answers; Overview declines it (docs/decisions.md, one comparable-baseline rule).
 */
const DECLINED: Readonly<Record<string, string>> = {
  changed_context: 'The earlier run used different settings.',
  matched_subset:
    'The earlier run used different settings; Visibility compares only the answers both runs share.',
  identity_unavailable: "This run's settings could not be identified, so it is not compared.",
  partial_coverage:
    'The latest or earlier run did not finish every answer, so shares would mislead.',
  coverage_unavailable:
    'The latest or earlier run has no expected-answer count, so its coverage cannot be checked.',
  no_observations: 'The latest or earlier run recorded no answers to compare.',
  invalid_baseline: 'The earlier run does not finish before the latest one starts.',
  baseline_pending: 'The comparison with an earlier run is still being prepared.',
};

export function comparisonDeclinedReason(status: string, skippedRuns = 0): string | null {
  if (status === 'comparable') return null;
  if (status === 'no_baseline')
    return skippedRuns
      ? `The ${skippedRuns === 1 ? 'earlier run' : `${skippedRuns} earlier runs`} used different settings or scoring.`
      : 'No earlier run to compare with yet.';
  return DECLINED[status] ?? 'The latest run cannot be compared with an earlier one.';
}
