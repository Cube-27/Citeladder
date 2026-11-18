import { z } from 'zod';

import { answerFormatsSchema } from './audits.ts';
import { namedBrandSchema } from './visibility.ts';

/**
 * Whether one answer searched the web. `not_reported`: the surface exposes no
 * search signal at all (an AI Overview is observed, not asked), which is not "no".
 */
export const promptAnswerSearchSchema = z.enum(['used', 'not_used', 'not_reported']);

// A tracked brand one answer named, in the order the answer named them.
export const promptAnswerBrandSchema = namedBrandSchema.omit({ responses: true });

// One successful answer a tracked prompt got; `execution_id` opens its evidence.
export const promptAnswerSchema = z.object({
  execution_id: z.uuid(),
  audit_id: z.uuid(),
  run_at: z.string(),
  logical_engine: z.string(),
  brands: z.array(promptAnswerBrandSchema),
  brand_mentioned: z.boolean(),
  // Your 1-based place among the brands the answer named; null when unnamed or unranked.
  position: z.number().int().nullable(),
  cited: z.boolean(),
  search: promptAnswerSearchSchema,
  answer_formats: answerFormatsSchema,
});

// `GET /projects/{id}/prompts/{prompt_id}/executions`: newest run first. No
// total: a pager shows one only from a persisted count, never a live COUNT(*).
export const promptAnswerPageSchema = z.object({
  market_id: z.uuid().nullable(),
  items: z.array(promptAnswerSchema),
  next_cursor: z.string().nullable(),
});

export type PromptAnswerSearch = z.infer<typeof promptAnswerSearchSchema>;
export type PromptAnswer = z.infer<typeof promptAnswerSchema>;
export type PromptAnswerPage = z.infer<typeof promptAnswerPageSchema>;
