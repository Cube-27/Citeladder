import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConnectStrip } from '@/components/mcp/connect-strip';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { Stack } from '@/components/ui/layout';
import { ReadError } from '@/components/ui/read-error';
import { textRole } from '@/components/ui/typography';
import { EditorialSectionHeader, ledgerClasses } from '@/components/ui/workspace';
import type { McpConnection } from '@citeladder/contracts/mcp';
import { humanizeApiError } from '@/lib/api/errors';
import { mcpConnectionsApi } from '@/lib/api/mcp-connections';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

function ConnectionRow({
  connection,
  adminView,
  onRevoke,
}: Readonly<{ connection: McpConnection; adminView: boolean; onRevoke: () => void }>) {
  const workspaces = connection.workspaces.map((workspace) => workspace.name).join(', ');
  return (
    <li className="flex flex-wrap items-start justify-between gap-4 py-3">
      <div className="grid min-w-0 gap-1">
        <p className={textRole('itemTitle')}>
          {connection.client_name} <span className={textRole('caption')}>· name not verified</span>
        </p>
        <p className={textRole('body')}>
          {connection.requires_consent
            ? 'Reconnect to choose workspaces.'
            : `Reads ${workspaces || 'no workspace you can still access'}.`}
        </p>
        <p className={textRole('caption')}>
          {adminView && connection.user_email ? `Connected by ${connection.user_email} · ` : null}
          Connected <DisplayTime value={connection.created_at} dateOnly /> ·{' '}
          {connection.last_used_at ? (
            <>
              Last used <DisplayTime value={connection.last_used_at} />
            </>
          ) : (
            'Not used yet'
          )}
        </p>
      </div>
      <Button variant="secondary" onClick={onRevoke}>
        {adminView ? 'Remove workspace access' : 'Revoke'}
      </Button>
    </li>
  );
}

function ConnectionList({ workspaceId }: Readonly<{ workspaceId?: string }>) {
  const cache = useQueryClient();
  const adminView = workspaceId !== undefined;
  const [pending, setPending] = useState<McpConnection | null>(null);
  const query = useQuery({
    queryKey: queryKeys.mcpConnections.list(workspaceId),
    queryFn: ({ signal }) => mcpConnectionsApi.list(workspaceId, signal),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => mcpConnectionsApi.revoke(id, workspaceId),
    onSuccess: () => {
      setPending(null);
      return cache.invalidateQueries({ queryKey: queryKeys.mcpConnections.all });
    },
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
        title={adminView ? 'Connections that can read this workspace' : 'Your connections'}
      />
      {query.data.length === 0 ? (
        <p className={textRole('body')}>
          {adminView
            ? 'No connection can read this workspace.'
            : 'No assistant is connected yet. Use Connect above to add one.'}
        </p>
      ) : (
        <ul className={ledgerClasses('open')}>
          {query.data.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              adminView={adminView}
              onRevoke={() => {
                revoke.reset();
                setPending(connection);
              }}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={
          adminView
            ? `Remove ${pending?.client_name ?? 'this connection'}'s access to this workspace?`
            : `Revoke ${pending?.client_name ?? 'this connection'}?`
        }
        footer={
          <Button
            variant="destructive"
            pending={revoke.isPending}
            onClick={() => {
              if (pending) revoke.mutate(pending.id);
            }}
          >
            {adminView ? 'Remove access' : 'Revoke'}
          </Button>
        }
      >
        <Stack gap="compact">
          <p className={textRole('body')}>
            {adminView
              ? 'The assistant stops reading this workspace at once. Its access to other workspaces is unchanged.'
              : 'The assistant stops reading CiteLadder at once. Connect it again to restore access.'}
          </p>
          {revoke.isError ? (
            <Alert tone="danger">{humanizeApiError(revoke.error).message}</Alert>
          ) : null}
        </Stack>
      </Dialog>
    </Stack>
  );
}

export function McpConnections() {
  const { activeWorkspaceId } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  return (
    <Stack gap="section">
      <Stack as="section" gap="compact">
        <EditorialSectionHeader
          title="Connect an AI assistant"
          description="Read your CiteLadder data from Claude, ChatGPT, Gemini, Cursor or Grok. You choose which workspaces it can read when you approve the connection."
        />
        <ConnectStrip />
      </Stack>
      <ConnectionList />
      {mayManage && activeWorkspaceId ? (
        <ConnectionList key={activeWorkspaceId} workspaceId={activeWorkspaceId} />
      ) : null}
    </Stack>
  );
}
