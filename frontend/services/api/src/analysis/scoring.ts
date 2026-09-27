/** Classify citation ownership from the audit's frozen scoring configuration. */
import { domainMatches, isGroundingRedirect, normalizeDomain } from './domains.ts';

type JsonObject = Record<string, unknown>;

type CompetitorConfig = { name: string; domains: string[] };

export type ScoringConfig = {
  brandName: string;
  ownedDomains: unknown[];
  unintendedDomains: unknown[];
  competitors: CompetitorConfig[];
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Stored scoring configuration carries arrays, never arbitrary iterables. */
function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `str(item) for item in values if item`. */
function truthyStrings(values: unknown[]): string[] {
  return values.filter(Boolean).map(String);
}

function competitorConfigs(config: JsonObject): CompetitorConfig[] {
  return listOf(config.competitors).map((item) => {
    // The stored list holds objects; anything else fails as `.get` would.
    if (!isObject(item)) throw new TypeError('competitor entry is not an object');
    return {
      name: String(item.name ?? ''),
      domains: truthyStrings(listOf(item.domains)),
    };
  });
}

/**
 * The parts of `ScoringConfig.from_project(configuration)` that classify a
 * citation and name the tracked entities, over an audit's frozen block.
 */
export function scoringConfig(configuration: unknown): ScoringConfig {
  const config = isObject(configuration) ? configuration : {};
  return {
    brandName: String(config.brand_name ?? ''),
    ownedDomains: listOf(config.owned_domains),
    unintendedDomains: listOf(config.unintended_domains),
    competitors: competitorConfigs(config),
  };
}

function domainIn(domain: string, targets: readonly unknown[]): boolean {
  return targets.some((target) => domainMatches(domain, target));
}

function urlDomain(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return normalizeDomain(new URL(raw).hostname);
  } catch {
    return '';
  }
}

/** Publisher identity from the strongest URL evidence the citation carries. */
function citationDomain(citation: JsonObject): string {
  const resolved = urlDomain(citation.resolved_url);
  if (resolved) return resolved;
  const annotationUrl = citation.redirect_url || citation.url;
  const direct = urlDomain(annotationUrl);
  if (direct && !isGroundingRedirect(annotationUrl)) return direct;
  return normalizeDomain(citation.domain || citation.title);
}

export type ClassifiedCitation = JsonObject & {
  domain: string;
  is_owned: boolean;
  is_unintended: boolean;
  matched_competitor: string | null;
};

/** The citation with its ownership and competitor classification. */
export function classifyCitation(citation: JsonObject, config: ScoringConfig): ClassifiedCitation {
  const domain = citationDomain(citation);
  const matched = config.competitors.find((competitor) => domainIn(domain, competitor.domains));
  return {
    ...citation,
    domain,
    is_owned: domainIn(domain, config.ownedDomains),
    is_unintended: domainIn(domain, config.unintendedDomains),
    matched_competitor: matched ? matched.name : null,
  };
}
