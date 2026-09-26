import { z } from 'zod';

import { apiClient } from './client';
import { mcpConnectionSchema } from '@citeladder/contracts/mcp';
import { strictValidate } from '@citeladder/contracts/validation';

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
