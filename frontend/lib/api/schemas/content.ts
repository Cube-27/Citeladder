import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// ---------------------------------------------------------------------------
// Content generation
// ---------------------------------------------------------------------------

// Generic queue-row lifecycle (backend `task_queue.TASK_STATUS_*`): the
// content row IS the queue row (AuditTask pattern), so the wire statuses are
// the queue statuses. `leased`/`running`/`retry_wait` are all "in flight"
// from the UI's perspective; terminal = succeeded | failed | cancelled.
export const contentGenerationStatusSchema = z.enum([
  'queued',
  'leased',
  'running',
  'succeeded',
  'retry_wait',
  'failed',
  'cancelled',
]);

// Frozen on the row at enqueue: Website context was either projected in or
// unavailable because no usable crawl evidence existed.
export const contextStatusSchema = z.enum(['included', 'unavailable']);

// The skill catalog is served by `GET /content/skills`, so the set of valid
// ids is the backend's to decide — mirroring it as a frontend enum here would
// reject any newly added skill on a persisted row. Ids are bounded by the
// `skill_id` column width.
export const contentSkillSchema = z.string().min(1).max(64);

export const contentSkillChannelSchema = z.enum(['web', 'social', 'video', 'community', 'email']);

// File-backed skill metadata for a picker. The authored body stays server-side
// and is used directly by the content message builder.
export const contentSkillViewSchema = responseObject({
  id: contentSkillSchema,
  label: z.string(),
  channel: contentSkillChannelSchema,
  description: z.string(),
});

export const contentSkillCatalogSchema = responseObject({
  version: z.string(),
  default_skill_id: contentSkillSchema,
  skills: z.array(contentSkillViewSchema),
});

// Public summary of the frozen generation context: counts and URLs only,
// never the rendered blocks themselves.
export const contentContextSummarySchema = responseObject({
  version: z.string(),
  crawl_page_count: z.number().int().nonnegative(),
  crawl_urls: z.array(z.string()).default([]),
  crawl_completed_at: z.string().nullable(),
  brand_memory: z.boolean(),
  brand_fields: z.array(z.string()).default([]),
  target_url: z.string().nullable(),
  issue_count: z.number().int().nonnegative(),
  related_page_count: z.number().int().nonnegative(),
  omissions: z.array(z.record(z.string(), z.unknown())).default([]),
});

// Compact pre-flight summary from the canonical server-side context owner.
export const contentContextPreviewSchema = responseObject({
  brand_memory: z.boolean(),
  target_page: z.string().nullable(),
  issue_count: z.number().int().nonnegative(),
  related_page_count: z.number().int().nonnegative(),
});

export const contentTargetPageSchema = responseObject({
  site_url_id: uuid(),
  title: z.string(),
  url: z.string(),
  display_url: z.string(),
  page_kind: z.string(),
});

// Fixed vocabulary for why a draft was rejected.
export const contentFeedbackReasonSchema = z.enum([
  'too_generic',
  'wrong_tone',
  'missed_topic',
  'incorrect_facts',
  'other',
]);

// Bounded history-list projection (backend `ContentGenerationListItem`) —
// never `output_text`, never the full prompt. Model provenance is explicit
// (`requested_model` vs `returned_model`); there is no generic `model` field.
export const contentGenerationListItemSchema = responseObject({
  id: uuid(),
  project_id: uuid(),
  status: contentGenerationStatusSchema,
  skill_id: contentSkillSchema,
  opportunity_id: uuid().nullable(),
  context_status: contextStatusSchema,
  requested_model: z.string(),
  returned_model: z.string().nullable(),
  provider: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  error_code: z.string(),
  instruction_preview: z.string(),
});

// Full projection of one generation (backend `ContentGenerationDetail`).
// Superset of the list item; never the provider API key (invariant 6).
export const contentGenerationDetailSchema = responseObject({
  id: uuid(),
  project_id: uuid(),
  status: contentGenerationStatusSchema,
  skill_id: contentSkillSchema,
  opportunity_id: uuid().nullable(),
  skill_version: z.number().int(),
  feedback: z.enum(['accepted', 'rejected']).nullable(),
  // Empty on an acceptance; otherwise a known reason.
  feedback_reason: z.union([contentFeedbackReasonSchema, z.literal('')]).default(''),
  feedback_at: z.string().nullable(),
  context_status: contextStatusSchema,
  requested_model: z.string(),
  returned_model: z.string().nullable(),
  provider: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  error_code: z.string(),
  instruction_preview: z.string(),
  user_instruction: z.string(),
  context_summary: contentContextSummarySchema,
  finish_reason: z.string().nullable(),
  output_truncated: z.boolean(),
  output_text: z.string().nullable(),
  usage: z.record(z.string(), z.unknown()).nullable(),
  latency_ms: z.number().int().nullable(),
  error_detail: z.string(),
  generator_version: z.string(),
});
