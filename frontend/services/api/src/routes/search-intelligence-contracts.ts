/** Search Intelligence request bodies and the server-only handoff response. */
import { searchDatasetSchema } from '@citeladder/contracts/search-intelligence';
import { z } from 'zod';

import { policy } from '../config.ts';

const si = policy.search_intelligence;
const researchScope = searchDatasetSchema.shape.research_scope;

/** Saved acquisition defaults; omitted fields take the policy defaults. */
export const preferencesBody = z.object({
  research_scope: researchScope.default(researchScope.parse(si.default_research_scope)),
  owned_target_id: z.string().nullable().default(null),
  competitor_ids: z.array(z.uuid()).default([]),
  location_code: z.int().positive().nullable().default(null),
  language_code: z.string().max(16).default(''),
  reuse_recent: z.boolean().default(true),
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

export const contentHandoffBody = z.object({
  dataset_id: z.uuid(),
  row_ids: z.array(z.uuid()).min(1).max(100),
});

export const contentHandoffResponse = z.object({
  project_id: z.uuid(),
  dataset_id: z.uuid(),
  row_ids: z.array(z.uuid()),
  evidence: z.array(z.record(z.string(), z.unknown())),
});

export const citationMatchBody = z.object({
  backlink_dataset_id: z.uuid(),
  audit_ids: z.array(z.uuid()).min(1).max(50),
});
