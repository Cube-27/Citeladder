import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { ConnectStrip } from '@/components/mcp/connect-strip';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { Stack } from '@/components/ui/layout';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
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
              : `Reads ${workspaces || 'no workspace you can still access'}.`}
          </ClampText>
          <p className={textRole('caption', 'truncate')}>
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

/** What the list shows instead of rows: the read's loading, error or empty. */
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
  if (query.data.length > 0) return undefined;
  return {
    kind: 'empty',
    icon: ICONS.agent,
    headingLevel: 3,
    heading: adminView ? 'No connection can read this workspace' : 'No assistant connected yet',
    description: adminView
      ? undefined
      : 'Connect one with the button above; it appears here once you approve it.',
  };
}

function ConnectionList({ workspaceId }: Readonly<{ workspaceId?: string }>) {
  const adminView = workspaceId !== undefined;
  const [pending, setPending] = useState<McpConnection | null>(null);
  const query = useQuery(mcpConnectionQueries.list(workspaceId));
  const revoke = useMutation(mcpConnectionMutations.revoke(workspaceId));
  const title = adminView ? 'Connections that can read this workspace' : 'Your connections';
  return (
    <Section aria-label={title}>
      {/* The list's title is its card's head, not a heading between blocks. */}
      <SectionHeader>
        <SectionTitle>{title}</SectionTitle>
        <SectionDescription>
          {adminView
            ? 'Every member’s assistant that can read this workspace. Remove one to cut it off.'
            : 'Assistants you approved, and what each can read. Revoke one to cut it off at once.'}
        </SectionDescription>
      </SectionHeader>
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
            variant="danger"
            pending={revoke.isPending}
            onClick={() => {
              if (pending) revoke.mutate(pending.id, { onSuccess: () => setPending(null) });
            }}
          >
            {adminView ? 'Remove access' : 'Revoke'}
          </Button>
        }
      >
        <Stack gap="compact">
          <p className={textRole('body', 'text-ink-2')}>
            {adminView
              ? 'The assistant stops reading or changing this workspace at once. Its access to other workspaces is unchanged.'
              : 'The assistant stops reading or changing CiteLadder at once. Connect it again to restore access.'}
          </p>
          {revoke.isError ? (
            <Notice
              kind="mutation"
              notice={mutationNoticeForError(revoke.error, { action: 'revoke the connection' })}
            />
          ) : null}
        </Stack>
      </Dialog>
    </Section>
  );
}

export function McpConnections() {
  const { activeWorkspaceId } = useProjectContext();
  const mayManage = useWorkspaceCapability('manage_members');
  return (
    <>
      <Section aria-labelledby="mcp-connect-title">
        <SectionHeader>
          <SectionTitle id="mcp-connect-title">Connect an AI assistant</SectionTitle>
          <SectionDescription>
            Use CiteLadder from Claude, ChatGPT, Gemini, Cursor or Grok.
          </SectionDescription>
        </SectionHeader>
        <ConnectStrip surface="app" />
      </Section>
      {/* Your approvals and the workspace's: one card each. */}
      <ConnectionList />
      {mayManage && activeWorkspaceId ? (
        <ConnectionList key={activeWorkspaceId} workspaceId={activeWorkspaceId} />
      ) : null}
    </>
  );
}
