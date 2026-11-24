import type { SourceClass, SourcePattern } from '@citeladder/contracts/opportunities';
import { policy } from '../../config.ts';
import { domainMatches, normalizeDomain, siteDomain } from '../domains.ts';
import { aliasSpellings, CONNECTOR } from '../aliases.ts';
import { casefold } from '../../casefold.ts';
import type { ScoringConfig } from '../scoring.ts';
import type { CitationEvidence } from './evidence.ts';
import { compareText } from '../../text-order.ts';
const p = policy.opportunity.source_patterns;
function isGoogleSearchSurface(domain: string): boolean {
  const [first, secondLevel, ...rest] = domain.split('.');
  if (first !== 'google' || secondLevel === undefined) return false;
  return (
    rest.length === 0 || (rest.length === 1 && p._PUBLIC_SECOND_LEVEL_LABELS.includes(secondLevel))
  );
}
export function classifySourceOrigin(domain: string): string {
  const normalized = normalizeDomain(domain);
  return isGoogleSearchSurface(normalized) || p.GOOGLE_OWNED_PLATFORM_DOMAINS.includes(normalized)
    ? p.SOURCE_ORIGIN_GOOGLE_OWNED
    : p.SOURCE_ORIGIN_EXTERNAL;
}
const compact = (value: string) => casefold(value).replaceAll(/[^\p{L}\p{N}]/gu, '');
function profileHandle(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const rule = p.SOCIAL_PROFILE_PATHS.find(([domain]) => domainMatches(parsed.hostname, domain));
  const handle = rule && new RegExp(rule[1], 'u').exec(parsed.pathname)?.[1];
  return handle ? compact(handle) : null;
}
function handlesOf(names: readonly string[], domains: readonly unknown[]): Set<string> {
  const spelled = names
    .flatMap(aliasSpellings)
    .flatMap((words) => [
      compact(words.join('')),
      compact(words.filter((word) => word !== CONNECTOR).join('')),
    ]);
  const labels = domains.flatMap((domain) => siteDomain(domain)?.split('.')[0] ?? []);
  return new Set([...spelled, ...labels.map(compact)].filter(Boolean));
}
export function profileOwner(
  url: string,
  config: Pick<ScoringConfig, 'brandAliases' | 'ownedDomains' | 'competitors'>,
): { owned: boolean; competitor: string | null } {
  const handle = profileHandle(url);
  if (!handle) return { owned: false, competitor: null };
  if (handlesOf(config.brandAliases, config.ownedDomains).has(handle))
    return { owned: true, competitor: null };
  const rival = config.competitors.find((item) =>
    handlesOf(item.aliases, item.domains).has(handle),
  );
  return { owned: false, competitor: rival?.name ?? null };
}
export function classifySourceDomain(
  domain: string,
  owned: boolean,
  competitor: string | null,
): SourceClass {
  if (owned) return p.SOURCE_CLASS_BRAND_OWNED;
  if (competitor) return p.SOURCE_CLASS_COMPETITOR_OWNED;
  const normalized = normalizeDomain(domain);
  if (isGoogleSearchSurface(normalized)) return p.SOURCE_CLASS_SEARCH_SURFACE;
  for (const [kind, domains] of p.SOURCE_CLASS_DOMAIN_TABLES) {
    if (domains.some((d) => domainMatches(normalized, d))) return kind;
  }
  return p.SOURCE_CLASS_OTHER_THIRD_PARTY;
}
export function byDomain(
  citations: CitationEvidence[],
): Map<string, [SourceClass, CitationEvidence]> {
  const found = new Map<string, [SourceClass, CitationEvidence]>();
  for (const citation of citations) {
    const domain = normalizeDomain(citation.domain) || normalizeDomain(citation.url);
    if (domain && !found.has(domain))
      found.set(domain, [
        classifySourceDomain(domain, citation.is_owned, citation.matched_competitor),
        citation,
      ]);
  }
  return found;
}
export function summarizeSourcePattern(citations: CitationEvidence[]): SourcePattern {
  const domains = byDomain(citations);
  const counts = new Map<SourceClass, number>();
  const competitors = new Map<string, string[]>();
  const independent = new Set<string>();
  const independentClasses = new Set<string>([
    p.SOURCE_CLASS_REVIEW_MARKETPLACE,
    p.SOURCE_CLASS_EDITORIAL_THIRD_PARTY,
    p.SOURCE_CLASS_COMMUNITY,
    p.SOURCE_CLASS_SOCIAL,
    p.SOURCE_CLASS_INSTITUTIONAL,
    p.SOURCE_CLASS_VIDEO,
    p.SOURCE_CLASS_OTHER_THIRD_PARTY,
  ]);
  for (const [domain, [kind, citation]] of domains) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (independentClasses.has(kind)) independent.add(domain);
    if (citation.matched_competitor) {
      const list = competitors.get(citation.matched_competitor) ?? [];
      list.push(domain);
      competitors.set(citation.matched_competitor, list);
    }
  }
  const patterns: string[] = [];
  if (counts.has(p.SOURCE_CLASS_COMPETITOR_OWNED))
    patterns.push(p.PATTERN_COMPETITOR_OWNED_SOURCES);
  if (
    counts.has(p.SOURCE_CLASS_REVIEW_MARKETPLACE) ||
    counts.has(p.SOURCE_CLASS_EDITORIAL_THIRD_PARTY)
  )
    patterns.push(p.PATTERN_INDEPENDENT_VALIDATION);
  if (counts.has(p.SOURCE_CLASS_COMMUNITY)) patterns.push(p.PATTERN_COMMUNITY_EVIDENCE);
  if (counts.has(p.SOURCE_CLASS_VIDEO)) patterns.push(p.PATTERN_VIDEO_EVIDENCE);
  if (independent.size >= p.MULTIPLE_INDEPENDENT_DOMAIN_MIN)
    patterns.push(p.PATTERN_MULTIPLE_INDEPENDENT_DOMAINS);
  const rank = (kind: SourceClass) => p.SOURCE_CLASS_ORDER.indexOf(kind);
  const ordered = [...domains].sort(
    ([a, [ak]], [b, [bk]]) => rank(ak) - rank(bk) || compareText(a, b),
  );
  return {
    taxonomy_version: p.SOURCE_TAXONOMY_VERSION,
    distinct_domain_count: domains.size,
    independent_domain_count: independent.size,
    class_counts: Object.fromEntries(
      p.SOURCE_CLASS_ORDER.filter((k) => counts.has(k)).map((k) => [k, counts.get(k)]),
    ),
    observed_patterns: patterns,
    competitor_source_domains: Object.fromEntries(
      [...competitors]
        .sort(([a], [b]) => compareText(a, b))
        .map(([name, list]) => [name, list.toSorted(compareText)]),
    ),
    top_citations: ordered.slice(0, p.MAX_TOP_CITATIONS).map(([domain, [source_class, c]]) => ({
      domain,
      url: c.url,
      title: c.title,
      source_class,
      matched_competitor: c.matched_competitor,
    })),
    top_citations_truncated: ordered.length > p.MAX_TOP_CITATIONS,
    recommended_action:
      p.PATTERN_TO_ACTION.find(([pattern]) => patterns.includes(pattern!))?.[1] ?? p.ACTION_DEFAULT,
  };
}
