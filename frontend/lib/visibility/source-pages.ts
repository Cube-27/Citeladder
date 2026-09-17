/**
 * Reader-side vocabulary for externally cited pages.
 *
 * The backend publishes tokens (`not_inspected`, `exact_alias`, `listicle`).
 * This is the one place they become something a customer reads, on the same
 * terms as `lib/visibility/vocabulary.ts`: an unmapped token renders as
 * nothing rather than leaking raw, and copy states what was observed rather
 * than how it was computed.
 *
 * The distinction these labels exist to protect: "we looked and did not find
 * you" and "nobody has looked" are different sentences. Rendering both as
 * "not present" is the defect the whole inspection feature was built to
 * remove, and it would re-enter here if one label covered both.
 */
import { formatCount } from '@/lib/format';

/**
 * The one sentence for "we could not read enough of this page to judge it".
 *
 * Shared because three surfaces state the same fact — a presence verdict, an
 * unmet qualification and a placement that could not be compared — and three
 * copies drift into three slightly different claims about one thing.
 */
export const COVERAGE_TOO_THIN = 'Too little of the page was readable to judge it.';

/** Page-level states: properties of the PAGE, never of an entity on it. */
const PAGE_STATE_LABELS: Record<string, string> = {
  not_inspected: 'Not inspected',
  queued: 'Queued for inspection',
  inspected: 'Inspected',
  blocked: 'Publisher blocks automated access',
  failed: 'Could not be read',
  stale: 'Inspected a while ago',
};

/**
 * What a verdict means for the brand or a competitor.
 *
 * `not_inspected`, `blocked` and `stale` appear here too because the backend
 * resolver hands them back in the same field: a verdict from a page that was
 * never read, or read too long ago, is reported as the page's state rather
 * than as a finding.
 */
const PRESENCE_LABELS: Record<string, string> = {
  present: 'On the page',
  not_detected: 'Not found on the page',
  ambiguous: 'Match could not be confirmed',
  partial: COVERAGE_TOO_THIN,
  not_inspected: 'Not inspected',
  blocked: 'Publisher blocks automated access',
  stale: 'From an earlier inspection',
};

/**
 * How a name was looked for. `none` is deliberately absent: it means nothing
 * matched, which the sentence below says outright rather than printing
 * "searched by no name match".
 */
const MATCH_METHOD_LABELS: Record<string, string> = {
  exact_alias: 'the exact name',
  normalized_alias: 'a normalized form of the name',
};

const PAGE_FORMAT_LABELS: Record<string, string> = {
  comparison: 'Comparison',
  listicle: 'Listicle',
  review: 'Review',
  directory: 'Directory',
  discussion: 'Discussion',
  reference: 'Reference',
  article: 'Article',
  video: 'Video',
  unresolved: 'Format unresolved',
};

export function pageStateLabel(state: string): string | null {
  return PAGE_STATE_LABELS[state] ?? null;
}

export function presenceLabel(state: string): string | null {
  return PRESENCE_LABELS[state] ?? null;
}

export function pageFormatLabel(format: string): string | null {
  return PAGE_FORMAT_LABELS[format] ?? null;
}

/**
 * Why a verdict could not be shown with a passage, and on what basis.
 *
 * Returns `null` when the page was not read at all: there is no method to
 * report, and printing one would imply a search that never happened.
 *
 * The fallback, when the matching method is unknown, is NOT shared across the
 * three states. "No form of the name matched" is true of a non-detection and
 * false of the other two: `ambiguous` means a match WAS found and could not be
 * quoted, and `partial` means too little of the page was read to judge. One
 * fallback sentence for all three told two of them a flat untruth.
 */
const UNKNOWN_METHOD_BASIS: Record<string, string> = {
  not_detected: 'no form of the name matched',
  ambiguous: 'a match was found that could not be quoted',
  partial: 'not enough of it to settle this',
};

export function absenceBasis(
  state: string,
  matchMethod: string | null,
  extractedChars: number,
): string | null {
  const fallback = UNKNOWN_METHOD_BASIS[state];
  if (!fallback) return null;
  if (extractedChars <= 0) return null;
  const read = `${formatCount(extractedChars)} characters of readable text`;
  const method = matchMethod ? MATCH_METHOD_LABELS[matchMethod] : undefined;
  return method ? `Searched ${read} for ${method}.` : `Searched ${read}; ${fallback}.`;
}

/**
 * The sentence for how often a page turned up in answers.
 *
 * Distinct answers, not `recurrence_count` — that value schedules inspections
 * and is never a measurement.
 */
export function citedByLabel(answers: number): string {
  if (answers <= 0) return 'Not cited in analyzed answers';
  return `Cited by ${answers} ${answers === 1 ? 'answer' : 'answers'}`;
}
