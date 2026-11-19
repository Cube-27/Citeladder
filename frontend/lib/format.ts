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

/**
 * The one list of absence kinds and their words. A value is missing in exactly
 * one of these ways; in a value position `Absence` prints `ABSENCE_MARK` and
 * keeps the word as its tooltip and accessible name, so the kinds stay distinct.
 */
export const ABSENCE_STATES = [
  'not_measured',
  'not_connected',
  'not_set',
  'not_run',
  'none',
  'not_applicable',
  'unavailable',
  'too_few',
] as const;

export type DataAvailabilityState = (typeof ABSENCE_STATES)[number];

const availabilityLabels: Record<DataAvailabilityState, string> = {
  not_measured: 'Not measured',
  not_connected: 'Not connected',
  not_set: 'Not set',
  not_run: 'Not run yet',
  none: 'None',
  not_applicable: 'Not applicable',
  unavailable: 'Unavailable',
  too_few: 'Too few',
};

/** The word for a kind of absence. */
export function availabilityLabel(state: DataAvailabilityState): string {
  return availabilityLabels[state];
}

const absenceByWord = new Map<unknown, DataAvailabilityState>(
  ABSENCE_STATES.map((state) => [availabilityLabels[state], state]),
);

/** The kind of absence a formatter's word names, or null for a printed value. */
export function absenceOf(text: unknown): DataAvailabilityState | null {
  return absenceByWord.get(text) ?? null;
}

/**
 * The muted em dash every absent value prints (owner 2026-11-18). Never
 * an empty string: a blank and a measured zero are opposite findings.
 */
export const ABSENCE_MARK = '—';

/**
 * A persisted fraction (0.125) as a percentage ("12.5%"), always one decimal
 * so "92.0%" and "10.0%" read as one format; null is not measured.
 */
export function formatPercent(fraction: number | null): string {
  if (fraction === null) return availabilityLabel('not_measured');
  return percentText(fraction);
}

/** A measured fraction as a percentage, one decimal ("12.5%"); absence is the caller's. */
export function percentText(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * An amount in its currency when the code is an ISO currency ("$12.50"),
 * else the bare amount with whatever code it came with ("12.5 pts").
 */
export function formatAmount(amount: number, currency: string | null): string {
  if (currency && /^[A-Z]{3}$/u.test(currency)) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
      // An unknown code falls through to the bare amount with its code.
    }
  }
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
  return currency ? `${number} ${currency}` : number;
}

/** A mean or a ratio (an average position, citations per response), one decimal ("8.4"). */
export function formatMean(value: number): string {
  return value.toFixed(1);
}

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

