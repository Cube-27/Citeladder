/** Browser-only tool admission. No input is persisted or sent to a provider. */
export const FREE_TOOL_LIMITS = {
  text: 200_000,
  fileBytes: 1_000_000,
  sitemapUrls: 10_000,
  field: 2_000,
  imageBytes: 5_000_000,
} as const;
