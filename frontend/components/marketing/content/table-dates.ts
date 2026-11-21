const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTH = [
  ...new Set(
    MONTHS.flatMap((month) =>
      month === 'September' ? [month, 'Sept', 'Sep'] : [month, month.slice(0, 3)],
    ),
  ),
].join('|');
const DAY_BEFORE = /(?:\d{1,2} )?/.source;
const DAY_AFTER = /\.?(?: \d{1,2},)?/.source;
const YEAR = / \d{4}\b/.source;
const DATE = String.raw`\b${DAY_BEFORE}(?:${MONTH})${DAY_AFTER}${YEAR}`;
const PERIOD = /\b(?:Q[1-4]|H[12]) \d{4}\b/;
const HYPHENATED = /\b[A-Z][\dA-Za-z]*(?:-[\dA-Za-z.]*[\dA-Za-z])+\b/;
const VERSIONED = /\b[A-Z][A-Za-z]+ \d+(?:\.\d+)*\b/;
const WHOLE = new RegExp([DATE, PERIOD.source, HYPHENATED.source, VERSIONED.source].join('|'), 'g');

const WHOLE_LENGTH = 32;

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

export const isSourceHeader = (header: string) => /^sources?\b/i.test(header.trim());
