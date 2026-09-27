/**
 * One GA4 referral metric row as a sanitized, immutable `referral_events` row.
 *
 * Ports the pure half of the retired `domain/analytics/ingest.py` and
 * `sanitize.py`; frozen golden masters hold the port to Python's output,
 * content hash included, so events a Python run already wrote dedupe against
 * a TypeScript re-run. The redaction runs BEFORE the write (invariant 6):
 * URLs keep only allowlisted marketing parameters, and fragments and
 * credentials never survive. GA4 rows are session aggregates, so the event
 * carries no user agent or session identity.
 */
import { createHash } from 'node:crypto';

import { normalizeDomain } from '../analysis/domains.ts';
import { policy } from '../config.ts';
import { pyStrip } from '../python/text.ts';
import {
  hostname,
  parseQsl,
  port,
  PythonValueError,
  urlencode,
  urlsplit,
  urlunsplit,
  type SplitResult,
} from '../python/urlparse.ts';

const { referrals } = policy;

export type MetricRowIdentity = { dataset: string; date: string; dimension_key: string };

type Signals = {
  landing_url: string;
  referrer_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
};

export type ReferralEventFields = Signals & {
  referrer_host: string;
  user_agent: string;
  session_id_hash: string;
  raw: Record<string, string>;
  content_hash: string;
};

function paramAllowed(name: string): boolean {
  return (
    referrals.url_param_allowlist.includes(name) ||
    referrals.url_param_allowlist_prefixes.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * A landing/referrer URL stripped to its persistable, PII-free form. A URL
 * `urlsplit` rejects (an unbalanced IPv6 bracket, say) persists as empty: in
 * Python it failed the whole artifact's ingest on every retry, so one garbage
 * referrer blocked the chain. The row's `dimension_key` keeps the original.
 */
export function sanitizeReferralUrl(url: string | null): string {
  const text = pyStrip(url ?? '');
  if (!text) return '';
  let parts: SplitResult;
  try {
    parts = urlsplit(text);
  } catch (error) {
    if (error instanceof PythonValueError) return '';
    throw error;
  }
  let netloc = '';
  if (parts.netloc) {
    // Rebuild the authority from host and port only: userinfo never survives.
    const host = (hostname(parts) ?? '').toLowerCase();
    let portNumber: number | null;
    try {
      portNumber = port(parts);
    } catch {
      portNumber = null;
    }
    netloc = portNumber ? `${host}:${portNumber}` : host;
  }
  const kept = parseQsl(parts.query)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .filter(([name]) => paramAllowed(name));
  return urlunsplit({
    scheme: parts.scheme.toLowerCase(),
    netloc,
    path: parts.path,
    query: urlencode(kept),
    fragment: '',
  });
}

/** `str.rsplit(separator, maxsplit)`. */
function rsplit(text: string, separator: string, maxsplit: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (parts.length < maxsplit) {
    const at = rest.lastIndexOf(separator);
    if (at < 0) break;
    parts.unshift(rest.slice(at + separator.length));
    rest = rest.slice(0, at);
  }
  parts.unshift(rest);
  return parts;
}

/** `unpack_dimension_key`: the declared values, split from the right. */
function unpackDimensionKey(dataset: string, key: string): string[] | null {
  const arity: number | undefined = (referrals.dimension_arity as Record<string, number>)[dataset];
  if (arity === undefined) return null;
  const parts = rsplit(key, referrals.dimension_key_separator, arity - 1);
  return parts.length === arity ? parts : null;
}

function signalsForRow(row: MetricRowIdentity): Signals | null {
  const values = unpackDimensionKey(row.dataset, row.dimension_key);
  if (values === null) return null;
  const empty = {
    landing_url: '',
    referrer_url: '',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
  };
  if (row.dataset === referrals.datasets.referrer_daily) {
    // (pageReferrer, date): the full referring URL.
    return { ...empty, referrer_url: pyStrip(values[0]!) };
  }
  // (sessionSource, sessionMedium, date): the session's traffic-source tags.
  return { ...empty, utm_source: pyStrip(values[0]!), utm_medium: pyStrip(values[1]!) };
}

/** `json.dumps(value, sort_keys=True, separators=(",", ":"))` for string maps. */
function pythonCanonicalJson(value: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)));
  // `ensure_ascii`: DEL and each non-ASCII UTF-16 unit, surrogates included,
  // as `\uxxxx` (Python escapes everything outside ' '..'~').
  let ascii = '';
  for (const unit of JSON.stringify(sorted).split('')) {
    const code = unit.charCodeAt(0);
    ascii += code < 0x7f ? unit : `\\u${code.toString(16).padStart(4, '0')}`;
  }
  return ascii;
}

/** The sanitized event fields for one metric row, or null when it maps to no signals. */
export function referralEventFields(row: MetricRowIdentity): ReferralEventFields | null {
  const signals = signalsForRow(row);
  if (signals === null) return null;
  const landingUrl = sanitizeReferralUrl(signals.landing_url);
  const referrerUrl = sanitizeReferralUrl(signals.referrer_url);
  const referrerHost = normalizeDomain(referrerUrl);
  const candidate: Record<string, string> = {
    dataset: row.dataset,
    date: row.date,
    dimension_key: row.dimension_key,
  };
  if (referrerHost) candidate.referrer_host = referrerHost;
  if (signals.utm_source) candidate.utm_source = signals.utm_source;
  if (signals.utm_medium) candidate.utm_medium = signals.utm_medium;
  if (signals.utm_campaign) candidate.utm_campaign = signals.utm_campaign;
  const raw = Object.fromEntries(
    Object.entries(candidate).filter(([key]) => referrals.raw_allowlist.includes(key)),
  );
  // The dedupe key: stable across re-runs because the artifact is immutable.
  const contentHash = createHash('sha256')
    .update(
      pythonCanonicalJson({
        dataset: row.dataset,
        date: row.date,
        dimension_key: row.dimension_key,
        landing_url: landingUrl,
        referrer_url: referrerUrl,
        referrer_host: referrerHost,
        utm_source: signals.utm_source,
        utm_medium: signals.utm_medium,
        utm_campaign: signals.utm_campaign,
      }),
    )
    .digest('hex');
  return {
    landing_url: landingUrl,
    referrer_url: referrerUrl,
    referrer_host: referrerHost,
    utm_source: signals.utm_source,
    utm_medium: signals.utm_medium,
    utm_campaign: signals.utm_campaign,
    user_agent: '',
    session_id_hash: '',
    raw,
    content_hash: contentHash,
  };
}
