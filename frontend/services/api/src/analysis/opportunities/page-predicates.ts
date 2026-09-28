import { namesAlias } from '../aliases.ts';
import { domainMatches } from '../domains.ts';

/** A match never spans two headings: "Ac" and "me" do not list "Acme". */
export function listedInHeadings(name: string, headings: string[]): boolean {
  return headings.some((heading) => namesAlias(heading, name));
}
export function linksToOwned(outbound: string[], owned: string[]): boolean {
  return outbound.some((link) => owned.some((domain) => domainMatches(link, domain)));
}
