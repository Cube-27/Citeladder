import type { Visibility } from '@citeladder/contracts';
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
