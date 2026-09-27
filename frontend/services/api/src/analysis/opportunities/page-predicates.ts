import { domainMatches } from '../domains.ts';

/** Compare whole normalized words, including compact brand aliases. */
function normalizeAlias(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replace(/[^\p{L}\p{N}_ ]/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}
export function listedInHeadings(name: string, headings: string[]): boolean {
  const text = normalizeAlias(headings.join(' | '));
  const alias = normalizeAlias(name).trim();
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
