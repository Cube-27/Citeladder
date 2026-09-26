import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { humanizeApiError } from '@/lib/api/errors';
import { mcpConnectionsApi } from '@/lib/api/mcp-connections';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

function ConnectionList({ workspaceId }: Readonly<{ workspaceId?: string }>) {
  const cache = useQueryClient();
  const queryKey = queryKeys.mcpConnections.list(workspaceId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => mcpConnectionsApi.list(workspaceId, signal),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => mcpConnectionsApi.revoke(id, workspaceId),
    onSuccess: () => cache.invalidateQueries({ queryKey: queryKeys.mcpConnections.all }),
  });
  if (query.isPending) return <output>Loading connections…</output>;
  if (query.isError)
    return (
      <Alert tone="danger">
        {humanizeApiError(query.error).message}
        <Button onClick={() => void query.refetch()}>Retry</Button>
      </Alert>
    );
  return (
    <section className="grid gap-4">
      <h2>{workspaceId ? 'Connections authorized for this workspace' : 'Your MCP connections'}</h2>
      {query.data.length === 0 ? (
        <p>No active connections.</p>
      ) : (
        query.data.map((connection) => (
          <div key={connection.id} className="flex items-center justify-between gap-4">
            <p>
              {connection.client_name}
              {connection.requires_consent ? ' — reconnect to select workspaces' : ''}
            </p>
            <Button
              variant="secondary"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(connection.id)}
              aria-label={`Revoke ${connection.client_name}`}
            >
              {workspaceId ? 'Remove workspace access' : 'Revoke connection'}
            </Button>
          </div>
        ))
      )}
      {revoke.isError ? (
        <Alert tone="danger">{humanizeApiError(revoke.error).message}</Alert>
      ) : null}
    </section>
  );
}

export function McpConnections() {
  const { activeWorkspaceId } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  return (
    <div className="grid gap-[var(--page-section-gap)]">
      <ConnectionList />
      {mayManage && activeWorkspaceId ? (
        <ConnectionList key={activeWorkspaceId} workspaceId={activeWorkspaceId} />
      ) : null}
    </div>
  );
}
