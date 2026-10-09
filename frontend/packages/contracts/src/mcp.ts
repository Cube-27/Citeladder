import { z } from 'zod';

export const mcpConnectionSchema = z.object({
  id: z.string().uuid(),
  client_name: z.string(),
  workspaces: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  /** The connecting account, shown only in a workspace Owner/Admin view. */
  user_email: z.string().nullable(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  requires_consent: z.boolean(),
});

export type McpConnection = z.infer<typeof mcpConnectionSchema>;
