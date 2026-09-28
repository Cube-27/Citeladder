/**
 * Request bodies and server-only responses of the `opportunities` family.
 * Responses the browser reads are the shared `@citeladder/contracts` schemas.
 */
import { z } from 'zod';

const json = z.record(z.string(), z.unknown());
const nullableUuid = z.uuid().nullable();
const ints = z.record(z.string(), z.int());

const snapshotFields = {
  audit_id: nullableUuid,
  site_crawl_id: nullableUuid,
  demand_snapshot_id: nullableUuid,
  demand_source_revision: z.string().nullable(),
  coverage: json,
  limitations: z.array(z.string()),
  source_mix: json,
  action_path_mix: json,
  domain_rollups: z.array(json),
  counts_by_type: ints,
  counts_by_severity: ints,
  total_count: z.int(),
  median_priority: z.number().nullable(),
  analyzer_version: z.string(),
  rule_version: z.string(),
  formula_version: z.string(),
};

export const recomputeResponse = z.object({
  id: z.uuid(),
  run_id: z.uuid(),
  ...snapshotFields,
  created_at: z.string(),
});

export const recomputeRequest = z
  .strictObject({
    audit_id: nullableUuid.default(null),
    site_crawl_id: nullableUuid.default(null),
  })
  .nullable()
  .optional();

export const historyResponse = z.object({
  items: z.array(
    z.object({
      rule_id: z.string(),
      target_key: z.string(),
      title: z.string(),
      current_state: z.string(),
      transition: z.string(),
      occurrence_count: z.int(),
      first_seen: z.string(),
      last_seen: z.string(),
      timeline: z.array(z.object({ id: z.uuid(), seen_at: z.string() })),
    }),
  ),
  since_previous: ints,
});

export const orderUpdate = z.strictObject({
  ordered_opportunity_ids: z.array(z.uuid()),
  expected_version: z.int().min(0),
});

/** A file download publishes no JSON schema. */
export const fileResponse = z.unknown();
