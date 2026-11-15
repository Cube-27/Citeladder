import type { Visibility } from '@citeladder/contracts';
import { comparisonBasis, comparisonDeclinedReason } from '@citeladder/contracts/comparison-reason';
import { formatCount, pluralCount as plural } from '@/lib/format';

/**
 * What stands behind the headline tiles: how many answers they count, what
 * failed, and what the change line compares against. Every tile's denominator
 * and baseline are stated once here rather than guessed by the reader.
 */
export type CoverageSummary = { answers: string; change: string };

function answersLine(selected: Visibility): string {
  const counts = selected.counts;
  // Missing counts, no observations and observed failures are three different states.
  if (!counts) return 'Answer counts are unavailable for this selection.';
  if (counts.responses === 0) {
    const reasons = [
      counts.failed ? `${formatCount(counts.failed)} failed` : null,
      counts.not_run ? `${formatCount(counts.not_run)} not run` : null,
    ].filter(Boolean);
    return reasons.length
      ? `No answers were collected: ${reasons.join(', ')}.`
      : 'No answers were recorded for this selection.';
  }
  const engines = selected.per_engine.length;
  const base =
    counts.expected === null
      ? `Based on ${plural(counts.responses, 'answer')}`
      : `Based on ${formatCount(counts.responses)} of ${plural(counts.expected, 'expected answer')}`;
  const parts = [`${base} across ${plural(engines, 'engine')}`];
  if (counts.failed) parts.push(`${formatCount(counts.failed)} failed`);
  if (counts.not_run) parts.push(`${formatCount(counts.not_run)} not run`);
  return `${parts.join(', ')}.`;
}

type Comparison = NonNullable<Visibility['comparison']>;

function matchedLine(comparison: Comparison, since: string | null): string {
  const basis = comparisonBasis({
    status: comparison.status,
    answers: { matched: comparison.matched_cells, total: comparison.current_cells },
  });
  const note = basis.kind === 'matched_subset' ? basis.note : 'Only shared answers comparable';
  return `${note} with ${since ? `the run on ${since}` : 'the earlier run'}; the change uses only those.`;
}

function noChangeLine(status: string, skippedRuns = 0): string {
  const reason =
    comparisonDeclinedReason(status, skippedRuns) ?? comparisonDeclinedReason('no_baseline');
  return `No change shown. ${reason}`;
}

function changeLine(selected: Visibility, formatDate: (iso: string) => string): string {
  const comparison = selected.comparison;
  if (!comparison) return noChangeLine('no_baseline');
  const since = comparison.baseline_at ? formatDate(comparison.baseline_at) : null;
  if (comparison.status === 'matched_subset') return matchedLine(comparison, since);
  if (comparison.status !== 'comparable')
    return noChangeLine(comparison.status, comparison.skipped_runs);
  if (!since) return noChangeLine('no_baseline', comparison.skipped_runs);
  return selected.selection_mode === 'range'
    ? `Change compares this period with the previous one, from ${since}.`
    : `Change compares with the run on ${since}.`;
}

export function coverageSummary(
  selected: Visibility,
  formatDate: (iso: string) => string,
): CoverageSummary {
  return { answers: answersLine(selected), change: changeLine(selected, formatDate) };
}
