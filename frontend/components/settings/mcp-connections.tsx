import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { ConnectStrip } from '@/components/mcp/connect-strip';
import { IconButton } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { StateBlock } from '@/components/ui/state-block';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { Text } from '@/components/ui/typography';
import { SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import { ICONS, Trash2 } from '@/lib/icons';
import type { McpConnection } from '@citeladder/contracts/mcp';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { mcpConnectionMutations, mcpConnectionQueries } from '@/lib/api/mcp-connections';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';

type ConnectionEntry =
  | { kind: 'own'; connection: McpConnection }
  | { kind: 'member'; connection: McpConnection; workspaceId: string };

function connectionDetail(entry: ConnectionEntry): string | null {
  if (entry.kind === 'member') return entry.connection.user_email;
  return entry.connection.requires_consent ? 'Reconnect to choose workspaces' : null;
}

function revokeLabel(entry: ConnectionEntry): string {
  const name = entry.connection.client_name;
  if (entry.kind === 'own') return `Revoke ${name}`;
  return `Remove ${name}'s access for ${entry.connection.user_email ?? 'this member'}`;
}

function ConnectionRow({
  entry,
  onRevoke,
}: Readonly<{ entry: ConnectionEntry; onRevoke: () => void }>) {
  const { connection } = entry;
  const detail = connectionDetail(entry);
  return (
    <TableRow>
      <TableCell>
        <div className="grid min-w-0">
          <ClampText tooltip={connection.client_name}>
            {connection.client_name} <Text variant="caption">· name not verified</Text>
          </ClampText>
          {detail ? (
            <ClampText tooltip={detail} text="caption">
              {detail}
            </ClampText>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <DisplayTime value={connection.created_at} dateOnly />
      </TableCell>
      <TableCell>
        {connection.last_used_at ? (
          <DisplayTime value={connection.last_used_at} dateOnly />
        ) : (
          <Text variant="body" tone="ink-2">
            Not used yet
          </Text>
        )}
      </TableCell>
      <TableActionsCell>
        <IconButton icon={Trash2} label={revokeLabel(entry)} onClick={onRevoke} />
      </TableActionsCell>
    </TableRow>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'connection', label: 'Connection', kind: 'identity' },
  { key: 'connected', label: 'Connected', kind: 'date', priority: 'low' },
  { key: 'used', label: 'Last used', kind: 'date' },
  { key: 'manage', label: 'Manage', kind: 'actions', width: 'rowActions', hideLabel: true },
];

function connectionsState(
  queries: readonly UseQueryResult<McpConnection[]>[],
): DataTableState | undefined {
  const failed = queries.find((query) => query.isError);
  if (failed)
    return {
      kind: 'error',
      title: "Couldn't load connections",
      ...readErrorProps(failed),
      fallback: 'Connections could not be loaded.',
    };
  if (queries.some((query) => query.isPending))
    return { kind: 'loading', label: 'Loading connections…' };
  return undefined;
}

function connectionEntries(
  own: readonly McpConnection[],
  workspace: { id: string; connections: readonly McpConnection[] } | null,
): ConnectionEntry[] {
  const mine = new Set(own.map((connection) => connection.id));
  const entries: ConnectionEntry[] = own.map((connection) => ({ kind: 'own', connection }));
  if (workspace === null) return entries;
  for (const connection of workspace.connections)
    if (!mine.has(connection.id))
      entries.push({ kind: 'member', connection, workspaceId: workspace.id });
  return entries;
}

function ConnectionList({ workspaceId }: Readonly<{ workspaceId: string | null }>) {
  const [pending, setPending] = useState<ConnectionEntry | null>(null);
  const ownQuery = useQuery(mcpConnectionQueries.list());
  const workspaceQuery = useQuery({
    ...mcpConnectionQueries.list(workspaceId ?? undefined),
    enabled: workspaceId !== null,
  });
  const queries = workspaceId === null ? [ownQuery] : [ownQuery, workspaceQuery];
  const state = connectionsState(queries);
  const entries = connectionEntries(
    ownQuery.data ?? [],
    workspaceId === null ? null : { id: workspaceId, connections: workspaceQuery.data ?? [] },
  );
  const title = 'Connections';
  return (
    <SettingsGroup title={title} region={false}>
      {state === undefined && entries.length === 0 ? (
        <StateBlock kind="empty" icon={ICONS.agent} heading="No connections yet" />
      ) : (
        <DataTable label={title} columns={COLUMNS} state={state}>
          {entries.map((entry) => (
            <ConnectionRow
              key={`${entry.kind}:${entry.connection.id}`}
              entry={entry}
              onRevoke={() => setPending(entry)}
            />
          ))}
        </DataTable>
      )}
      <RevokeDialog pending={pending} onClose={() => setPending(null)} />
    </SettingsGroup>
  );
}

function RevokeDialog({
  pending,
  onClose,
}: Readonly<{ pending: ConnectionEntry | null; onClose: () => void }>) {
  const workspaceId = pending?.kind === 'member' ? pending.workspaceId : undefined;
  const revoke = useMutation(mcpConnectionMutations.revoke(workspaceId));
  const member = pending?.kind === 'member';
  const close = () => {
    revoke.reset();
    onClose();
  };
  return (
    <ConfirmDialog
      request={
        pending
          ? {
              question: revokeLabel(pending),
              body: null,
              confirmLabel: member ? 'Remove access' : 'Revoke',
              destructive: true,
              onConfirm: () => revoke.mutate(pending.connection.id, { onSuccess: close }),
            }
          : null
      }
      pending={revoke.isPending}
      onCancel={close}
    >
      {revoke.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(revoke.error, { action: 'revoke the connection' })}
        />
      ) : null}
    </ConfirmDialog>
  );
}

export function McpConnections() {
  const { activeWorkspaceId } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  const workspaceId = mayManage && activeWorkspaceId ? activeWorkspaceId : null;
  return (
    <>
      <SettingsGroup title="Connect an AI assistant">
        <SettingRows>
          <ConnectStrip surface="app" />
        </SettingRows>
      </SettingsGroup>
      <ConnectionList key={workspaceId ?? 'own'} workspaceId={workspaceId} />
    </>
  );
}
