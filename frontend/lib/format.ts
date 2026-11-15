/**
 * Shared display-format vocabulary (F5–F9) — ONE owner (invariant 2) for the
 * date / count / URL / snapshot-granularity formatters the Traffic,
 * AI Referrals, and Settings→Integrations surfaces all render with.
 *
 * The domain modules (`lib/traffic/traffic`, `lib/ai-traffic/options`,
 * `lib/ai-traffic/series`) re-export these under their local names so
 * domain import sites stay local; new code should import from here.
 *
 * Everything is pure and framework-free. Calendar bucket dates are fixed to
 * UTC; timestamp displays receive an explicit resolved timezone. Unparseable
 * input passes through untouched — never a fabricated value (invariant 9).
 */
import type { z } from 'zod';

import type { snapshotGranularitySchema } from '@citeladder/contracts/analytics';

/** Snapshot bucket granularity — mirrors the backend contract vocabulary. */
type BucketGranularity = z.infer<typeof snapshotGranularitySchema>;

export type DataAvailabilityState =
  | 'not_measured'
  | 'not_run'
  | 'pending'
  | 'not_set'
  | 'unavailable'
  | 'not_applicable'
  | 'not_connected'
  | 'excluded'
  | 'unknown'
  | 'none';

const availabilityLabels: Readonly<Record<DataAvailabilityState, string>> = {
  not_measured: 'Not measured',
  not_run: 'Not run',
  pending: 'Being prepared',
  not_set: 'Not set',
  unavailable: 'Unavailable',
  not_applicable: 'Not applicable',
  not_connected: 'Not connected',
  excluded: 'Excluded',
  unknown: 'Unknown',
  none: 'None',
};

/** Human-readable product vocabulary for explicit missing-data states. */
export function availabilityLabel(state: DataAvailabilityState): string {
  return availabilityLabels[state];
}

/**
 * A persisted fraction (0.125) as a percentage ("12.5%"), always one decimal
 * so "92.0%" and "10.0%" read as one format; null is not measured.
 */
export function formatPercent(fraction: number | null): string {
  if (fraction === null) return availabilityLabel('not_measured');
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * The en dash a numeric cell too narrow for an absence's word prints instead
 * (`Absence narrow`); the word stays in a tooltip and the accessible name.
 * Never an empty string: a blank and a measured zero are opposite findings.
 */
export const MISSING_MARK = '–';

export const GRANULARITY_OPTIONS: readonly { value: BucketGranularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;

/** `2026-07-23` → `Jul 23` (series bucket labels + active-run windows). */
export function formatShortDate(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** `2026-07-23` → `Jul 23, 2026` (window labels in notes). */
export function formatWindowDate(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatInstant({
  timestamp,
  timeZone,
  zoned,
}: Readonly<{ timestamp: string; timeZone: string; zoned: boolean }>): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: zoned ? 'short' : undefined,
    }).format(date);
  } catch {
    return timeZone === 'UTC' ? timestamp : formatInstant({ timestamp, timeZone: 'UTC', zoned });
  }
}

/** A persisted instant in the display timezone, with its zone (`Nov 14, 2026, 05:03 PM GMT+5:30`). */
export function formatDisplayTimestamp(timestamp: string, timeZone: string): string {
  return formatInstant({ timestamp, timeZone, zoned: true });
}

/**
 * A persisted instant in a table's date column, without the zone
 * (`Nov 14, 2026, 05:03 PM`): the table states its zone once
 * (`formatTimeZoneNote`), never on every row.
 */
export function formatTableTimestamp(timestamp: string, timeZone: string): string {
  return formatInstant({ timestamp, timeZone, zoned: false });
}

/**
 * The zone a table or page states once for its date-times: `Times in GMT+5:30`.
 * `at` picks the offset for zones with daylight saving (the newest instant shown).
 */
export function formatTimeZoneNote(timeZone: string, at: Date = new Date()): string {
  try {
    const zone = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    return `Times in ${zone ?? timeZone}`;
  } catch {
    return 'Times in UTC';
  }
}

/** Date portion of a persisted instant, using the same display timezone. */
export function formatDisplayDate(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone }).format(date);
  } catch {
    return timeZone === 'UTC' ? timestamp : formatDisplayDate(timestamp, 'UTC');
  }
}

/** Time-of-day portion of a persisted instant, with its zone, in the same display timezone. */
export function formatDisplayTime(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return timeZone === 'UTC' ? timestamp : formatDisplayTime(timestamp, 'UTC');
  }
}

/** Compact chart label for a persisted instant. */
export function formatDisplayShortDate(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(
      date,
    );
  } catch {
    return timeZone === 'UTC' ? timestamp : formatDisplayShortDate(timestamp, 'UTC');
  }
}

export function formatScore(score: number | null): string {
  return score === null || Number.isNaN(score)
    ? availabilityLabel('not_measured')
    : `${Math.round(score)}`;
}

/** Convert the shared unavailable sentinel to a nullable display value. */
export function measured(value: string): string | null {
  return value === availabilityLabel('not_measured') ? null : value;
}

const numberFormat = new Intl.NumberFormat('en-US');

/** Whole-number grouping for counts (`1,162,000`), never abbreviated. */
export function formatCount(value: number): string {
  return numberFormat.format(value);
}

/** A grouped count with its noun, pluralized with a trailing `s` (`1 answer`, `1,200 answers`). */
export function pluralCount(count: number, noun: string): string {
  return `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** Percent-encoding layers a crawled URL can carry (`%2527` is `'` encoded twice). */
const MAX_URL_DECODE_PASSES = 3;

/**
 * A URL or path as a reader reads it: percent-escapes decoded, layer by
 * layer, so `/Women%2527s-Clothing` shows as `/Women's-Clothing`. Display
 * only; the stored value is never changed. A layer with a malformed escape
 * is shown as it is.
 */
export function readableUrl(value: string): string {
  let current = value;
  for (let pass = 0; pass < MAX_URL_DECODE_PASSES; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return current;
    }
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * A web address as a short title: its host without `www.`, then its last
 * path segment, readable, with `…` for any segments between
 * (`bestandless.com.au/…/Womens-Maxi-Dress`). The query and fragment are
 * dropped. Anything that is not an http(s) URL is only made readable.
 */
export function shortUrlTitle(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return readableUrl(value);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return readableUrl(value);
  const host = url.hostname.replace(/^www\./u, '');
  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments.at(-1);
  if (last === undefined) return host;
  return `${host}${segments.length > 1 ? '/…' : ''}/${readableUrl(last)}`;
}

/** The scheme and host of an http(s) URL ("https://www.example.com"), else null. */
function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The origin every URL in a column shares, so its cells can drop it and give
 * the width to the path; null when they differ or any is not an http(s) URL.
 */
export function sharedOrigin(values: readonly string[]): string | null {
  const [first, ...rest] = values.map(originOf);
  if (first === undefined || first === null) return null;
  return rest.every((origin) => origin === first) ? first : null;
}

/** A URL as its cell prints it: readable, without the column's shared origin. */
export function urlCellText(value: string, origin: string | null): string {
  const readable = readableUrl(value);
  if (origin === null || originOf(value) !== origin || !value.startsWith(origin)) return readable;
  const path = readableUrl(value.slice(origin.length));
  return path === '' ? '/' : path;
}
