import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState, type ReactNode } from 'react';

import { BackfillHistory } from '@/components/settings/backfill-progress';
import { PROVIDER_META, type GrantModel } from '@/components/settings/grant-model';
import { MoreHorizontal, Pencil, PlugZap, Trash2 } from '@/lib/icons';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import {
  SelectedPropertyMark,
  useActiveMapping,
  usePropertyPicker,
} from '@/components/settings/property-picker';
import { StatusMark } from '@/components/ui/status-mark';
import { Button, IconButton } from '@/components/ui/button';
import {
  integrationsApi,
  integrationsMutations,
  integrationsQueries,
  refreshImportedReads,
  type IntegrationConnection,
} from '@/lib/api/integrations';
import { humanizeApiError } from '@/lib/api/errors';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatShortDate, formatTableTimestamp } from '@/lib/format';
import { DisplayTime } from '@/components/ui/display-time';
import { isSyncInFlight, pollSyncRun, SYNC_RUN_STATES } from '@/lib/integrations/status';
import { ClampText } from '@/components/ui/clamp-text';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { ItemRow } from '@/components/ui/list-row';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';

type ConnectionMutation = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  mutate: () => void;
};
type SyncRun = Awaited<ReturnType<typeof integrationsApi.getSync>>;

/** A mutation's state with the one action the row runs through it. */
const connectionAction = (
  mutation: Omit<ConnectionMutation, 'mutate'>,
  run: () => void,
): ConnectionMutation => ({
  isPending: mutation.isPending,
  isError: mutation.isError,
  error: mutation.error,
  mutate: run,
});

function waitingLabel(status: SyncRun['status']): string {
  if (status === 'leased') return 'assigned to a worker';
  if (status === 'retry_wait') return 'awaiting retry';
  return 'waiting for a worker';
}

/** Test failures in words; the provider code stays out of the UI. */
const TEST_FAILURE: Record<string, string> = {
  grant_auth_failed: 'The provider refused this grant. Reconnect to renew consent.',
  token_refresh_failed: 'The provider did not renew access. Try again, or reconnect.',
  property_not_accessible: 'This account can no longer read the selected property.',
  rate_limited: 'The provider is rate limiting requests. Try again in a few minutes.',
};

/** Sync now, disabled with its reason (tooltip and description) until a property is chosen. */
function SyncButton({
  label,
  disabled,
  hasProperty,
  pending,
  onSync,
}: Readonly<{
  label: string;
  disabled: boolean;
  hasProperty: boolean;
  pending: boolean;
  onSync: () => void;
}>) {
  const reasonId = useId();
  const button = (
    <Button
      className="min-w-22"
      onClick={onSync}
      disabled={disabled}
      pending={pending}
      pendingLabel="Syncing…"
      aria-label={`Sync ${label} now`}
      aria-describedby={hasProperty ? undefined : reasonId}
    >
      Sync now
    </Button>
  );
  // One tree either way, so the button keeps its node when a property arrives.
  return (
    <>
      <span id={reasonId} hidden>
        Select a property first
      </span>
      <Tooltip content="Select a property first" describe={false} shouldOpen={() => !hasProperty}>
        {/* A disabled button takes no pointer events, so its wrapper opens the tip. */}
        <span className="inline-flex">{button}</span>
      </Tooltip>
    </>
  );
}

/**
 * Sync now on the row; Change, Test and Remove share its More menu (owner,
 * 2026-11-19), so the property beside them has the room to show. Select
 * stays a button until a property is chosen: it is the row's next step.
 */
function ConnectionActions({
  connection,
  label,
  busy,
  hasProperty,
  syncDisabled,
  syncPending,
  onTest,
  onSync,
  onRemove,
}: Readonly<{
  connection: IntegrationConnection;
  label: string;
  busy: boolean;
  hasProperty: boolean;
  syncDisabled: boolean;
  syncPending: boolean;
  onTest: () => void;
  onSync: () => void;
  onRemove: () => void;
}>) {
  // Testing and removing touch the credential; syncing is a run. Each is
  // offered only to a role that may do it.
  const canManage = useWorkspaceCapability('manage_credentials');
  const canRun = useWorkspaceCapability('run');
  const picker = usePropertyPicker(connection);

  return (
    <>
      {picker.allowed && !hasProperty ? (
        <Button onClick={picker.open} disabled={busy || picker.pending} aria-label={picker.label}>
          {picker.verb}
        </Button>
      ) : null}
      {canRun ? (
        <SyncButton
          label={label}
          disabled={syncDisabled}
          hasProperty={hasProperty}
          pending={syncPending}
          onSync={onSync}
        />
      ) : null}
      {canManage ? (
        <Menu>
          <MenuTrigger asChild>
            <IconButton icon={MoreHorizontal} label={`${label} actions`} disabled={busy} />
          </MenuTrigger>
          <MenuContent align="end">
            {picker.allowed && hasProperty ? (
              <MenuItem
                icon={<Icon icon={Pencil} />}
                disabled={picker.pending}
                onSelect={picker.open}
              >
                Change
              </MenuItem>
            ) : null}
            <MenuItem icon={<Icon icon={PlugZap} />} onSelect={onTest}>
              Test
            </MenuItem>
            {hasProperty ? (
              <>
                <MenuSeparator />
                <MenuItem icon={<Icon icon={Trash2} />} danger onSelect={onRemove}>
                  Remove
                </MenuItem>
              </>
            ) : null}
          </MenuContent>
        </Menu>
      ) : null}
      {picker.dialog}
    </>
  );
}

