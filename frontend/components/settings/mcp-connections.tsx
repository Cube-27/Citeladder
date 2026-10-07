import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { ReadError } from '@/components/ui/read-error';
import { textRole } from '@/components/ui/typography';
import { EditorialSectionHeader, ledgerClasses } from '@/components/ui/workspace';
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
      <ReadError
        error={query.error}
        fallback="Connections could not be loaded."
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  return (
    <Stack as="section" gap="compact">
      <EditorialSectionHeader
        title={workspaceId ? 'Connections authorized for this workspace' : 'Your MCP connections'}
      />
      {query.data.length === 0 ? (
        <p className={textRole('body')}>No active connections.</p>
      ) : (
        <div className={ledgerClasses('open')}>
          {query.data.map((connection) => (
            <div key={connection.id} className="flex items-center justify-between gap-4 py-3">
              <p className={textRole('body')}>
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
          ))}
        </div>
      )}
      {revoke.isError ? (
        <Alert tone="danger">{humanizeApiError(revoke.error).message}</Alert>
      ) : null}
    </Stack>
  );
}

export function McpConnections() {
  const { activeWorkspaceId } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  return (
    <Stack gap="section">
      <ConnectionList />
      {mayManage && activeWorkspaceId ? (
        <ConnectionList key={activeWorkspaceId} workspaceId={activeWorkspaceId} />
      ) : null}
    </Stack>
  );
}
