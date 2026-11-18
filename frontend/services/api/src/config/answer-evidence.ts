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
    /** Function words only: intent words such as "best" or "vs" are what engines search for. */
    stop_words: [
      'a',
      'an',
      'and',
      'are',
      'as',
      'at',
      'be',
      'by',
      'do',
      'does',
      'for',
      'from',
      'in',
      'is',
      'it',
      'its',
      'of',
      'on',
      'or',
      'the',
      'to',
      'with',
    ],
    max_terms_per_audit: 500,
    /** Rows each of Top, Rising and Falling serves. */
    list_limit: 10,
  },
} as const;
