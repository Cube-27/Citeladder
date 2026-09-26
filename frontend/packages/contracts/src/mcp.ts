import { z } from 'zod';

export const mcpConnectionSchema = z.object({
  id: z.string().uuid(),
  client_name: z.string(),
  workspace_ids: z.array(z.string().uuid()),
  created_at: z.string(),
  requires_consent: z.boolean(),
});
