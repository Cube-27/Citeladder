/**
 * How a persisted source-page reading is quoted and which roster judged it
 * (`app/domain/source_pages/projection.passage_texts` and
 * `roster.project_roster`).
 *
 * Python owns source-page inspection and keeps these owners; the earned-page
 * detector reads the same persisted verdicts, so the copies are held to
 * Python by live goldens.
 */
import { createHash } from 'node:crypto';

import { policy } from '../config.ts';
import { pyJsonDumps, pyStr } from '../python/json.ts';
import { pyCompare, pyStrip, pyStrOrEmpty, pyTruthy } from '../python/text.ts';
import { record } from '../traffic/performance.ts';

/** `value or []` for a decoded JSON list. */
const listOrEmpty = (value: unknown): unknown[] =>
  pyTruthy(value) && Array.isArray(value) ? value : [];

/** Python ordering of two lists of strings. */
function compareLists(left: string[], right: string[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = pyCompare(left[index]!, right[index]!);
    if (order) return order;
  }
  return left.length - right.length;
}

/** A stable fingerprint of the brand and competitor names an audit measured. */
export function projectRoster(configuration: unknown): string {
  const config = record(configuration);
  const aliases = (value: unknown) => listOrEmpty(value).map(pyStr).sort(pyCompare);
  const competitors = listOrEmpty(config.competitors)
    .map((item) => {
      const competitor = record(item);
      return [pyStrOrEmpty(competitor.name), ...aliases(competitor.aliases)];
    })
    .sort(compareLists);
  const identity = {
    brand: pyStrOrEmpty(config.brand_name),
    brand_aliases: aliases(config.brand_aliases),
    competitors,
    detector: policy.opportunity.source_pages.SOURCE_PAGE_PRESENCE_VERSION,
  };
  const digest = createHash('sha256')
    .update(pyJsonDumps(identity, { sortKeys: true }))
    .digest('hex');
  return `roster-${digest.slice(0, 32)}`;
}

/** The quoted windows behind one verdict, resolved from its snapshot. */
export function passageTexts(passages: unknown, refs: unknown): string[] {
  const rows = Array.isArray(passages) ? passages : [];
  const indexes = Array.isArray(refs) ? refs : [];
  const out: string[] = [];
  for (const ref of indexes) {
    // `isinstance(index, int)`: a bool is an int, a float is not.
    const index = typeof ref === 'boolean' ? Number(ref) : ref;
    if (typeof index !== 'number' || !Number.isInteger(index)) continue;
    if (index < 0 || index >= rows.length) continue;
    const text = pyStrip(pyStrOrEmpty(record(rows[index]).text));
    if (text) out.push(text);
  }
  return out;
}
