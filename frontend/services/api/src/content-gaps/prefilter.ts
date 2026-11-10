/**
 * The lexical prefilter of the owned match: the content pages that cover an
 * angle's terms best, by the normalized coverage `source-pages/differentiation.ts`
 * uses to pick an owned page for a query. The model then picks one or none.
 */
import { lexicalTokens } from '../analysis/lexical.ts';
import { compareText } from '../text-order.ts';
import type { CandidatePage } from './load.ts';

/** The share of `terms` the page's title, headings and excerpt contain. */
function coverage(terms: ReadonlySet<string>, page: CandidatePage): number {
  if (!terms.size) return 0;
  const available = lexicalTokens(`${page.title} ${page.headings.join(' ')} ${page.excerpt}`);
  return [...terms].filter((term) => available.has(term)).length / terms.size;
}

/** At most `k` pages with any coverage, best first, ties by site URL ID. */
export function ownedCandidates(
  angleTerms: ReadonlySet<string>,
  contentPages: readonly CandidatePage[],
  k: number,
): CandidatePage[] {
  return contentPages
    .map((page) => ({ page, score: coverage(angleTerms, page) }))
    .filter((choice) => choice.score > 0)
    .sort((a, b) => b.score - a.score || compareText(a.page.siteUrlId, b.page.siteUrlId))
    .slice(0, k)
    .map((choice) => choice.page);
}
