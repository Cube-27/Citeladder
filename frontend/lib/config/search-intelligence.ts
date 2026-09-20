/** Mirrors the Search Intelligence request bounds. */
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
