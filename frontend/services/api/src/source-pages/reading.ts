/**
 * Which roster judged a persisted source-page reading, and the passages it
 * quoted.
 *
 * Inspection stamps `roster_version` on every presence: the names, aliases and
 * mention rules it matched with, and the detector version. A reading counts
 * only against the roster in force now.
 */
import { createHash } from 'node:crypto';

import { policy } from '../config.ts';
import { compareIdentityText } from '../analysis/comparison.ts';
import { storedEntityMatching } from '../analysis/entity-matching.ts';
import { record } from '../db/json.ts';

const sorted = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).sort(compareIdentityText) : [];

/** A stable fingerprint of the brand, competitors and mention rules an audit measured. */
export function projectRoster(configuration: unknown): string {
  const config = record(configuration);
  const competitors = (Array.isArray(config.competitors) ? config.competitors : [])
    .map((item) => {
      const competitor = record(item);
      return [String(competitor.name || ''), ...sorted(competitor.aliases)];
    })
    .sort((a, b) => compareIdentityText(JSON.stringify(a), JSON.stringify(b)));
  const matching = storedEntityMatching(config);
  const identity = {
    brand: String(config.brand_name || ''),
    brand_aliases: sorted(config.brand_aliases),
    competitors,
    matching: Object.keys(matching)
      .sort(compareIdentityText)
      .map((key) => [key, matching[key]]),
    detector: policy.opportunity.source_pages.SOURCE_PAGE_PRESENCE_VERSION,
  };
  const digest = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
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