/** A status mark and the sentence after it, cut to one line with the whole in a tooltip. */
function MarkLine({ mark, text }: Readonly<{ mark: ReactNode; text: ReactNode }>) {
  return (
    <>
      {mark}
      <ClampText>{text}</ClampText>
    </>
  );
}

/** The latest sync from this card: waiting, importing, building reports, then its result. */
function RunSummary({ run, runActive }: Readonly<{ run: SyncRun; runActive: boolean }>) {
  const rows = `${formatCount(run.row_count)} rows`;
  const window = `window ${formatShortDate(run.window_start)}–${formatShortDate(run.window_end)}`;
  const mark = (
    <StatusMark variant="run-status" value={SYNC_RUN_STATES[run.status].badge}>
      {SYNC_RUN_STATES[run.status].label}
    </StatusMark>
  );
  if (runActive)
    return (
      <MarkLine
        mark={mark}
        text={
          run.status === 'running' ? (
            `${rows} · ${window}`
          ) : (
            <>
              Enqueued <DisplayTime value={run.created_at} /> · {waitingLabel(run.status)}
            </>
          )
        }
      />
    );
  if (run.processing)
    return (
      <MarkLine
        mark={
          <StatusMark variant="run-status" value="running">
            Processing
          </StatusMark>
        }
        text={`${rows} imported · updating reports`}
      />
    );
  const result =
    run.status === 'succeeded' ? `${rows} imported · ${window}` : run.error_detail || window;
  return <MarkLine mark={mark} text={result} />;
}

/**
 * The row's one status value. Every outcome — a failed action, a test
 * result, the sync this card started — replaces it in place rather than
 * adding a notice under the row, so nothing below moves (the newest action
 * wins: starting a sync clears the test result).
 */
function ConnectionStatus({
  working,
  actionError,
  testState,
  activeRun,
  runActive,
  grantConnected,
}: Readonly<{
  /** A test or removal in flight, run from the More menu. */
  working: string | null;
  actionError: unknown;
  testState: { ok: boolean; message: string } | null;
  activeRun: SyncRun | null;
  runActive: boolean;
  grantConnected: boolean;
}>) {
  if (working)
    return (
      <StatusMark variant="run-status" value="running">
        {working}
      </StatusMark>
    );
  if (actionError) {
    return (
      <MarkLine
        mark={
          <StatusMark variant="status" value="danger">
            Failed
          </StatusMark>
        }
        text={humanizeApiError(actionError).message}
      />
    );
  }
  if (testState)
    return (
      <MarkLine
        mark={
          <StatusMark variant="status" value={testState.ok ? 'success' : 'danger'}>
            {testState.ok ? 'Test passed' : 'Test failed'}
          </StatusMark>
        }
        text={testState.message}
      />
    );
  if (activeRun) return <RunSummary run={activeRun} runActive={runActive} />;
  if (!grantConnected)
    return (
      <StatusMark variant="status" value="warning">
        Reconnect to sync
      </StatusMark>
    );
  return <StatusMark>Ready to sync</StatusMark>;
}

function ConnectionRowView({
  connection,
  grant,
  hasProperty,
  testMutation,
  syncMutation,
  removeMutation,
  testState,
  activeRun,
  runActive,
  runInFlight,
  busy,
}: Readonly<{
  connection: IntegrationConnection;
  grant: GrantModel;
  hasProperty: boolean;
  testMutation: ConnectionMutation;
  syncMutation: ConnectionMutation;
  removeMutation: ConnectionMutation;
  testState: { ok: boolean; message: string } | null;
  activeRun: SyncRun | null;
  runActive: boolean;
  runInFlight: boolean;
  busy: boolean;
}>) {
  const { label, Icon: SourceIcon } = PROVIDER_META[connection.provider];
  const actionError = syncMutation.error ?? removeMutation.error;
  const grantConnected = grant.status === 'connected';
  let working: string | null = null;
  if (testMutation.isPending) working = 'Testing…';
  else if (removeMutation.isPending) working = 'Removing…';
  // Until a property is chosen the row's only state is that it has none.
  const status =
    hasProperty || working || actionError || testState || activeRun ? (
      <ConnectionStatus
        working={working}
        actionError={actionError}
        testState={testState}
        activeRun={activeRun}
        runActive={runActive}
        grantConnected={grantConnected}
      />
    ) : null;

  return (
    <ItemRow
      data-testid={`connection-row-${connection.provider}`}
      icon={<Icon icon={SourceIcon} className="text-ink-2" />}
      title={label}
      caption={
        <>
          <SelectedPropertyMark connection={connection} />
          <SyncLine connection={connection} />
        </>
      }
      status={status}
      actions={
        <ConnectionActions
          connection={connection}
          label={label}
          busy={busy}
          hasProperty={hasProperty}
          syncDisabled={busy || runInFlight || !hasProperty || !grantConnected}
          syncPending={syncMutation.isPending}
          onTest={testMutation.mutate}
          onSync={syncMutation.mutate}
          onRemove={removeMutation.mutate}
        />
      }
    />
  );
}

