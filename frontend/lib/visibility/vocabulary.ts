/**
 * The one place a backend token becomes something a customer reads.
 *
 * Every visibility surface used to print its own enums: `comparison.status`
 * reached the page through `replaceAll('_', ' ')` and rendered as "no baseline",
 * source rows printed `third_party` and `source-taxonomy-2`, and prompt rows
 * printed their score fields by name. That is the model's vocabulary, not the
 * reader's, and no amount of layout work fixes it.
 *
 * Rules for anything added here:
 *   - An unmapped token renders as NOTHING, never as the raw token. A missing
 *     translation is a gap in this file, not something to leak to the customer.
 *   - Copy states what the reader observes, never how it was computed. The
 *     denominator ("3 of 10 answers") is the reader's; the numerator's SQL is
 *     not.
 *   - Where NOTHING in a selection is comparable, the change column is not
 *     rendered at all; where one row among many lacks a change, it uses the
 *     shared availability vocabulary. Never a placeholder sentence per cell.
 */

/**
 * A change in percentage points, or `null` when there is none to show.
 *
 * Returning `null` rather than a sentence is the point: the old
 * "No comparable change" string was rendered inside numeric table cells, where
 * it wrapped across three lines and buried the numbers it sat beside. Callers
 * decide how absence reads — usually by not drawing the column.
 */
export function changeLabel(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  // Decide the sign from the value the reader will SEE. Signing the raw number
  // rendered a movement of +0.04pp as "+0.0 pp", which claims a direction the
  // displayed figure does not support.
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} pp`;
}

/**
 * What the reader is told when a measurement produced no observations at all —
 * distinct from an observed zero, which stays `0%` (design.md, availability
 * vocabulary).
 */
export function observationLabel(state: string | null | undefined): string | null {
  return state === 'no_observations' ? 'Not measured' : null;
}

/**
 * Domain types, in the order a reader should reason about a source mix.
 *
 * These ARE the backend's nine source classes — this file only gives them the
 * short chip copy the Sources tables need, where `sourceClassLabel` gives the
 * sentence-shaped copy the Opportunities drawer needs. Deliberately not a
 * second taxonomy: one token per type means one filter value per type, and a
 * display grouping that folded three classes into one chip could not be sent
 * back to the endpoint as a filter at all.
 *
 * `brand_owned` reads as "You" rather than "Corporate". Whether a cited page is
 * the reader's own is the single most useful distinction on the screen, and
 * folding it into a generic class is the one edit that would cost the table
 * its point.
 */
export const DOMAIN_TYPES: readonly { token: string; label: string }[] = [
  { token: 'brand_owned', label: 'You' },
  { token: 'competitor_owned', label: 'Competitor' },
  { token: 'review_marketplace', label: 'Corporate' },
  { token: 'editorial_third_party', label: 'Editorial' },
  { token: 'institutional', label: 'Institutional' },
  { token: 'community', label: 'UGC' },
  { token: 'social', label: 'Social' },
  { token: 'video', label: 'Video' },
  { token: 'other_third_party', label: 'Other' },
] as const;

const DOMAIN_TYPE_LABELS = new Map(DOMAIN_TYPES.map((type) => [type.token, type.label]));

/** The chip copy for one domain type; an unknown token renders as nothing. */
export function domainTypeLabel(token: string | null | undefined): string | null {
  return (token && DOMAIN_TYPE_LABELS.get(token)) || null;
}

/**
 * URL types — what KIND of page this one is, as distinct from who publishes it.
 *
 * Ordered by how a reader scans a mix: the shapes that earn a placement first,
 * then the ones that merely carry a brand. `unresolved` is last and reads as
 * "Other", because it is a real outcome — the page's kind is not evident — and
 * never a claim that the page is uninteresting.
 */
export const URL_TYPES: readonly { token: string; label: string }[] = [
  { token: 'comparison', label: 'Comparison' },
  { token: 'alternative', label: 'Alternative' },
  { token: 'listicle', label: 'Listicle' },
  { token: 'review', label: 'Review' },
  { token: 'how_to', label: 'How-To Guide' },
  { token: 'article', label: 'Article' },
  { token: 'discussion', label: 'Discussion' },
  { token: 'profile', label: 'Profile' },
  { token: 'directory', label: 'Directory' },
  { token: 'product', label: 'Product Page' },
  { token: 'category', label: 'Category Page' },
  { token: 'homepage', label: 'Homepage' },
  { token: 'reference', label: 'Reference' },
  { token: 'video', label: 'Video' },
  { token: 'unresolved', label: 'Other' },
] as const;

const URL_TYPE_LABELS = new Map(URL_TYPES.map((type) => [type.token, type.label]));

/** The chip copy for one URL type; an unknown token renders as nothing. */
export function urlTypeLabel(token: string | null | undefined): string | null {
  return (token && URL_TYPE_LABELS.get(token)) || null;
}

/**
 * How a page's kind was established, for the reader who asks.
 *
 * A format derived from the address alone is a weaker claim than one read off
 * the page, and the two must not look identical in a table. Returns null for a
 * method that carries no useful qualification.
 */
export function pageFormatBasis(method: string | null | undefined): string | null {
  if (method === 'structured_data') return 'From the page’s own structured data';
  if (method === 'heading_evidence') return 'From the page’s headings';
  if (method === 'url_pattern') return 'From the address; the page has not been read';
  return null;
}
