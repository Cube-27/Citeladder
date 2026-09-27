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
/** Whether one heading names `needle` on token boundaries, including compact matches. */
function headingNames(heading: string, needle: string): boolean {
  const text = normalizeAlias(heading);
  if (!text) return false;
  const tokens = text.split(' ');
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
/** A match never spans two headings: "Ac" and "me" do not list "Acme". */
export function listedInHeadings(name: string, headings: string[]): boolean {
  const needle = normalizeAlias(name).replaceAll(' ', '');
  return Boolean(needle) && headings.some((heading) => headingNames(heading, needle));
}
export function linksToOwned(outbound: string[], owned: string[]): boolean {
  return outbound.some((link) => owned.some((domain) => domainMatches(link, domain)));
}
