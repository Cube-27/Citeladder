/**
 * The frozen scoring configuration and citation classification.
 *
 * Ports `ScoringConfig.from_project`, `citation_domain` and
 * `classify_citation` from `app/analysis/scoring.py`. A link on an observed
 * surface is classified by the same rule the scorer applied to the
 * references, so an owned domain is never owned in one panel and third-party
 * in the next. Python keeps the scorer; golden masters regenerate from it.
 */
import { pyStrip, pyStrOrEmpty, pyTruthy } from '../python/text.ts';
import { hostname, PythonValueError, urlsplit } from '../python/urlparse.ts';
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

/** `tuple(value or [])` over a decoded JSON value. */
function listOf(value: unknown): unknown[] {
  if (!pyTruthy(value)) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [...value];
  if (isObject(value)) return Object.keys(value);
  throw new TypeError(`${typeof value} object is not iterable`);
}

/** `str(item) for item in values if item`. */
function truthyStrings(values: unknown[]): string[] {
  return values.filter(pyTruthy).map(pyStrOrEmpty);
}

/** Python's `left or right`. */
function pyOr(left: unknown, right: unknown): unknown {
  return pyTruthy(left) ? left : right;
}

function competitorConfigs(config: JsonObject): CompetitorConfig[] {
  return listOf(config.competitors).map((item) => {
    // The stored list holds objects; anything else fails as `.get` would.
    if (!isObject(item)) throw new TypeError('competitor entry is not an object');
    return {
      name: pyStrOrEmpty(item.name),
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
    brandName: pyStrOrEmpty(config.brand_name),
    ownedDomains: listOf(config.owned_domains),
    unintendedDomains: listOf(config.unintended_domains),
    competitors: competitorConfigs(config),
  };
}

function domainIn(domain: string, targets: readonly unknown[]): boolean {
  return targets.some((target) => domainMatches(domain, target));
}

function urlDomain(value: unknown): string {
  const raw = pyStrip(pyStrOrEmpty(value));
  if (!raw) return '';
  try {
    return normalizeDomain(hostname(urlsplit(raw)) ?? '');
  } catch (error) {
    if (error instanceof PythonValueError) return '';
    throw error;
  }
}

/** Publisher identity from the strongest URL evidence the citation carries. */
function citationDomain(citation: JsonObject): string {
  const resolved = urlDomain(citation.resolved_url);
  if (resolved) return resolved;
  const annotationUrl = pyOr(citation.redirect_url, citation.url);
  const direct = urlDomain(annotationUrl);
  if (direct && !isGroundingRedirect(annotationUrl)) return direct;
  return normalizeDomain(pyOr(citation.domain, citation.title));
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
