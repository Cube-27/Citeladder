import type { Visibility } from '@citeladder/contracts';
import { comparisonBasis } from '@citeladder/contracts/comparison-reason';
import { formatCount, pluralCount as plural } from '@/lib/format';

/**
 * The headline tiles' shortfall, "60 of 80 answers · 20 failed", only when
 * answers failed or were not run; a complete selection needs no line.
 */
export function answerShortfall(selected: Visibility): string | null {
  const counts = selected.counts;
  if (!counts || (!counts.failed && !counts.not_run)) return null;
  const answered =
    counts.expected === null
      ? plural(counts.responses, 'answer')
      : `${formatCount(counts.responses)} of ${plural(counts.expected, 'answer')}`;
  return [
    answered,
    counts.failed ? `${formatCount(counts.failed)} failed` : null,
    counts.not_run ? `${formatCount(counts.not_run)} not run` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "8 of 12 answers comparable" when the change covers only the shared answers; else null. */
export function subsetChangeNote(selected: Visibility): string | null {
  const comparison = selected.comparison;
  if (comparison?.status !== 'matched_subset') return null;
  const basis = comparisonBasis({
    status: comparison.status,
    answers: { matched: comparison.matched_cells, total: comparison.current_cells },
  });
  return basis.kind === 'matched_subset' ? basis.note : null;
}

/** The selection's one basis line: its shortfall and a subset change, or null when neither applies. */
export function selectionBasis(selected: Visibility): string | null {
  return (
    [answerShortfall(selected), subsetChangeNote(selected)].filter(Boolean).join(' · ') || null
  );
}
