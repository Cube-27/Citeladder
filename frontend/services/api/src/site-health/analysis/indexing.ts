/** `noindex` judged against strong evidence of indexing intent; uncertainty stays unknown. */
import { policy } from '../../config.ts';
import { stripTrailing } from '../../text-order.ts';
import { record, text, type Facts } from './read-facts.ts';

const TRACKING = new Set(policy.site_health.tracking_params);
export type CheckResult = [outcome: string, evidence: Record<string, unknown>];

/** A declared canonical resolved against the page URL; an unresolvable one stays as declared. */
export function resolveCanonical(canonical: string, finalUrl: string) {
  const raw = canonical.trim();
  if (!raw) return '';
  try {
    return new URL(raw, finalUrl).href;
  } catch {
    return raw;
  }
}

function webUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url : null;
  } catch {
    return null;
  }
}

/** Scheme, host and non-default port, or '' when the URL is not an absolute web URL. */
function canonicalOrigin(value: string) {
  return webUrl(value)?.origin ?? '';
}

/** The comparison form: lower-cased origin, trailing slashes trimmed, tracking parameters dropped. */
function comparableUrl(value: string) {
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.toLowerCase();
  }
  if (!url.hostname) return raw.toLowerCase();
  const path = stripTrailing(url.pathname, '/') || '/';
  const query = new URLSearchParams(
    [...url.searchParams].filter(([key]) => !TRACKING.has(key.toLowerCase())),
  ).toString();
  return `${url.protocol}//${url.host.toLowerCase()}${path}${query ? `?${query}` : ''}`;
}

function canonicalIntent(facts: Facts, evidence: Record<string, unknown>) {
  const declared = text(facts.canonical_url).trim();
  if (!declared) return null;
  const finalUrl = text(record(facts.delivery).final_url);
  const canonical = resolveCanonical(declared, finalUrl);
  evidence.canonical_url = canonical.slice(0, 2048);
  if (!canonicalOrigin(canonical)) {
    // An unparseable canonical is no evidence of intent in either direction.
    evidence.canonical_unparseable = true;
    return null;
  }
  const same = comparableUrl(canonical) === comparableUrl(finalUrl);
  evidence.canonical_matches_final_url = same;
  if (same) return ['intended_index', 'self_canonical'] as const;
  evidence.canonical_intent_ambiguous = true;
  return null;
}

function resolveIntent(facts: Facts, evidence: Record<string, unknown>) {
  const explicit = text(facts.indexing_policy).trim().toLowerCase();
  if (explicit === 'index') return ['intended_index', 'explicit_user_policy'] as const;
  if (explicit === 'exclude') return ['intended_exclude', 'explicit_user_policy'] as const;
  const canonical = canonicalIntent(facts, evidence);
  if (canonical) return canonical;
  if (facts.sitemap_member === true) return ['intended_index', 'sitemap_membership'] as const;
  return ['unknown', 'insufficient_evidence'] as const;
}

export function checkIndexable(facts: Facts): CheckResult {
  const robots = record(facts.robots);
  const noindex = Boolean(robots.noindex);
  const evidence: Record<string, unknown> = { noindex, nofollow: Boolean(robots.nofollow) };
  if (!noindex) return ['satisfied', evidence];
  const [intent, source] = resolveIntent(facts, evidence);
  evidence.indexing_intent = intent;
  evidence.intent_source = source;
  if (intent === 'intended_exclude') {
    evidence.reason = 'intentional_non_indexing';
    return ['not_applicable', evidence];
  }
  return ['missing', evidence];
}
