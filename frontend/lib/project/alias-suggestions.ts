/**
 * Spellings of the brand to suggest as aliases (AV-25): from the brand name
 * and the project's domains, its "&"/"and" forms and its run-together form.
 * Suggestions only; detection matches what the person keeps.
 */

// Matches the detector's connector rule: an "and" splits a word only between parts this long.
const PART_MIN = 3;

const title = (part: string) => part.charAt(0).toUpperCase() + part.slice(1);

/** A domain's registrable label: "www.bestandless.com.au" reads "bestandless". */
function domainLabel(domain: string): string {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//u, '')
    .replace(/^www\./u, '');
  return host.split(/[./]/u)[0] ?? '';
}

/** The parts either side of a connector: "Best&Less", "Best and Less" or "bestandless". */
function connectorParts(spelling: string): [string, string] | null {
  const spaced = /^(.+?)\s*(?:&|\band\b)\s*(.+)$/iu.exec(spelling);
  if (spaced) {
    const [, head = '', tail = ''] = spaced;
    return [head.trim(), tail.trim()];
  }
  if (/\s/u.test(spelling)) return null;
  for (let at = spelling.toLowerCase().indexOf('and', PART_MIN); at !== -1;) {
    const [head, tail] = [spelling.slice(0, at), spelling.slice(at + 3)];
    if (head.length >= PART_MIN && tail.length >= PART_MIN) return [title(head), title(tail)];
    at = spelling.toLowerCase().indexOf('and', at + 1);
  }
  return null;
}

/** One spelling's variants, itself included. */
function variants(spelling: string): string[] {
  const parts = connectorParts(spelling);
  const forms = [spelling];
  if (parts) {
    const [head, tail] = parts;
    forms.push(`${head}&${tail}`, `${head} & ${tail}`, `${head} and ${tail}`);
    forms.push(`${head}and${tail}`.replaceAll(/\s+/gu, '').toLowerCase());
  } else if (/\s/u.test(spelling)) {
    forms.push(spelling.replaceAll(/\s+/gu, '').toLowerCase());
  }
  return forms;
}

/** Suggested aliases, in order, none already the brand name or a kept alias (ignoring case). */
export function suggestAliases(input: {
  brandName: string;
  aliases: readonly string[];
  domains: readonly string[];
}): string[] {
  const taken = new Set([input.brandName, ...input.aliases].map((name) => name.toLowerCase()));
  const bases = [input.brandName, ...input.domains.map(domainLabel)].filter(Boolean);
  const suggested: string[] = [];
  for (const form of bases.flatMap(variants)) {
    const key = form.toLowerCase();
    if (!form.trim() || taken.has(key)) continue;
    taken.add(key);
    suggested.push(form);
  }
  return suggested;
}
