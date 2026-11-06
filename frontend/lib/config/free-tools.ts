/** Browser-only tool admission. No input is persisted or sent to a provider. */
export const FREE_TOOL_LIMITS = {
  text: 200_000,
  fileBytes: 1_000_000,
  sitemapUrls: 10_000,
  field: 2_000,
  imageBytes: 5_000_000,
} as const;

/** The count limits as copy writes them ("200,000"). */
export const FREE_TOOL_LIMIT_LABELS = {
  text: FREE_TOOL_LIMITS.text.toLocaleString('en-US'),
  sitemapUrls: FREE_TOOL_LIMITS.sitemapUrls.toLocaleString('en-US'),
} as const;