const CaptionDot = () => (
  <span aria-hidden className="shrink-0">
    ·
  </span>
);

/**
 * When the source last synced and how much history it holds, each its own
 * cut piece of the caption. The connection is the workspace's, so its sync
 * is too; the card's foot names the zone.
 */
function SyncLine({ connection }: Readonly<{ connection: IntegrationConnection }>) {
  const timeZone = useDisplayTimeZone();
  const lastSynced = connection.last_synced_at;
  return (
    <>
      <CaptionDot />
      <ClampText>
        Last synced{' '}
        {lastSynced ? (
          <time dateTime={lastSynced}>{formatTableTimestamp(lastSynced, timeZone)}</time>
        ) : (
          'never'
        )}
      </ClampText>
      <CaptionDot />
      <Inline as="span" gap="tight">
        <span className="shrink-0">History</span>
        <BackfillHistory workspaceId={connection.workspace_id} connectionId={connection.id} />
      </Inline>
    </>
  );
}

/** Polling and mutation owner for one connection on an OAuth grant. */
export function ConnectionRow({
  connection,
  grant,
}: Readonly<{ connection: IntegrationConnection; grant: GrantModel }>) {
  const [testState, setTestState] = useState<{ ok: boolean; message: string } | null>(null);
  const { activeProject } = useProjectContext();
  const client = useQueryClient();
  const mapping = useActiveMapping(
    connection.workspace_id,
    connection.id,
    activeProject?.id ?? null,
  );
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null);
  // The test descriptor owns no callbacks; this row's status slot is local state.
  const testMutation = useMutation({
    ...integrationsMutations.test(connection.workspace_id, connection.id),
    // The newest action owns the status slot: an older failure must not mask this result.
    onMutate: () => {
      syncMutation.reset();
      removeMutation.reset();
    },
    onSuccess: (result) => {
      setTestState(
        result.status === 'ok'
          ? { ok: true, message: 'Connection succeeded.' }
          : {
              ok: false,
              message: `Connection failed. ${
                TEST_FAILURE[result.error_code] ?? 'The provider did not accept the request.'
              }`,
            },
      );
    },
    onError: (error) => setTestState({ ok: false, message: humanizeApiError(error).message }),
  });
  // The terminal sync poll refreshes every imported read; enqueueing alone persists no projection.
  // react-doctor-disable-next-line
  const syncMutation = useMutation(
    integrationsMutations.sync(connection.workspace_id, connection.id),
  );
  // Name the project: a connection serving several projects needs it.
  const startSync = () =>
    syncMutation.mutate(activeProject ? { project_id: activeProject.id } : {}, {
      onSuccess: (enqueued) => {
        setTestState(null);
        setActiveSyncId(enqueued.sync_run_id);
      },
    });
  const syncRunQuery = useQuery({
    ...integrationsQueries.sync(connection.workspace_id, connection.id, activeSyncId),
    refetchInterval: (query) => pollSyncRun(query.state.data),
  });
  const activeRun = syncRunQuery.data ?? null;
  const runActive = activeRun !== null && SYNC_RUN_STATES[activeRun.status].active;
  const runInFlight = activeRun !== null && isSyncInFlight(activeRun);
  // Pages read the projections, so they refresh once the reports are rebuilt.
  const runTerminal = activeRun !== null && !runInFlight;

  useEffect(() => {
    if (runTerminal) void refreshImportedReads(client);
  }, [client, runTerminal]);

  // Stops importing this property into the project; imported data stays.
  const removeMutation = useMutation(integrationsMutations.deleteMapping(connection.workspace_id));
  // Remove renders only with a mapping; a stale click after it is gone is a no-op.
  const removeMapping = () => {
    if (mapping) removeMutation.mutate(mapping.id);
  };
  const busy = testMutation.isPending || syncMutation.isPending || removeMutation.isPending;

  return (
    <ConnectionRowView
      connection={connection}
      grant={grant}
      // The active mapping, never the connection's account_ref (see `useActiveMapping`).
      hasProperty={Boolean(mapping?.property_ref)}
      testMutation={connectionAction(testMutation, () => testMutation.mutate())}
      syncMutation={connectionAction(syncMutation, startSync)}
      removeMutation={connectionAction(removeMutation, removeMapping)}
      testState={testState}
      activeRun={activeRun}
      runActive={runActive}
      runInFlight={runInFlight}
      busy={busy}
    />
  );
}
