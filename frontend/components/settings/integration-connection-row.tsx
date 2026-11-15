import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZap, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';

import { BackfillHistory } from '@/components/settings/backfill-progress';
import { PROVIDER_META, type GrantModel } from '@/components/settings/grant-model';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import {
  PropertyPicker,
  SelectedPropertyMark,
  useActiveMapping,
} from '@/components/settings/property-picker';
import { StatusMark } from '@/components/ui/status-mark';
import { Button } from '@/components/ui/button';
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
import { IconTile } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';

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

function ConnectionActions({
  connection,
  label,
  busy,
  hasProperty,
  syncDisabled,
  testPending,
  syncPending,
  removePending,
  onTest,
  onSync,
  onRemove,
}: Readonly<{
  connection: IntegrationConnection;
  label: string;
  busy: boolean;
  hasProperty: boolean;
  syncDisabled: boolean;
  testPending: boolean;
  syncPending: boolean;
  removePending: boolean;
  onTest: () => void;
  onSync: () => void;
  onRemove: () => void;
}>) {
  // Testing and removing touch the credential; syncing is a run. Each is
  // offered only to a role that may do it.
  const canManage = useWorkspaceCapability('manage_credentials');
  const canRun = useWorkspaceCapability('run');

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <PropertyPicker connection={connection} disabled={busy} />
      {canManage ? (
        <Button
          variant="quiet"
          className="min-w-14"
          onClick={onTest}
          disabled={busy}
          aria-label={`Test ${label}`}
        >
          <PlugZap className="size-4" aria-hidden />
          {testPending ? 'Testing…' : 'Test'}
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
      {hasProperty && canManage ? (
        <Button
          variant="danger"
          onClick={onRemove}
          disabled={busy}
          pending={removePending}
          pendingLabel="Removing…"
          aria-label={`Remove ${label} property from this project`}
        >
          Remove
        </Button>
      ) : null}
    </div>
  );
}

/** A status mark and the sentence after it, cut to one line with the whole in a tooltip. */
function MarkLine({ mark, text }: Readonly<{ mark: ReactNode; text: ReactNode }>) {
  return (
    <>
      {mark}
      <span className="min-w-0 truncate" title={typeof text === 'string' ? text : undefined}>
        {text}
      </span>
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
  actionError,
  testState,
  activeRun,
  runActive,
  grantConnected,
}: Readonly<{
  actionError: unknown;
  testState: { ok: boolean; message: string } | null;
  activeRun: SyncRun | null;
  runActive: boolean;
  grantConnected: boolean;
}>) {
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
  propertyRef,
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
  propertyRef: string;
  testMutation: ConnectionMutation;
  syncMutation: ConnectionMutation;
  removeMutation: ConnectionMutation;
  testState: { ok: boolean; message: string } | null;
  activeRun: SyncRun | null;
  runActive: boolean;
  runInFlight: boolean;
  busy: boolean;
}>) {
  const { label, Icon } = PROVIDER_META[connection.provider];
  const actionError = syncMutation.error ?? removeMutation.error;
  const hasProperty = propertyRef !== '';
  const grantConnected = grant.status === 'connected';
  // Until a property is chosen the row's only state is that it has none.
  const status =
    hasProperty || actionError || testState || activeRun ? (
      <ConnectionStatus
        actionError={actionError}
        testState={testState}
        activeRun={activeRun}
        runActive={runActive}
        grantConnected={grantConnected}
      />
    ) : null;

  return (
    <li
      className="border-rule flex min-h-14 flex-col gap-2 border-b py-3 last:border-b-0 @[640px]:flex-row @[640px]:items-center @[640px]:gap-3"
      data-testid={`connection-row-${connection.provider}`}
    >
      <ConnectionText connection={connection} label={label} Icon={Icon} />
      <div
        className={textRole(
          'caption',
          'text-ink-2 flex min-w-0 items-center gap-2 @[640px]:max-w-[40%] @[640px]:flex-[0_1_auto]',
        )}
      >
        <SelectedPropertyMark connection={connection} />
        {status}
      </div>
      <ConnectionActions
        connection={connection}
        label={label}
        busy={busy}
        hasProperty={hasProperty}
        syncDisabled={busy || runInFlight || !hasProperty || !grantConnected}
        testPending={testMutation.isPending}
        syncPending={syncMutation.isPending}
        removePending={removeMutation.isPending}
        onTest={testMutation.mutate}
        onSync={syncMutation.mutate}
        onRemove={removeMutation.mutate}
      />
    </li>
  );
}

/** The tile, the source's name and its sync line: when it last synced and how much history it holds. */
function ConnectionText({
  connection,
  label,
  Icon,
}: Readonly<{ connection: IntegrationConnection; label: string; Icon: LucideIcon }>) {
  const timeZone = useDisplayTimeZone();
  const lastSynced = connection.last_synced_at;
  return (
    <div className="flex min-w-0 items-center gap-3 @[640px]:flex-[1_1_16rem]">
      <IconTile icon={Icon} />
      <div className="grid min-w-0">
        <p className={textRole('label', 'text-ink truncate')}>{label}</p>
        {/* The connection is the workspace's, so its sync is too; the card's foot names the zone. */}
        <div className={textRole('caption', 'text-ink-2 flex min-w-0 flex-wrap gap-x-1')}>
          <span className="whitespace-nowrap">
            Last synced{' '}
            {lastSynced ? (
              <time dateTime={lastSynced}>{formatTableTimestamp(lastSynced, timeZone)}</time>
            ) : (
              'never'
            )}{' '}
            ·
          </span>
          <span className="flex min-w-0 gap-1">
            <span className="shrink-0">History</span>
            <BackfillHistory workspaceId={connection.workspace_id} connectionId={connection.id} />
          </span>
        </div>
      </div>
    </div>
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
      propertyRef={mapping?.property_ref ?? ''}
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
