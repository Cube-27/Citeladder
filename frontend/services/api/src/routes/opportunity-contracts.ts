/**
 * The `opportunities` family's published schemas, which the browser's
 * contracts consume.
 */
import { z } from 'zod';

const json = z.record(z.string(), z.unknown());
const nullableUuid = z.uuid().nullable();
const ints = z.record(z.string(), z.int());

export const opportunityItem = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  rule_id: z.string(),
  opportunity_type: z.string(),
  severity: z.string(),
  priority_score: z.number(),
  title: z.string(),
  target_key: z.string(),
  target_prompt_id: nullableUuid,
  target_url: z.string().nullable(),
  target_theme: z.string().nullable(),
  target_label: z.string().nullable(),
  action_id: nullableUuid,
  system_rank: z.int().default(0),
  display_rank: z.int().default(0),
  order_source: z.enum(['system', 'manual']).default('system'),
  priority_factors: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  evidence_summary: z.record(z.string(), z.union([z.int(), z.array(z.string())])).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const opportunityDetail = opportunityItem.extend({
  remediation: z.string(),
  evidence: json,
  source_analysis_ids: z.array(z.string()),
  source_issue_ids: z.array(z.string()),
  source_metric_ids: z.array(z.string()),
  source_traffic_ids: z.array(z.string()),
  analyzer_version: z.string(),
  rule_version: z.string(),
  formula_version: z.string(),
  content_handoff: json,
  superseded_by_id: nullableUuid,
  superseded_at: z.string().nullable(),
});

export const opportunitiesPage = z.object({
  items: z.array(opportunityItem),
  next_cursor: z.string().nullable(),
});

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

export const opportunitySummary = z.object({
  computed: z.boolean(),
  run_id: nullableUuid,
  ...snapshotFields,
  computed_at: z.string().nullable(),
  evidence_updated_at: z.string().nullable(),
  stale: z.boolean(),
  activation_state: z.enum(['waiting_for_evidence', 'queued', 'refreshing', 'ready', 'delayed']),
});

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

export const orderResponse = z.object({
  version: z.int(),
  ordered_opportunity_ids: z.array(z.uuid()),
});

/** FastAPI publishes a `Response`-returning route as an empty JSON schema. */
export const fileResponse = z.unknown();
