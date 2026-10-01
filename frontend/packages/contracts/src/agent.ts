import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// Queue-row lifecycle shared by every leased task.
export const agentRunStatusSchema = z.enum([
  'queued',
  'leased',
  'running',
  'retry_wait',
  'succeeded',
  'failed',
  'cancelled',
]);

// One committed step of an active run: a model call still in flight
// (`working`), a receipt still being processed (`processing`), an earlier
// step that returned without reading (`reasoned`), or a read's
// outcome (`completed`, `unavailable`, `failed`, `refused`).
export const agentRunStepSchema = responseObject({
  ordinal: z.number().int(),
  status: z.string(),
  tool: z.string().nullable(),
  model_attempt_id: uuid(),
  tool_attempt_id: uuid().nullable(),
  run_attempt: z.number().int(),
  runtime_version: z.string(),
  protocol_version: z.string(),
  registry_version: z.string(),
  skill_catalog_version: z.string(),
  projection_version: z.string(),
});

export const agentRunSchema = responseObject({
  id: uuid(),
  status: agentRunStatusSchema,
  mode: z.enum(['turn', 'draft_from_outline']),
  skill_id: z.string().nullable(),
  skill_source: z.string().nullable(),
  steps_used: z.number().int(),
  error_code: z.string(),
  error_detail: z.string(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  progress: z.array(agentRunStepSchema).default([]),
});

export const agentOutputPhaseSchema = z.enum(['outline', 'draft', 'final']);

export const agentRevisionSchema = responseObject({
  id: uuid(),
  number: z.number().int(),
  parent_revision_id: uuid().nullable(),
  author: z.enum(['agent', 'user']),
  phase: agentOutputPhaseSchema,
  title: z.string(),
  body: z.string(),
  source_refs: z.array(z.string()),
  approved_at: z.string().nullable(),
  created_at: z.string(),
});

export const agentOutputSchema = responseObject({
  id: uuid(),
  action_id: uuid().nullable(),
  kind: z.string(),
  skill_id: z.string(),
  format_id: z.string().nullable(),
  target_kind: z.string().nullable(),
  target_label: z.string().nullable(),
  phase: agentOutputPhaseSchema,
  latest_revision: agentRevisionSchema.nullable(),
});

// A step summary is `{kind: 'skill', skill_id}` or `{kind: 'tool', tool, status}`.
const agentStepSchema = responseObject({
  kind: z.string(),
  skill_id: z.string().optional(),
  tool: z.string().optional(),
  status: z.string().optional(),
});

export const agentMessageSchema = responseObject({
  id: uuid(),
  sequence: z.number().int(),
  role: z.enum(['user', 'agent']),
  content: z.string(),
  skill_id: z.string().nullable(),
  skill_source: z.string().nullable(),
  evidence_refs: z.array(z.string()),
  steps: z.array(agentStepSchema),
  // Actions a user message @-mentioned, as resolved when it was sent.
  mentions: z
    .array(responseObject({ kind: z.string(), id: uuid(), label: z.string() }))
    .default([]),
  created_at: z.string(),
});

export const agentChatSummarySchema = responseObject({
  id: uuid(),
  project_id: uuid(),
  action_id: uuid().nullable(),
  target_label: z.string().nullable(),
  title: z.string(),
  turn_count: z.number().int(),
  output_kind: z.string().nullable(),
  output_phase: agentOutputPhaseSchema.nullable(),
  last_activity_at: z.string(),
  created_at: z.string(),
});

export const agentChatsPageSchema = responseObject({
  items: z.array(agentChatSummarySchema),
  next_cursor: z.string().nullable(),
});

export const agentChatDetailSchema = responseObject({
  chat: agentChatSummarySchema,
  pinned_skill_id: z.string().nullable(),
  context: z.record(z.string(), z.unknown()),
  messages: z.array(agentMessageSchema),
  latest_run: agentRunSchema.nullable(),
  output: agentOutputSchema.nullable(),
});

export const agentTurnAcceptedSchema = responseObject({
  chat_id: uuid(),
  run: agentRunSchema,
});

export const agentRevisionsPageSchema = responseObject({
  items: z.array(agentRevisionSchema),
});

export const agentSkillSchema = responseObject({
  id: z.string(),
  label: z.string(),
  group: z.string(),
  output_kind: z.string(),
  description: z.string(),
});

export const agentSkillCatalogSchema = responseObject({
  skills: z.array(agentSkillSchema),
});

export const agentInstructionsSchema = responseObject({
  revision: z.number().int().nullable(),
  text: z.string(),
  created_at: z.string().nullable(),
});

export const agentSiteHealthReferenceSchema = z.object({
  project_id: uuid(),
  crawl_id: uuid(),
  site_url_id: uuid(),
  source_analysis_id: uuid(),
  dimension: z.string().min(1).max(32),
  checkpoint_ids: z
    .array(z.string().max(64))
    .min(1)
    .max(16)
    .transform((ids) => [...new Set(ids)].sort()),
});
export const agentSearchReferenceSchema = z.object({
  dataset_id: uuid(),
  row_ids: z
    .array(uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Row IDs must be unique'),
});
export const agentContextRefsSchema = z.object({
  target_site_url_id: uuid().optional(),
  target_url: z.string().optional(),
  opportunity_id: uuid().optional(),
  demand_signal_id: uuid().optional(),
  site_health_reference: agentSiteHealthReferenceSchema.optional(),
  search_intelligence_reference: agentSearchReferenceSchema.optional(),
});
