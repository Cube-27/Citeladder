import { z } from 'zod';
import { logicalEngineSchema } from '@citeladder/contracts/providers';
import { benchmarkModeSchema } from '@citeladder/contracts/project';
import { auditPolicy } from './config.ts';
const auditFields = z.object({
  project_id: z.uuid(),
  prompt_set_id: z.uuid().nullish(),
  prompt_ids: z.array(z.uuid()).default([]),
  engines: z.array(logicalEngineSchema).min(1),
  repetitions: z
    .number()
    .int()
    .min(auditPolicy.min_repetitions)
    .max(auditPolicy.max_repetitions)
    .nullish(),
  benchmark_mode: benchmarkModeSchema.nullish(),
  audit_scope: z.enum(['brand', 'commerce']).default('brand'),
  credential_mode: z.enum(['byok', 'funded']).default('byok'),
  random_seed: z.string().nullish(),
});
const selectedPrompts = (input: { prompt_set_id?: string | null; prompt_ids: string[] }) =>
  Boolean(input.prompt_set_id || input.prompt_ids.length);
/** Funding selection belongs to trusted billing/trial callers, never the HTTP body. */
export const auditCreateInput = auditFields
  .omit({ credential_mode: true })
  .refine(selectedPrompts, 'Select a prompt set or prompt IDs');
export const auditInput = auditFields.refine(selectedPrompts, 'Select a prompt set or prompt IDs');
/**
 * A public API launch: the project comes from the path, and the caller caps the
 * estimate's maximum attempt count (the most audit credits the run can reserve).
 */
export const auditLaunchInput = auditFields
  .omit({ credential_mode: true, project_id: true })
  .extend({ max_estimated_credits: z.int().min(1) })
  .refine(selectedPrompts, 'Select a prompt set or prompt IDs');
export type AuditInput = z.output<typeof auditInput>;
