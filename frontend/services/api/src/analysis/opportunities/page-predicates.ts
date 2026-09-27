import { casefold } from '../../traffic/normalization.ts';
import { pyCollapseWhitespace, pyStrip } from '../../python/text.ts';
import { domainMatches } from '../domains.ts';

/** Python Unicode word characters are letters, numbers and underscore. */
function normalizeAlias(value: string): string {
  return pyCollapseWhitespace(
    pyCollapseWhitespace(casefold(value.normalize('NFKC')).replaceAll('&', ' and ')).replace(
      /[^\p{L}\p{N}_ ]/gu,
      ' ',
    ),
  );
}
export function listedInHeadings(name: string, headings: string[]): boolean {
  const text = normalizeAlias(headings.join(' | '));
  const alias = pyStrip(normalizeAlias(name));
  if (!alias || !text) return false;
  const tokens = text.split(' ');
  const needle = alias.replaceAll(' ', '');
  // Each start/end is a token boundary, including overlapping compact matches.
  return tokens.some((_, start) => {
    let candidate = '';
    for (const token of tokens.slice(start)) {
      candidate += token;
      if (candidate === needle) return true;
      if (candidate.length >= needle.length) break;
    }
    return false;
  });
}
export function linksToOwned(outbound: string[], owned: string[]): boolean {
  return outbound.some((link) => owned.some((domain) => domainMatches(link, domain)));
}
