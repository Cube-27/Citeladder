/**
 * Whether a run's change against its persisted baseline is shown, and why:
 * the one answer every screen prints. A `comparable` run changes against the
 * whole earlier run; a `matched_subset` run changes over the answers both runs
 * share, with a note saying how many; any other status shows no change, for
 * its reason (docs/decisions.md, one comparable-baseline rule).
 */
export type ComparisonBasis =
  | Readonly<{ kind: 'comparable' }>
  | Readonly<{ kind: 'matched_subset'; note: string }>
  | Readonly<{ kind: 'declined'; reason: string }>;

/** Answers both runs share, of the answers the current run scored. */
export type ComparedAnswers = Readonly<{ matched: number; total: number }>;

const DECLINED: Readonly<Record<string, string>> = {
  changed_context: 'The earlier run used different settings.',
  matched_subset: 'Only some answers match the earlier run, so this is not compared.',
  identity_unavailable: "This run's settings could not be identified, so it is not compared.",
  partial_coverage:
    'The latest or earlier run did not finish every answer, so shares would mislead.',
  coverage_unavailable:
    'The latest or earlier run has no expected-answer count, so its coverage cannot be checked.',
  no_observations: 'The latest or earlier run recorded no answers to compare.',
  invalid_baseline: 'The earlier run does not finish before the latest one starts.',
  baseline_pending: 'The comparison with an earlier run is still being prepared.',
};

/** Why no change is shown for a status, or null for a comparable run. */
export function comparisonDeclinedReason(status: string, skippedRuns = 0): string | null {
  if (status === 'comparable') return null;
  if (status === 'no_baseline')
    return skippedRuns
      ? `The ${skippedRuns === 1 ? 'earlier run' : `${skippedRuns} earlier runs`} used different settings or scoring.`
      : 'No earlier run to compare with yet.';
  return DECLINED[status] ?? 'The latest run cannot be compared with an earlier one.';
}

function answersNote(answers: ComparedAnswers | null): string {
  if (!answers) return 'Only the answers both runs share are comparable';
  return `${answers.matched} of ${answers.total} ${answers.total === 1 ? 'answer' : 'answers'} comparable`;
}

export function comparisonBasis({
  status,
  skippedRuns = 0,
  answers = null,
}: Readonly<{
  status: string;
  skippedRuns?: number;
  answers?: ComparedAnswers | null;
}>): ComparisonBasis {
  if (status === 'comparable') return { kind: 'comparable' };
  if (status === 'matched_subset') return { kind: 'matched_subset', note: answersNote(answers) };
  return {
    kind: 'declined',
    reason: comparisonDeclinedReason(status, skippedRuns) ?? DECLINED.baseline_pending!,
  };
}
