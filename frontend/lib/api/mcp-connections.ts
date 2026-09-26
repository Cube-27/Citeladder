import { z } from 'zod';

import { apiClient } from './client';
import { mcpConnectionSchema } from './schemas/mcp';
import { strictValidate } from './schemas/validation';

function path(workspaceId?: string) {
  return workspaceId ? `/workspaces/${workspaceId}/mcp/connections` : '/mcp/connections';
}

export const mcpConnectionsApi = {
  list: async (workspaceId?: string, signal?: AbortSignal) =>
    strictValidate(
      z.array(mcpConnectionSchema),
      await apiClient.get<unknown>(path(workspaceId), { workspaceId, signal }),
      'mcp.connections',
    ),
  revoke: (id: string, workspaceId?: string) =>
    apiClient.delete<void>(`${path(workspaceId)}/${id}`, { workspaceId }),
};