/** `2026-07` (or a day in it) → `Jul 2026` (monthly series labels). */
export function formatMonth(isoMonth: string): string {
  const date = new Date(`${isoMonth.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoMonth;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * One cached formatter per variant and zone: zoned formatters are costly and
 * run per table cell. A bad zone throws on construction and is never cached.
 */
function dateFormat(variant: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${variant}\u0000${options.timeZone}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', options);
    dateFormats.set(key, format);
  }
  return format;
}

function formatInstant({
  timestamp,
  timeZone,
  zoned,
}: Readonly<{ timestamp: string; timeZone: string; zoned: boolean }>): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  try {
    return dateFormat(zoned ? 'instant-zoned' : 'instant', {
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
    const zone = dateFormat('zone', { timeZone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    return `Times in ${zone ?? timeZone}`;
  } catch {
    return 'Times in UTC';
  }
}

/**
 * A persisted instant in a strip's meta, short and zoneless (`18 Nov 09:12`),
 * the one form every page's strip prints (owner, 2026-11-18).
 */
export function formatStripTimestamp(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  try {
    const parts = dateFormat('strip', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    return `${part('day')} ${part('month')} ${part('hour')}:${part('minute')}`;
  } catch {
    return timeZone === 'UTC' ? timestamp : formatStripTimestamp(timestamp, 'UTC');
  }
}

/** `2026-07-23` → `23 Jul`: a day in a strip's meta, in the strip's short form. */
export function formatStripDay(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  const parts = dateFormat('strip-day', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}`;
}

/** Date portion of a persisted instant, using the same display timezone. */
export function formatDisplayDate(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  try {
    return dateFormat('date', { dateStyle: 'medium', timeZone }).format(date);
  } catch {
    return timeZone === 'UTC' ? timestamp : formatDisplayDate(timestamp, 'UTC');
  }
}

/** Time-of-day portion of a persisted instant, with its zone, in the same display timezone. */
export function formatDisplayTime(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  try {
    return dateFormat('time', {
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
    return dateFormat('short-date', { month: 'short', day: 'numeric', timeZone }).format(date);
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

/**
 * Close a sentence once: a text that already ends in `.`, `!` or `?` (a
 * worker's reason, a brand like "Bluebird Bean Co.") gets no second stop.
 */
export function endSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
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

/** ISO 3166-1 alpha-3 to alpha-2, each pair run together: Search Console reports alpha-3. */
const ALPHA3_TO_ALPHA2 = new Map(
  `AFGAF ALAAX ALBAL DZADZ ASMAS ANDAD AGOAO AIAAI ATAAQ ATGAG ARGAR ARMAM ABWAW AUSAU AUTAT
  AZEAZ BHSBS BHRBH BGDBD BRBBB BLRBY BELBE BLZBZ BENBJ BMUBM BTNBT BOLBO BESBQ BIHBA BWABW
  BVTBV BRABR IOTIO BRNBN BGRBG BFABF BDIBI CPVCV KHMKH CMRCM CANCA CYMKY CAFCF TCDTD CHLCL
  CHNCN CXRCX CCKCC COLCO COMKM COGCG CODCD COKCK CRICR CIVCI HRVHR CUBCU CUWCW CYPCY CZECZ
  DNKDK DJIDJ DMADM DOMDO ECUEC EGYEG SLVSV GNQGQ ERIER ESTEE SWZSZ ETHET FLKFK FROFO FJIFJ
  FINFI FRAFR GUFGF PYFPF ATFTF GABGA GMBGM GEOGE DEUDE GHAGH GIBGI GRCGR GRLGL GRDGD GLPGP
  GUMGU GTMGT GGYGG GINGN GNBGW GUYGY HTIHT HMDHM VATVA HNDHN HKGHK HUNHU ISLIS INDIN IDNID
  IRNIR IRQIQ IRLIE IMNIM ISRIL ITAIT JAMJM JPNJP JEYJE JORJO KAZKZ KENKE KIRKI PRKKP KORKR
  KWTKW KGZKG LAOLA LVALV LBNLB LSOLS LBRLR LBYLY LIELI LTULT LUXLU MACMO MDGMG MWIMW MYSMY
  MDVMV MLIML MLTMT MHLMH MTQMQ MRTMR MUSMU MYTYT MEXMX FSMFM MDAMD MCOMC MNGMN MNEME MSRMS
  MARMA MOZMZ MMRMM NAMNA NRUNR NPLNP NLDNL NCLNC NZLNZ NICNI NERNE NGANG NIUNU NFKNF MKDMK
  MNPMP NORNO OMNOM PAKPK PLWPW PSEPS PANPA PNGPG PRYPY PERPE PHLPH PCNPN POLPL PRTPT PRIPR
  QATQA REURE ROURO RUSRU RWARW BLMBL SHNSH KNAKN LCALC MAFMF SPMPM VCTVC WSMWS SMRSM STPST
  SAUSA SENSN SRBRS SYCSC SLESL SGPSG SXMSX SVKSK SVNSI SLBSB SOMSO ZAFZA SGSGS SSDSS ESPES
  LKALK SDNSD SURSR SJMSJ SWESE CHECH SYRSY TWNTW TJKTJ TZATZ THATH TLSTL TGOTG TKLTK TONTO
  TTOTT TUNTN TURTR TKMTM TCATC TUVTV UGAUG UKRUA AREAE GBRGB USAUS UMIUM URYUY UZBUZ VUTVU
  VENVE VNMVN VGBVG VIRVI WLFWF ESHEH YEMYE ZMBZM ZWEZW XKKXK`
    .split(/\s+/u)
    .map((pair) => [pair.slice(0, 3), pair.slice(3)] as const),
);

let regionNames: Intl.DisplayNames | undefined;

/** A country code as its English name ("usa" → "United States"); an unknown code upper-case. */
export function formatCountry(code: string): string {
  const upper = code.trim().toUpperCase();
  const alpha2 = ALPHA3_TO_ALPHA2.get(upper) ?? (/^[A-Z]{2}$/u.test(upper) ? upper : null);
  if (!alpha2) return upper;
  regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
  return regionNames.of(alpha2) ?? upper;
}

/**
 * A URL's origin when it is on the project's own site (ignoring `www.`), so
 * its cell prints the path alone; null for a foreign host, which stays printed.
 */
export function ownOrigin(url: string, website: string | null | undefined): string | null {
  try {
    return isOwnHost(new URL(url).host, website) ? originOf(url) : null;
  } catch {
    return null;
  }
}

/** Whether a host is the project website's own, ignoring `www.`. */
export function isOwnHost(host: string, website: string | null | undefined): boolean {
  const bare = (value: string) => value.toLowerCase().replace(/^www\./u, '');
  try {
    return Boolean(website) && bare(host) === bare(new URL(website ?? '').host);
  } catch {
    return false;
  }
}

/** A URL as its cell prints it: readable, without the column's shared origin. */
export function urlCellText(value: string, origin: string | null): string {
  const readable = readableUrl(value);
  if (origin === null || originOf(value) !== origin || !value.startsWith(origin)) return readable;
  const path = readableUrl(value.slice(origin.length));
  return path === '' ? '/' : path;
}
