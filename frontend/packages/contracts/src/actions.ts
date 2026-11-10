import { z } from 'zod';

import {
  expectedCheckSchema,
  implementationStateSchema,
  opportunitySchema,
  verificationEventSchema,
} from './opportunities.ts';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// open → in progress → implemented (declared) → measuring → done | dismissed.
// A user stores `open` or `dismissed` and a declaration stores `implemented`;
// `in_progress`, `measuring` and `done` are derived by the server.
export const actionStatusSchema = z.enum([
  'open',
  'in_progress',
  'implemented',
  'measuring',
  'done',
  'dismissed',
]);

// The screen an Action belongs to, derived at every refresh: `content` for a
// content page or a content-gap planned page, `actions` for everything else.
export const actionSurfaceSchema = z.enum(['actions', 'content']);
export type ActionSurface = z.infer<typeof actionSurfaceSchema>;

// One unit of work per target, projected from persisted Action rows.
export const actionItemSchema = responseObject({
  id: uuid(),
  project_id: uuid(),
  surface: actionSurfaceSchema,
  target_kind: z.string(),
  target_label: z.string(),
  target_url: z.string().nullable(),
  target_prompt_id: uuid().nullable(),
  origin: z.enum(['evidence', 'agent']),
  status: actionStatusSchema,
  priority_score: z.number().nullable(),
  families: z.array(z.string()),
  approach: z.string(),
  skill_id: z.string(),
  member_count: z.number().int(),
  evidence_cleared_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const diagnosisMemberSchema = responseObject({
  opportunity_id: uuid(),
  rule_id: z.string(),
  title: z.string(),
  family: z.string(),
  priority_score: z.number(),
});

// The deterministic diagnosis persisted at recompute. An agent-origin Action
// with no evidence yet carries an empty object, so every field is optional.
const actionDiagnosisSchema = responseObject({
  what_happened: z.array(diagnosisMemberSchema).optional(),
  approach: z.string().optional(),
  skill_id: z.string().optional(),
  donts: z.array(z.string()).optional(),
  measure_with: z.array(z.string()).optional(),
});

// What one loop leg of a declared Action is waiting for (plan §9).
export const measurementLegSchema = responseObject({
  leg: z.enum(['next_visibility_run', 'next_search_console_window', 'next_crawl']),
  state: z.enum(['waiting', 'not_scheduled', 'sync_needed', 'observed']),
  due_at: z.string().nullable(),
  last_evidence_at: z.string().nullable(),
  // The crawl, audit, traffic snapshot or schedule behind it.
  source_id: uuid().nullable(),
});

// One expected check's latest reading. Each check keeps the state its own
// evidence last gave it, so a crawl and a Search Console window together can
// settle a page Action that neither settles alone.
export const declarationCheckSchema = responseObject({
  index: z.number().int(),
  kind: z.string(),
  leg: measurementLegSchema.shape.leg,
  // `waiting`: no comparable reading yet. `unavailable`: the reading could not
  // answer, with `reason`. `met` / `unmet`: the reading answered.
  state: z.enum(['waiting', 'met', 'unmet', 'unavailable']),
  reason: z.string().nullable(),
  observed_at: z.string().nullable(),
  // The exact source of that reading: a crawl, audit, traffic snapshot or
  // Search Intelligence dataset.
  source_kind: z.string().nullable(),
  source_id: z.string().nullable(),
  // What the check names: a rule, a prompt's text, a page or query, or a link.
  subject: z.string().nullable(),
  // The tracked prompt a visibility check measures, whose history it links to.
  prompt_id: uuid().nullable().optional(),
});

// The user's declaration, frozen server-side: members, targets and checks.
export const actionDeclarationSchema = responseObject({
  id: uuid(),
  action_id: uuid(),
  output_revision_id: uuid().nullable(),
  member_opportunity_ids: z.array(uuid()),
  opportunity_snapshot_id: uuid(),
  target_site_url_ids: z.array(uuid()),
  // Populated instead of the owned ids for an earned Action: the publisher
  // page the listing was requested on. Never both.
  target_external_url: z.string().nullable(),
  declared_implemented_at: z.string(),
  expected_checks: z.array(expectedCheckSchema),
  state: implementationStateSchema,
  limitations: z.array(z.string()),
  verification_events: z.array(verificationEventSchema),
  legs: z.array(measurementLegSchema),
  checks: z.array(declarationCheckSchema),
  // When new evidence stops re-checking this declaration.
  measured_until: z.string(),
  created_at: z.string(),
});

export const actionDetailSchema = actionItemSchema.extend({
  // Per member opportunity id: the reading that would measure it once
  // declared, or null when no automatic check applies.
  member_measurement: z.record(z.string(), measurementLegSchema.shape.leg.nullable()),
  // The earliest implementation time a declaration accepts.
  declarable_since: z.string(),
  diagnosis: actionDiagnosisSchema,
  // Each live finding with what to do about it.
  members: z.array(opportunitySchema.extend({ remediation: z.string() })),
  declaration: actionDeclarationSchema.nullable(),
});

/** The two content-gap rules (content optimization section 2). */
export const contentGapRuleSchema = z.enum(['content_gap_improve_page', 'content_gap_new_page']);

// One live content-gap finding of an Action, as its evidence states it: the
// angle and its counts. Counts only, never a score (CO14).
export const actionContentGapSchema = responseObject({
  opportunity_id: uuid(),
  rule_id: contentGapRuleSchema,
  angle_label: z.string(),
  prompt_count: z.number().int(),
  citation_count: z.number().int(),
  domain_count: z.number().int(),
  competitor_count: z.number().int(),
});
export type ActionContentGap = z.infer<typeof actionContentGapSchema>;

// A list row: the Action plus its content-gap findings, most cited first
// (empty for an Action without one).
export const actionListItemSchema = actionItemSchema.extend({
  content_gaps: z.array(actionContentGapSchema),
});

// The content-gap evidence the latest Opportunity refresh read: a current
// content-angle run, one too old to use, or none computed yet. Each is a
// distinct empty Content optimization list, never "no gaps".
export const contentGapSourceStateSchema = z.enum(['current', 'out_of_date', 'not_computed']);
export type ContentGapSourceState = z.infer<typeof contentGapSourceStateSchema>;

export const actionsPageSchema = responseObject({
  items: z.array(actionListItemSchema),
  next_cursor: z.string().nullable(),
  status_counts: z.record(z.string(), z.number().int()),
  // Set for `surface=content` only; null for the other lists.
  content_gap_source: contentGapSourceStateSchema.nullable(),
});

/** The statuses a user may store; the rest are derived or declared. */
export const actionUserStatusSchema = actionStatusSchema.extract(['open', 'dismissed']);
export type ActionUserStatus = z.infer<typeof actionUserStatusSchema>;

export const actionStatusUpdateRequestSchema = z.strictObject({ status: actionUserStatusSchema });
export type ActionStatusUpdateRequest = z.input<typeof actionStatusUpdateRequestSchema>;

/**
 * An implementation declaration. Targets and expected checks are server-owned;
 * the user names the recommendations done, the revision shipped (null for
 * work done outside CiteLadder) and when it went live.
 */
export const actionDeclarationRequestSchema = z.strictObject({
  recommendation_ids: z.array(uuid()).max(100).default([]),
  output_revision_id: uuid().nullable().default(null),
  declared_implemented_at: z.iso
    .datetime({ offset: true })
    .refine((value) => !value.startsWith('0000-'), 'A valid calendar year is required'),
});
export type ActionDeclarationRequest = z.input<typeof actionDeclarationRequestSchema>;
