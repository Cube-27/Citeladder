/** Search Intelligence request bodies, bounded by the configured policy. */
import { searchDatasetSchema } from '@citeladder/contracts/search-intelligence';
import {
  searchCitationMatchRequestSchema,
  searchDatasetSelectionRequestSchema,
  searchPreferencesRequestSchema,
  searchReviewRequestSchema,
} from '@citeladder/contracts/search-intelligence-requests';
import { z } from 'zod';

import { policy } from '../config.ts';

const si = policy.search_intelligence;
const researchScope = searchDatasetSchema.shape.research_scope;

/** Saved acquisition defaults; omitted fields take the policy defaults. */
export const preferencesBody = searchPreferencesRequestSchema.extend({
  research_scope: researchScope.default(researchScope.parse(si.default_research_scope)),
  depths: z
    .record(z.string(), z.int().min(1).max(si.max_depth))
    .refine(
      (depths) => Object.keys(depths).every((kind) => Object.hasOwn(si.default_depths, kind)),
      {
        message: 'Depths are accepted only for list datasets',
      },
    )
    .default(() => ({ ...si.default_depths })),
});
export type Preferences = z.output<typeof preferencesBody>;

const datasetSelection = searchDatasetSelectionRequestSchema
  .extend({
    kind: z.enum([
      'footprint',
      'ranking_keywords',
      'missing_keywords',
      'shared_keywords',
      'keyword_suggestions',
      'backlink_summary',
      'referring_domains',
      'destination_pages',
      'organic_pages',
      'backlinks',
      'backlink_history',
    ]),
    depth: z.int().min(1).max(si.max_depth).default(1),
  })
  .superRefine((item, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    const comparison = ['missing_keywords', 'shared_keywords'].includes(item.kind);
    const keyword = [
      'ranking_keywords',
      'missing_keywords',
      'shared_keywords',
      'keyword_suggestions',
    ].includes(item.kind);
    const competitor =
      comparison ||
      [
        'footprint',
        'backlink_summary',
        'referring_domains',
        'destination_pages',
        'organic_pages',
        'backlinks',
        'backlink_history',
      ].includes(item.kind);
    if (comparison && !item.competitor_id) fail('Comparison requires one competitor');
    if (item.competitor_id && !competitor) fail('Dataset does not support a competitor target');
    if (!keyword && (item.order !== 'volume' || item.min_volume !== null))
      fail('Acquisition controls require a keyword dataset');
    if (item.kind === 'keyword_suggestions' && ['traffic', 'position'].includes(item.order))
      fail('Suggestions have no observed position or traffic');
    if (item.kind === 'keyword_suggestions' ? !item.seed.trim() : Boolean(item.seed))
      fail('Seed is required only for keyword suggestions');
    if (item.kind === 'backlinks' && item.depth > si.backlink_max_offset + si.page_size)
      fail('Backlinks depth exceeds supported offsets');
  });
export const reviewBody = searchReviewRequestSchema.extend({
  datasets: z.array(datasetSelection).min(1).max(25),
});
export type ReviewInput = z.output<typeof reviewBody>;

export const citationMatchBody = searchCitationMatchRequestSchema;
