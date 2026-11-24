import type { Visibility } from '@citeladder/contracts';
import { comparisonBasis } from '@citeladder/contracts/comparison-reason';

export function subsetChangeNote(selected: Visibility): string | null {
  const comparison = selected.comparison;
  if (comparison?.status !== 'matched_subset') return null;
  const basis = comparisonBasis({
    status: comparison.status,
    answers: { matched: comparison.matched_cells, total: comparison.current_cells },
  });
  return basis.kind === 'matched_subset' ? basis.note : null;
}
