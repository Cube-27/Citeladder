import { mutationOptions, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient } from './client';
import { queryKeys } from './query-keys';
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

export const mcpConnectionQueries = {
  list: (workspaceId?: string) =>
    queryOptions({
      queryKey: queryKeys.mcpConnections.list(workspaceId),
      queryFn: ({ signal }) => mcpConnectionsApi.list(workspaceId, signal),
    }),
};

export const mcpConnectionMutations = {
  revoke: (workspaceId?: string) =>
    mutationOptions({
      mutationFn: (id: string) => mcpConnectionsApi.revoke(id, workspaceId),
      // oxlint-disable-next-line max-params
      onSuccess: (_data, _id, _result, { client }) => {
        void client.invalidateQueries({ queryKey: queryKeys.mcpConnections.all });
      },
    }),
};
