import { z } from 'zod';

import { answerFormatsSchema, firstNamedSchema, promptAnswerSearchSchema } from './audits.ts';
import { namedBrandSchema } from './visibility.ts';

// A tracked brand one answer named, in the order the answer named them.
export const promptAnswerBrandSchema = namedBrandSchema.omit({ responses: true });

// One successful answer a tracked prompt got; `execution_id` opens its evidence.
export const promptAnswerSchema = z.object({
  execution_id: z.uuid(),
  audit_id: z.uuid(),
  run_at: z.string(),
  logical_engine: z.string(),
  brands: z.array(promptAnswerBrandSchema),
  // The stored first-named tracked business (AV-7); offsets can tie, so never re-derived from `brands`.
  first_named: firstNamedSchema,
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

export type PromptAnswer = z.infer<typeof promptAnswerSchema>;
export type PromptAnswerPage = z.infer<typeof promptAnswerPageSchema>;
