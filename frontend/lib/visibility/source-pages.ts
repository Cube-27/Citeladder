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

import type { pageEntitySchema } from '@citeladder/contracts/source-pages';
import type { visibilitySourceUrlSchema } from '@citeladder/contracts/visibility-evidence';
import { formatCount } from '@/lib/format';
import { sinceLabel } from '@/lib/visibility/sources';

/** The one sentence for "we could not read enough of this page to judge it". */
const COVERAGE_TOO_THIN = 'Too little of the page was readable to judge it.';

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

export function presenceLabel(state: string): string | null {
  return PRESENCE_LABELS[state] ?? null;
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

type PageSection = NonNullable<z.infer<typeof visibilitySourceUrlSchema>['page']>;

/**
 * Where the business stands on one cited page, the first thing its detail
 * view says.
 *
 * `gap` is the earned opportunity: the page was read, competitors are on it
 * and the business is not. A page that belongs to the business or to a
 * competitor can never list it, so it is named as such rather than judged.
 * A page nobody read says so instead of reading as an absence.
 */
export type PageStanding =
  | 'untracked'
  | 'yours'
  | 'competitor'
  | 'blocked'
  | 'unreadable'
  | 'not_read'
  | 'gap'
  | 'listed'
  | 'read';

export function pageStanding(page: PageSection | null): PageStanding {
  if (!page) return 'untracked';
  if (page.source_class === 'brand_owned') return 'yours';
  if (page.source_class === 'competitor_owned') return 'competitor';
  if (!page.read_at) {
    if (page.state === 'blocked') return 'blocked';
    return page.state === 'failed' ? 'unreadable' : 'not_read';
  }
  const brand = brandVerdict(page.entities);
  if (brand?.presence === 'present') return 'listed';
  return onPageCompetitors(page.entities).length && brand?.presence === 'not_detected'
    ? 'gap'
    : 'read';
}

const STANDING_SENTENCES: Record<PageStanding, string> = {
  untracked: 'This page has not been added to your source inventory yet.',
  yours: 'This is one of your own pages.',
  competitor: "This is a competitor's own page, so it cannot list you.",
  blocked: 'The publisher blocks automated access, so this page has not been read.',
  unreadable: 'The last attempt to read this page failed. It will be tried again.',
  not_read: 'This page has not been read yet. It is read after a visibility run.',
  gap: 'Competitors are listed on this page and you are not.',
  listed: 'You are on this page.',
  read: 'No tracked competitor is listed on this page.',
};

export function standingSentence(standing: PageStanding): string {
  return STANDING_SENTENCES[standing];
}

export type PageEntity = z.infer<typeof pageEntitySchema>;

/**
 * The rivals found ON a page, read from the presence verdicts so each one
 * carries the quoted line behind it.
 */
export function onPageCompetitors(entities: readonly PageEntity[] | undefined) {
  return (entities ?? []).filter(
    (entity) => entity.entity_kind !== 'brand' && entity.presence === 'present',
  );
}

/** The brand's own verdict on a page, when one was taken. */
export function brandVerdict(entities: readonly PageEntity[] | undefined): PageEntity | null {
  return (entities ?? []).find((entity) => entity.entity_kind === 'brand') ?? null;
}

/**
 * When a page was last read and how much of it was readable, or null when
 * nothing was read: printing "0 characters" would imply a reading that never
 * happened.
 */
export function readingSentence(
  readAt: string | null | undefined,
  extractedChars: number | null | undefined,
): string | null {
  if (!extractedChars) return null;
  const read = sinceLabel(readAt);
  const chars = `${formatCount(extractedChars)} characters were readable.`;
  return read ? `Read ${read.toLowerCase()}; ${chars}` : chars;
}
