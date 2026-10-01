/** Classify citation ownership from the audit's frozen scoring configuration. */
import { scalarText } from '../text-order.ts';
import { domainMatches, isGroundingRedirect, normalizeDomain } from './domains.ts';
import { normalizeAlias, namesAlias, firstAliasOffset } from './aliases.ts';
import { brandPosition } from './position.ts';
import { policy } from '../config.ts';
import { compareText } from '../text-order.ts';

type JsonObject = Record<string, unknown>;

type CompetitorConfig = { name: string; domains: string[]; aliases: string[] };

export type ScoringConfig = {
  brandName: string;
  brandAliases: string[];
  productsServices: string[];
  provider: string;
  model: string;
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
      name: scalarText(item.name),
      aliases: truthyStrings([item.name, ...listOf(item.aliases)]),
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
    brandName: scalarText(config.brand_name),
    brandAliases: truthyStrings([config.brand_name, ...listOf(config.brand_aliases)]),
    productsServices: truthyStrings(listOf(config.products_services)),
    provider: scalarText(config.provider),
    model: scalarText(config.model),
    ownedDomains: listOf(config.owned_domains),
    unintendedDomains: listOf(config.unintended_domains),
    competitors: competitorConfigs(config),
  };
}

function domainIn(domain: string, targets: readonly unknown[]): boolean {
  return targets.some((target) => domainMatches(domain, target));
}

function urlDomain(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  try {
    return normalizeDomain(new URL(raw).hostname);
  } catch {
    return '';
  }
}

/** Publisher identity from the strongest URL evidence the citation carries. */
export function citationDomain(citation: JsonObject): string {
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

const rules = policy.audits.analysis;
const escapeRegex = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
function entityPresent(aliases: readonly string[], text: string): boolean {
  return aliases.some((alias) => {
    if (!rules.ambiguous_aliases.includes(normalizeAlias(alias))) return namesAlias(text, alias);
    const literal = escapeRegex(alias);
    return (
      new RegExp(`\\b${literal}\\s+Australia\\b`, 'iu').test(text) ||
      new RegExp(`\\b${literal}\\b(?!\\s+(?:audience|price|market|demographic))`, 'u').test(text)
    );
  });
}
function firstOffset(aliases: readonly string[], normalized: string) {
  const offsets = aliases
    .map((alias) => firstAliasOffset(alias, normalized))
    .filter((offset): offset is number => offset !== null);
  return offsets.length ? Math.min(...offsets) : null;
}
function classifyFanout(query: string) {
  const normalized = query.toLowerCase();
  return Object.entries(rules.fanout_feature_rules)
    .filter(([, needles]) =>
      needles.some((needle) =>
        needle.includes(' ')
          ? normalized.includes(needle)
          : ` ${normalized} `.includes(` ${needle} `),
      ),
    )
    .map(([name]) => name);
}

export function scoreExecution(input: {
  answerText: string;
  promptText: string;
  searchEvents: JsonObject[];
  citations: JsonObject[];
  searchUsed: boolean;
  queryTextAvailable: boolean;
  config: ScoringConfig;
}) {
  const { config, answerText, promptText, queryTextAvailable } = input;
  const normalized = normalizeAlias(answerText);
  const queryText = input.searchEvents.map((event) => scalarText(event.query)).join(' ');
  const promptBrand = entityPresent(config.brandAliases, promptText);
  const promptCompetitors = config.competitors
    .filter((c) => entityPresent(c.aliases, promptText))
    .map((c) => c.name);
  const mentioned = config.competitors.filter((c) => entityPresent(c.aliases, answerText));
  const offsets = Object.fromEntries(
    mentioned.map((c) => [c.name, firstOffset(c.aliases, normalized)]),
  );
  const citations = input.citations.map((c) => classifyCitation(c, config));
  const owned = citations.filter((c) => c.is_owned);
  const qualified = owned.filter((c) => {
    const text = `${scalarText(c.title)} ${scalarText(c.cited_text)}`;
    return (
      entityPresent(config.brandAliases, text) ||
      config.productsServices.some((term) => namesAlias(text, term))
    );
  });
  const brandOffset = firstOffset(config.brandAliases, normalized);
  return {
    search_used: input.searchUsed,
    search_query_count: input.searchEvents.length,
    search_query_text_available: queryTextAvailable,
    brand_mentioned: entityPresent(config.brandAliases, answerText),
    brand_first_offset: brandOffset,
    brand_injected_in_search: queryTextAvailable
      ? !promptBrand && entityPresent(config.brandAliases, queryText)
      : null,
    prompt_contains_brand: promptBrand,
    prompt_contains_competitor: Boolean(promptCompetitors.length),
    prompt_competitors: promptCompetitors,
    prompt_class: promptBrand
      ? promptCompetitors.length
        ? 'comparison_branded'
        : 'branded'
      : promptCompetitors.length
        ? 'mixed'
        : 'non_branded',
    owned_domain_cited: owned.length > 0,
    owned_citation_count: owned.length,
    qualified_owned_citation_count: qualified.length,
    qualified_owned_cited: qualified.length > 0,
    unintended_domain_cited: citations.some((c) => c.is_unintended),
    citation_count: citations.length,
    competitor_domains_cited: [
      ...new Set(
        citations.map((c) => c.matched_competitor).filter((name): name is string => name !== null),
      ),
    ].sort(compareText),
    competitors_mentioned: mentioned.map((c) => c.name),
    competitors_injected_in_search: queryTextAvailable
      ? config.competitors
          .filter((c) => !promptCompetitors.includes(c.name) && entityPresent(c.aliases, queryText))
          .map((c) => c.name)
      : [],
    competitor_first_offsets: offsets,
    brand_position: brandPosition(brandOffset, offsets),
    fanout_features: [
      ...new Set(input.searchEvents.flatMap((event) => classifyFanout(scalarText(event.query)))),
    ].sort(compareText),
  };
}
