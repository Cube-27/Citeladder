import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useState } from 'react';

import { ConnectStrip } from '@/components/mcp/connect-strip';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { StateBlock } from '@/components/ui/state-block';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { ICONS } from '@/lib/icons';
import type { McpConnection } from '@citeladder/contracts/mcp';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { mcpConnectionMutations, mcpConnectionQueries } from '@/lib/api/mcp-connections';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';

function ConnectionRow({
  connection,
  adminView,
  onRevoke,
}: Readonly<{ connection: McpConnection; adminView: boolean; onRevoke: () => void }>) {
  const workspaces = connection.workspaces.map((workspace) => workspace.name).join(', ');
  const verb = connection.access === 'read_and_change' ? 'Reads and changes' : 'Reads';
  return (
    <TableRow>
      <TableCell>
        <div className="grid min-w-0">
          <p className={textRole('body')}>
            {connection.client_name}{' '}
            <span className={textRole('caption')}>· name not verified</span>
          </p>
          <ClampText className={textRole('body', 'text-ink-2')}>
            {connection.requires_consent
              ? 'Reconnect to choose workspaces.'
              : `${verb} ${workspaces || 'no workspace you can still access'}.`}
          </ClampText>
          <p className={textRole('caption', 'truncate')}>
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
      <TableActionsCell>
        {adminView ? (
          <Button variant="danger" onClick={onRevoke}>
            Remove workspace access
          </Button>
        ) : (
          <ActionButton action="revoke" onClick={onRevoke} />
        )}
      </TableActionsCell>
    </TableRow>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'connection', label: 'Connection', kind: 'identity' },
  { key: 'actions', label: 'Actions', kind: 'actions', width: 'name', hideLabel: true },
];

function connectionsState(
  query: UseQueryResult<McpConnection[]>,
  adminView: boolean,
): DataTableState | undefined {
  if (query.isPending) return { kind: 'loading', label: 'Loading connections…' };
  if (query.isError)
    return {
      kind: 'error',
      title: adminView
        ? "Couldn't load this workspace's connections"
        : "Couldn't load your connections",
      ...readErrorProps(query),
      fallback: 'Connections could not be loaded.',
    };
  return undefined;
}

function ConnectionList({ workspaceId }: Readonly<{ workspaceId?: string }>) {
  const adminView = workspaceId !== undefined;
  const [pending, setPending] = useState<McpConnection | null>(null);
  const query = useQuery(mcpConnectionQueries.list(workspaceId));
  const revoke = useMutation(mcpConnectionMutations.revoke(workspaceId));
  const title = adminView ? 'Connections that can read this workspace' : 'Your connections';
  const empty = query.isSuccess && query.data.length === 0;
  if (adminView && (query.isPending || empty)) return null;
  return (
    <SettingsGroup title={title} region={false}>
      {empty ? (
        <StateBlock kind="empty" icon={ICONS.agent} heading="No connections yet" />
      ) : (
        <DataTable label={title} columns={COLUMNS} state={connectionsState(query, adminView)}>
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
      )}
      <RevokeDialog
        adminView={adminView}
        pending={pending}
        revoke={revoke}
        onClose={() => setPending(null)}
      />
    </SettingsGroup>
  );
}

function RevokeDialog({
  adminView,
  pending,
  revoke,
  onClose,
}: Readonly<{
  adminView: boolean;
  pending: McpConnection | null;
  revoke: UseMutationResult<void, Error, string>;
  onClose: () => void;
}>) {
  const name = pending?.client_name ?? 'this connection';
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={adminView ? `Remove ${name}'s access to this workspace?` : `Revoke ${name}?`}
      footer={
        <Button
          variant="danger"
          pending={revoke.isPending}
          onClick={() => {
            if (pending) revoke.mutate(pending.id, { onSuccess: onClose });
          }}
        >
          {adminView ? 'Remove access' : 'Revoke'}
        </Button>
      }
    >
      {revoke.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(revoke.error, { action: 'revoke the connection' })}
        />
      ) : null}
    </Dialog>
  );
}

export function McpConnections() {
  const { activeWorkspaceId } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  return (
    <>
      <SettingsGroup title="Connect an AI assistant">
        <SettingRows>
          <ConnectStrip surface="app" />
        </SettingRows>
      </SettingsGroup>
      <ConnectionList />
      {mayManage && activeWorkspaceId ? (
        <ConnectionList key={activeWorkspaceId} workspaceId={activeWorkspaceId} />
      ) : null}
    </>
  );
}
