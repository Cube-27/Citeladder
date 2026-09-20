/** Mirrors the Search Intelligence request bounds. */
import { COUNTRY_OPTIONS } from '@/lib/setup/markets';

export const SEARCH_HANDOFF_MAX_ROWS = 100;
export const SEARCH_MAX_DEPTH = 1_000_000;
export type SearchColumn = {
  field: string;
  label: string;
  numeric?: boolean;
  detail?: boolean;
  precision?: number;
};
export const SEARCH_COLUMNS_BY_KIND: Record<string, SearchColumn[]> = {
  footprint: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
    { field: 'intent', label: 'Intent' },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  ranking_keywords: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'rank_group', label: 'Position', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'url', label: 'Ranking page' },
    { field: 'etv', label: 'Est. traffic', numeric: true },
    { field: 'cpc', label: 'CPC (USD)', numeric: true, precision: 2 },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
    { field: 'intent', label: 'Intent' },
  ],
  keyword_suggestions: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
    { field: 'intent', label: 'Intent' },
  ],
  missing_keywords: [
    { field: 'keyword', label: 'Missing keyword' },
    { field: 'owned_rank_group', label: 'Owned rank', numeric: true },
    { field: 'rank_group', label: 'Competitor rank', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
  ],
  shared_keywords: [
    { field: 'keyword', label: 'Shared keyword' },
    { field: 'owned_rank_group', label: 'Owned rank', numeric: true },
    { field: 'rank_group', label: 'Competitor rank', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
  ],
  referring_domains: [
    { field: 'domain', label: 'Referring domain' },
    { field: 'backlinks', label: 'Backlinks', numeric: true },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  destination_pages: [
    { field: 'url', label: 'Destination page' },
    { field: 'backlinks', label: 'Backlinks', numeric: true },
    { field: 'referring_domains', label: 'Referring domains', numeric: true },
    { field: 'referring_main_domains', label: 'Referring root domains', numeric: true },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  citation_matches: [
    { field: 'domain', label: 'Cited domain' },
    { field: 'url', label: 'Cited URL' },
  ],
  organic_pages: [
    { field: 'url', label: 'Organic page' },
    { field: 'organic_keywords', label: 'Organic keywords', numeric: true },
    { field: 'etv', label: 'Est. traffic', numeric: true },
  ],
  backlinks: [
    { field: 'url_from', label: 'Source URL', detail: true },
    { field: 'url', label: 'Destination' },
    { field: 'anchor', label: 'Anchor', detail: true },
    { field: 'dofollow', label: 'Follow', detail: true },
    { field: 'dataforseo_rank', label: 'Link rank (0–100)', numeric: true },
    { field: 'backlinks_spam_score', label: 'Spam', numeric: true },
  ],
};

export const SEARCH_DEFAULT_DEPTHS = {
  footprint: 1,
  ranking_keywords: 200,
  keyword_suggestions: 150,
  backlink_summary: 1,
  referring_domains: 100,
  destination_pages: 100,
  missing_keywords: 100,
  shared_keywords: 100,
  organic_pages: 100,
  backlinks: 100,
  backlink_history: 13,
} as const;

export function searchScopeLabel(scope?: string): string {
  return scope === 'domain_subdomains' ? 'Domain + subdomains' : 'Exact host';
}

// Mirrors the curated DataForSEO location codes in backend/app/core/config/dataforseo.py.
const SEARCH_LOCATION_COUNTRIES: Record<number, string> = {
  2840: 'US',
  2826: 'GB',
  2036: 'AU',
  2124: 'CA',
  2356: 'IN',
  2554: 'NZ',
  2372: 'IE',
  2702: 'SG',
  2710: 'ZA',
  2276: 'DE',
  2250: 'FR',
  2528: 'NL',
  2784: 'AE',
};

export function searchMarketLabel(locationCode: number | null): string {
  if (locationCode === null) return 'Market not set';
  const countryCode = SEARCH_LOCATION_COUNTRIES[locationCode];
  return (
    COUNTRY_OPTIONS.find(({ value }) => value === countryCode)?.label ??
    `Location code ${locationCode}`
  );
}

export const SEARCH_MARKET_OPTIONS = Object.keys(SEARCH_LOCATION_COUNTRIES).map((value) => ({
  value,
  label: searchMarketLabel(Number(value)),
}));
