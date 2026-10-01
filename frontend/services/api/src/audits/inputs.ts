import { z } from 'zod';
import { logicalEngineSchema } from '@citeladder/contracts/providers';
import { benchmarkModeSchema } from '@citeladder/contracts/project';
import { auditPolicy } from './config.ts';
export const auditInput = z
  .object({
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
  })
  .refine(
    (input) => input.prompt_set_id || input.prompt_ids.length,
    'Select a prompt set or prompt IDs',
  );
export type AuditInput = z.output<typeof auditInput>;
