import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { ConnectStrip } from '@/components/mcp/connect-strip';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { Stack } from '@/components/ui/layout';
import { readErrorProps } from '@/components/ui/read-error';
import { TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { ICONS } from '@/lib/icons';
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
    <TableRow>
      <TableCell>
        <div className="grid min-w-0">
          <p className={textRole('itemTitle')}>
            {connection.client_name}{' '}
            <span className={textRole('caption')}>· name not verified</span>
          </p>
          <p className={textRole('body')}>
            {connection.requires_consent
              ? 'Reconnect to choose workspaces.'
              : `Reads ${workspaces || 'no workspace you can still access'}.`}
          </p>
          <p className={textRole('caption')}>
            {connection.access === 'read_and_change' ? 'Read and change · ' : 'Read · '}
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
      </TableCell>
      <TableCell numeric>
        <Button variant="secondary" onClick={onRevoke}>
          {adminView ? 'Remove workspace access' : 'Revoke'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'connection', label: 'Connection' },
  { key: 'access', label: 'Access', width: 'name', numeric: true, hideLabel: true },
];

/** What the list shows instead of rows: the read's loading, error or empty. */
function connectionsState(
  query: UseQueryResult<McpConnection[]>,
  adminView: boolean,
): DataTableState | undefined {
  if (query.isPending) return { kind: 'loading', label: 'Loading connections…' };
  if (query.isError)
    return {
      kind: 'error',
      ...readErrorProps(query),
      fallback: 'Connections could not be loaded.',
    };
  if (query.data.length > 0) return undefined;
  return {
    kind: 'empty',
    icon: ICONS.agent,
    headingLevel: 3,
    heading: adminView
      ? 'No connection can read this workspace.'
      : 'No assistant is connected yet. Use Connect above to add one.',
  };
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
  return (
    <>
      <DataTable
        title={adminView ? 'Connections that can read this workspace' : 'Your connections'}
        columns={COLUMNS}
        state={connectionsState(query, adminView)}
      >
        {query.data?.map((connection) => (
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
      </DataTable>
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
              ? 'The assistant stops reading or changing this workspace at once. Its access to other workspaces is unchanged.'
              : 'The assistant stops reading or changing CiteLadder at once. Connect it again to restore access.'}
          </p>
          {revoke.isError ? (
            <Alert tone="danger">{humanizeApiError(revoke.error).message}</Alert>
          ) : null}
        </Stack>
      </Dialog>
    </>
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
          description="Read your CiteLadder data from Claude, ChatGPT, Gemini, Cursor or Grok and, if you allow it, make changes you confirm. You choose which workspaces it can use when you approve the connection."
        />
        <ConnectStrip />
      </Stack>
      {/* Your approvals and the workspace's are peers in one section. */}
      <Stack gap="workspace">
        <ConnectionList />
        {mayManage && activeWorkspaceId ? (
          <ConnectionList key={activeWorkspaceId} workspaceId={activeWorkspaceId} />
        ) : null}
      </Stack>
    </Stack>
  );
}
