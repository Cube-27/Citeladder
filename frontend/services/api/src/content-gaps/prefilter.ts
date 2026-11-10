/**
 * The lexical prefilter of the owned match: the content pages that cover an
 * angle's terms best, by the normalized coverage `source-pages/differentiation.ts`
 * uses to pick an owned page for a query. The model then picks one or none.
 */
import { lexicalTokens } from '../analysis/lexical.ts';
import { compareText } from '../text-order.ts';
import type { CandidatePage } from './load.ts';

/** A content page with its title, headings and excerpt tokenized once per run. */
export type TokenizedPage = { page: CandidatePage; tokens: ReadonlySet<string> };

/** Tokenizes each page once, so every angle of a run reuses the same token sets. */
export const tokenizePages = (pages: readonly CandidatePage[]): TokenizedPage[] =>
  pages.map((page) => ({
    page,
    tokens: lexicalTokens(`${page.title} ${page.headings.join(' ')} ${page.excerpt}`),
  }));

/** The share of `terms` the page's title, headings and excerpt contain. */
function coverage(terms: ReadonlySet<string>, tokens: ReadonlySet<string>): number {
  if (!terms.size) return 0;
  return [...terms].filter((term) => tokens.has(term)).length / terms.size;
}

/** At most `k` pages with any coverage, best first, ties by site URL ID. */
export function ownedCandidates(
  angleTerms: ReadonlySet<string>,
  contentPages: readonly TokenizedPage[],
  k: number,
): CandidatePage[] {
  return contentPages
    .map(({ page, tokens }) => ({ page, score: coverage(angleTerms, tokens) }))
    .filter((choice) => choice.score > 0)
    .sort((a, b) => b.score - a.score || compareText(a.page.siteUrlId, b.page.siteUrlId))
    .slice(0, k)
    .map((choice) => choice.page);
}
