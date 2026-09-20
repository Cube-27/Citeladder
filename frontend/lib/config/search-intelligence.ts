/** Mirrors the Search Intelligence request bounds. */
import { COUNTRY_OPTIONS } from '@/lib/setup/markets';

export const SEARCH_HANDOFF_MAX_ROWS = 100;
export const SEARCH_MAX_DEPTH = 1_000_000;
export const SEARCH_DEFAULT_DEPTHS = {
  footprint: 1,
  ranking_keywords: 200,
  keyword_suggestions: 150,
  backlink_summary: 1,
  referring_domains: 100,
  destination_pages: 100,
  missing_keywords: 100,
  shared_keywords: 100,
} as const;

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
