/** Answer formats read from scraper artifacts and fanout search terms (AV-8). */
import type { AnswerFormat } from '@citeladder/contracts/audits';

export const answerEvidence = {
  /** Scraper item types that mark each answer format, in display order. */
  format_markers: {
    shopping: ['chat_gpt_products'],
    map: ['chat_gpt_local_businesses'],
    comparison: ['chat_gpt_table', 'gemini_table'],
    image: ['chat_gpt_images', 'gemini_images'],
  } satisfies Record<AnswerFormat, readonly string[]>,
  /** Paid placements are never an answer format or an in-text link. */
  ad_item_types: ['chat_gpt_ad'],
  max_item_depth: 32,
  fanout_terms: {
    min_term_length: 2,
    /**
     * Function and question words only: intent words such as "best", "top" or
     * "vs" are what engines search for. Bare numbers and years are dropped too.
     */
    stop_words: [
      ...['a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could'],
      ...['did', 'do', 'does', 'each', 'every', 'for', 'from', 'get', 'had', 'has', 'have'],
      ...['how', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our'],
      ...['should', 'so', 'than', 'that', 'the', 'their', 'them', 'there', 'these', 'they'],
      ...['this', 'those', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which'],
      ...['who', 'whom', 'whose', 'why', 'will', 'with', 'would', 'you', 'your'],
    ],
    /** Words ending in "s" that are not plurals, kept as they are. */
    plural_exceptions: ['news', 'saas', 'series', 'species'],
    /** Rows each of Top, Rising and Falling serves. */
    list_limit: 10,
  },
} as const;
