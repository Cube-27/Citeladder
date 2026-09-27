import {
  demandRecomputeResponseSchema,
  demandSignalSchema,
  demandSnapshotSchema,
} from '@citeladder/contracts/demand';
import { z } from 'zod';

const json = z.record(z.string(), z.unknown());
const datetime = z.iso.datetime({ offset: true });
export const demandSnapshot = demandSnapshotSchema.extend({
  window_start: z.iso.date(),
  window_end: z.iso.date(),
  created_at: datetime,
  signals: z
    .array(
      demandSignalSchema.extend({
        created_at: datetime,
        action_id: z.uuid().nullable().default(null),
      }),
    )
    .optional(),
});
export const recomputeResponse = demandRecomputeResponseSchema;
const recomputeDates = z.strictObject({ window_start: z.iso.date(), window_end: z.iso.date() });
export const recomputeBody = recomputeDates.refine((r) => r.window_end >= r.window_start, {
  path: ['window_end'],
  message: 'window_end must not be before window_start',
  when: (payload) => recomputeDates.safeParse(payload.value).success,
});
export const overrideBody = z.strictObject({
  query: z.string().min(1).max(512),
  classification: z.enum(['branded', 'non_branded', 'ambiguous']),
});
export const classificationResponse = z.object({
  normalized_query: z.string(),
  classification: overrideBody.shape.classification,
  matched_terms: z.array(z.string()),
  classifier_version: z.string(),
  override_id: z.uuid().nullable(),
});
const querySnapshot = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  window_start: z.iso.date(),
  window_end: z.iso.date(),
  source_hash: z.string(),
  supersedes_snapshot_id: z.uuid().nullable(),
  state: z.enum(['available', 'observed_zero', 'unavailable']),
  source_metric_row_ids: z.array(z.string()),
  source_artifact_ids: z.array(z.string()),
  coverage: json,
  limitations: z.array(z.string()),
  analyzer_version: z.string(),
  resolver_version: z.string(),
  created_at: datetime,
});
const queryRow = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  normalized_query: z.string(),
  observed_page_url: z.string(),
  site_url_id: z.uuid().nullable(),
  resolved_page_url: z.string(),
  resolution_outcome: z.enum(['exact', 'resolved', 'ambiguous', 'unresolved']),
  resolution_candidates: z.array(json),
  property_ref: z.string(),
  impressions: z.int(),
  clicks: z.int(),
  ctr: z.number().nullable(),
  position: z.number().nullable(),
  source_metric_row_id: z.uuid(),
  source_artifact_id: z.uuid(),
  importer_version: z.string(),
  resolver_version: z.string(),
});
export const queryPageResponse = z.object({
  snapshot: querySnapshot,
  items: z.array(queryRow),
  next_cursor: z.string().nullable(),
});
export const querySummaryResponse = z.object({
  snapshot: querySnapshot,
  counts_by_resolution: z.record(z.string(), z.int()),
});
