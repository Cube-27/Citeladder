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
import type { z } from 'zod';
import type { sourcePageEntitySchema } from '@/lib/api/schemas/source-pages';

export type SourcePageEntity = z.infer<typeof sourcePageEntitySchema>;

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
  partial: 'Too little of the page was readable',
  not_inspected: 'Not inspected',
  blocked: 'Publisher blocks automated access',
  stale: 'From an earlier inspection',
};

const MATCH_METHOD_LABELS: Record<string, string> = {
  exact_alias: 'exact name match',
  normalized_alias: 'normalized name match',
  none: 'no name match',
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
 * How an absence was established, for a claim no passage can support.
 *
 * Returns `null` when the page was not read at all: there is no method to
 * report, and printing one would imply a search that never happened.
 */
export function absenceBasis(
  state: string,
  matchMethod: string | null,
  extractedChars: number,
): string | null {
  if (state !== 'not_detected' && state !== 'ambiguous' && state !== 'partial') return null;
  const method = matchMethod ? (MATCH_METHOD_LABELS[matchMethod] ?? null) : null;
  const read = extractedChars > 0 ? `${extractedChars.toLocaleString()} characters read` : null;
  const parts = [method, read].filter((part): part is string => Boolean(part));
  return parts.length ? `Searched by ${parts.join(', ')}.` : null;
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

/** "4 of 12 inspected" — coverage stated wherever a finding is stated. */
export function coverageLabel(inspected: number, total: number): string {
  return `${inspected} of ${total} inspected`;
}
