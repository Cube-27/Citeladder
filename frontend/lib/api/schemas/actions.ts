import { z } from 'zod';

import { opportunitySchema } from './opportunities';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// open → in progress → implemented (declared) → measuring → done | dismissed.
// A user stores only `open` or `dismissed`; `in_progress` is derived by the
// server from a linked chat having an output.
export const actionStatusSchema = z.enum([
  'open',
  'in_progress',
  'implemented',
  'measuring',
  'done',
  'dismissed',
]);

// One unit of work per target, projected from persisted Action rows.
export const actionItemSchema = responseObject({
  id: uuid(),
  project_id: uuid(),
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
  families: z.record(z.string(), z.enum(['observed', 'no_finding', 'unavailable'])).optional(),
  approach: z.string().optional(),
  skill_id: z.string().optional(),
  donts: z.array(z.string()).optional(),
  measure_with: z.array(z.string()).optional(),
});

export const actionDetailSchema = actionItemSchema.extend({
  diagnosis: actionDiagnosisSchema,
  members: z.array(opportunitySchema),
});

export const actionsPageSchema = responseObject({
  items: z.array(actionItemSchema),
  next_cursor: z.string().nullable(),
  status_counts: z.record(z.string(), z.number().int()),
});
