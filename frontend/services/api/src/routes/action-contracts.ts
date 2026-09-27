/** Wire schemas frozen at the Action family cutover. */
import { z } from 'zod';
import { policy } from '../config.ts';
import { opportunityItem } from './opportunity-contracts.ts';

const json = z.record(z.string(), z.unknown());
const datetime = z.iso.datetime({ offset: true });
const nullableUuid = z.uuid().nullable();
export const actionItem = z.strictObject({
  id: z.uuid(),
  project_id: z.uuid(),
  target_kind: z.string(),
  target_label: z.string(),
  target_url: z.string().nullable(),
  target_prompt_id: nullableUuid,
  origin: z.string(),
  status: z.string(),
  priority_score: z.number().nullable(),
  families: z.array(z.string()),
  approach: z.string(),
  skill_id: z.string(),
  member_count: z.int(),
  evidence_cleared_at: datetime.nullable(),
  created_at: datetime,
  updated_at: datetime,
});
export const actionsPage = z.strictObject({
  items: z.array(actionItem),
  next_cursor: z.string().nullable().default(null),
  status_counts: z.record(z.string(), z.int()),
});
export const statusPatch = z.strictObject({
  status: z
    .string()
    .refine(
      (value) => policy.opportunity.actions.ACTION_USER_STATUSES.includes(value),
      'Status must be open or dismissed',
    ),
});
export const declarationCreate = z.strictObject({
  output_revision_id: nullableUuid.default(null),
  declared_implemented_at: datetime.refine(
    (value) => !value.startsWith('0000-'),
    'A valid calendar year is required',
  ),
});
const verification = z.object({
  id: z.uuid(),
  observation_kind: z.enum(['observed', 'verified', 'contradicted']),
  observed_at: datetime,
  crawl_id: nullableUuid,
  audit_id: nullableUuid,
  source_analysis_ids: z.array(z.uuid()),
  source_rule_evaluation_ids: z.array(z.uuid()),
  source_metric_ids: z.array(z.uuid()),
  result: json,
  verifier_version: z.string(),
  limitations: z.array(z.string()),
  created_at: datetime,
});
const leg = z.strictObject({
  leg: z.enum([
    'next_visibility_run',
    'next_search_console_window',
    'next_crawl',
    'placement_recheck',
  ]),
  state: z.enum(['waiting', 'not_scheduled', 'sync_needed', 'observed']),
  due_at: datetime.nullable(),
  last_evidence_at: datetime.nullable(),
  source_id: nullableUuid,
});
export const declarationView = z.strictObject({
  id: z.uuid(),
  action_id: z.uuid(),
  output_revision_id: nullableUuid,
  member_opportunity_ids: z.array(z.uuid()),
  opportunity_snapshot_id: z.uuid(),
  target_site_url_ids: z.array(z.uuid()),
  target_external_url: z.string().nullable(),
  declared_implemented_at: datetime,
  expected_checks: z.array(json),
  state: z.enum(['declared', 'observed', 'verified', 'contradicted']),
  limitations: z.array(z.string()),
  verification_events: z.array(verification),
  legs: z.array(leg),
  created_at: datetime,
});
export const actionDetail = actionItem.extend({
  diagnosis: json,
  members: z.array(opportunityItem),
  declaration: declarationView.nullable(),
});
