import { z } from 'zod';

export const mcpConnectionSchema = z.object({
  id: z.string().uuid(),
  client_name: z.string(),
  workspace_ids: z.array(z.string().uuid()),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  requires_consent: z.boolean(),
});
