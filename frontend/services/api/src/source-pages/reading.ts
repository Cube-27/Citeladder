/**
 * Which roster judged a persisted source-page reading, and the passages it
 * quoted.
 *
 * Python source-page inspection stamps `roster_version` on every presence it
 * writes (`app/domain/source_pages/roster.project_roster`), and the
 * earned-page detector only compares readings taken on the current roster, so
 * `projectRoster` must hash exactly what Python hashes until source-page
 * inspection moves.
 */
import { createHash } from 'node:crypto';

import { policy } from '../config.ts';
import { compareIdentityText } from '../analysis/comparison.ts';
import { record } from '../db/json.ts';

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).sort(compareIdentityText) : [];

function compareLists(left: string[], right: string[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = compareIdentityText(left[index]!, right[index]!);
    if (order) return order;
  }
  return left.length - right.length;
}

/** Python's default `json.dumps` (ASCII-escaped, `', '`/`': '`) for strings, lists and sorted objects. */
function pythonJson(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value).replaceAll(
      /[^\x20-\x7e]/g,
      (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
  }
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`;
  const entries = Object.entries(record(value)).sort(([a], [b]) => compareIdentityText(a, b));
  return `{${entries.map(([key, item]) => `${pythonJson(key)}: ${pythonJson(item)}`).join(', ')}}`;
}

/** A stable fingerprint of the brand and competitor names an audit measured. */
export function projectRoster(configuration: unknown): string {
  const config = record(configuration);
  const competitors = (Array.isArray(config.competitors) ? config.competitors : [])
    .map((item) => {
      const competitor = record(item);
      return [String(competitor.name || ''), ...strings(competitor.aliases)];
    })
    .sort(compareLists);
  const identity = {
    brand: String(config.brand_name || ''),
    brand_aliases: strings(config.brand_aliases),
    competitors,
    detector: policy.opportunity.source_pages.SOURCE_PAGE_PRESENCE_VERSION,
  };
  const digest = createHash('sha256').update(pythonJson(identity)).digest('hex');
  return `roster-${digest.slice(0, 32)}`;
}

/** The quoted windows behind one verdict, resolved from its snapshot. */
export function passageTexts(passages: unknown, refs: unknown): string[] {
  const rows = Array.isArray(passages) ? passages : [];
  const indexes = Array.isArray(refs) ? refs : [];
  return indexes.flatMap((index) => {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return [];
    const text = record(rows[index]).text;
    return typeof text === 'string' && text.trim() ? [text.trim()] : [];
  });
}
