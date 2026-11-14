/**
 * A token that must not break across lines: a calendar date or period
 * ("8 November 2026", "Oct 2026", "Q3 2026"), a hyphenated name
 * ("Applebot-Extended", "GPL-3.0") or a name and its version ("PostgreSQL 16").
 */
const WHOLE = new RegExp(
  [
    /\b(?:\d{1,2} )?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?: \d{1,2},)? \d{4}\b/,
    /\b(?:Q[1-4]|H[12]) \d{4}\b/,
    /\b[A-Z][\dA-Za-z]*(?:-[\dA-Za-z.]*[\dA-Za-z])+\b/,
    /\b[A-Z][A-Za-z]+ \d+(?:\.\d+)*\b/,
  ]
    .map((part) => part.source)
    .join('|'),
  'g',
);

/** Longest token kept whole; anything longer may still wrap. */
const WHOLE_LENGTH = 32;

/** Text split into runs, each unbreakable token its own run, so it can be kept on one line. */
export function wholeRuns(text: string): { text: string; whole: boolean }[] {
  const runs: { text: string; whole: boolean }[] = [];
  const pattern = new RegExp(WHOLE);
  let start = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match[0].length > WHOLE_LENGTH) continue;
    if (match.index > start) runs.push({ text: text.slice(start, match.index), whole: false });
    runs.push({ text: match[0], whole: true });
    start = match.index + match[0].length;
  }
  if (start < text.length) runs.push({ text: text.slice(start), whole: false });
  return runs;
}

/** A source column: its header names where the row's figures come from. */
export const isSourceHeader = (header: string) => /^sources?\b/i.test(header.trim());
