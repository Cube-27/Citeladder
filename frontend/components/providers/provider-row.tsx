import { executionFailureReason } from '@/lib/runs/status';
import { endSentence, formatDisplayTimestamp } from '@/lib/format';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { useId, useState } from 'react';

import { StatusMark } from '@/components/ui/status-mark';
import { BrandMark } from '@/components/ui/brand-mark';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Inline, Stack } from '@/components/ui/layout';
import { Text } from '@/components/ui/typography';
import type { ProviderConnection } from '@citeladder/contracts';
import {
  ENGINE_LOGOS,
  TRANSPORT_DOMAINS,
  isConfigured,
  type ProviderGroup,
} from '@/lib/providers/catalog';
import { useProviderConnection } from '@/lib/providers/use-provider-connection';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import { ProviderConnectionFields } from './provider-connection-fields';

type ConnectionState = ReturnType<typeof useProviderConnection>;

const TRANSPORT_LOGOS: Partial<Record<ProviderGroup['transport'], string>> = {
  anthropic: ENGINE_LOGOS.claude,
};

function StatusBadge({
  group,
  connection,
  compact,
}: Readonly<{
  group: ProviderGroup;
  connection: ProviderConnection | undefined;
  compact: boolean;
}>) {
  if (group.engines.some((engine) => engine.state === 'connected')) {
    return (
      <StatusMark variant="status" value="success">
        Connected
      </StatusMark>
    );
  }
  if (group.engines.some((engine) => engine.pause)) {
    return (
      <StatusMark variant="status" value="warning">
        Paused
      </StatusMark>
    );
  }
  if (group.engines.some((engine) => engine.state === 'failed')) {
    return (
      <StatusMark variant="status" value="danger">
        Failed
      </StatusMark>
    );
  }
  if (isConfigured(connection)) {
    return (
      <StatusMark variant="status" value="warning">
        Not verified
      </StatusMark>
    );
  }
  return compact ? null : <StatusMark>Not connected</StatusMark>;
}

const PAUSE_REASONS: Record<string, string> = {
  provider_account: 'The provider refused the account. Check its funds and status.',
  auth: 'The provider rejected the key.',
};

function PauseNotice({
  pause,
  reason,
}: Readonly<{ pause: NonNullable<ProviderGroup['engines'][number]['pause']>; reason: string }>) {
  const timeZone = useDisplayTimeZone();
  return (
    <Text as="p" variant="caption" tone="negative">
      {pause.until ? `Paused until ${formatDisplayTimestamp(pause.until, timeZone)}.` : 'Paused.'}{' '}
      {PAUSE_REASONS[reason] ?? ''} A passing test resumes it.
    </Text>
  );
}

function LastFailure({ group }: Readonly<{ group: ProviderGroup }>) {
  const paused = group.engines.find((engine) => engine.pause);
  if (paused?.pause)
    return <PauseNotice pause={paused.pause} reason={paused.latest_probe?.safe_reason ?? ''} />;
  const probe = group.engines.find(
    (engine) => engine.state === 'failed' && engine.latest_probe,
  )?.latest_probe;
  if (!probe) return null;
  return (
    <Text as="p" variant="caption" tone="negative">
      Last test failed.
      {probe.safe_reason
        ? ` ${endSentence(executionFailureReason(probe.safe_reason, probe.safe_reason))}`
        : ''}
    </Text>
  );
}

function CredentialForm({ id, state }: Readonly<{ id: string; state: ConnectionState }>) {
  const {
    configured,
    hasCredentialInput,
    hasPartialCredentialInput,
    saveMutation,
    testMutation,
    removeMutation,
    busy,
  } = state;
  const [confirming, setConfirming] = useState(false);
  const noun = state.credentialShape === 'basic' ? 'credentials' : 'key';
  const saveVerb = configured ? 'Update' : 'Save';
  const saveLabel = saveMutation.isPending ? 'Saving & testing…' : `${saveVerb} ${noun}`;
  return (
    <Stack gap="compact" id={id}>
      <ProviderConnectionFields state={state} />
      <Inline wrap justify="end">
        {state.connection ? (
          <Button
            type="button"
            variant="quiet"
            box="push"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            Remove {noun}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => testMutation.mutate()}
          disabled={busy || !state.connection}
        >
          {testMutation.isPending ? 'Testing…' : 'Test connection'}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => saveMutation.mutate()}
          disabled={busy || hasPartialCredentialInput || (!hasCredentialInput && !configured)}
        >
          {saveLabel}
        </Button>
      </Inline>
      <ConfirmDialog
        request={
          confirming
            ? {
                title: `Remove the saved ${noun}?`,
                body: 'Runs stop using it. Past results are kept.',
                confirmLabel: `Remove ${noun}`,
                destructive: true,
                onConfirm: () =>
                  removeMutation.mutate(undefined, { onSettled: () => setConfirming(false) }),
              }
            : null
        }
        pending={removeMutation.isPending}
        onCancel={() => setConfirming(false)}
      />
    </Stack>
  );
}

export function ProviderRow({
  group,
  connections,
  defaultOpen = false,
  compact = false,
}: Readonly<{
  group: ProviderGroup;
  connections: ProviderConnection[];
  defaultOpen?: boolean;
  compact?: boolean;
}>) {
  const canManage = useWorkspaceCapability('manage_credentials');
  const [open, setOpen] = useState(defaultOpen && canManage);
  const formId = useId();
  const state = useProviderConnection({ group, connections, onSaved: () => setOpen(false) });
  const closedAction = state.configured ? 'Manage' : 'Connect';
  const toggleLabel = open ? 'Close' : closedAction;
  return (
    <Stack as="li" gap="compact">
      <Inline gap="workspace" wrap align="start">
        <Inline gap="compact" align="start" box="fill">
          <BrandMark
            name={group.label}
            logoUrl={TRANSPORT_LOGOS[group.transport]}
            websiteUrl={TRANSPORT_DOMAINS[group.transport]}
          />
          <div className="grid min-w-0">
            <Text as="h3" variant="label">
              {group.label}
            </Text>
            {compact ? null : (
              <Text as="p" variant="caption">
                {group.engines.map((engine) => engine.label).join(' · ')}
              </Text>
            )}
          </div>
        </Inline>
        <Inline box="line">
          <StatusBadge group={group} connection={state.connection} compact={compact} />
          {canManage ? (
            <Button
              type="button"
              variant={open ? 'quiet' : 'secondary'}
              aria-expanded={open}
              aria-controls={formId}
              aria-label={`${toggleLabel} ${group.label}`}
              onClick={() => setOpen((current) => !current)}
            >
              {toggleLabel}
            </Button>
          ) : null}
        </Inline>
      </Inline>
      <LastFailure group={group} />
      {open && canManage ? <CredentialForm id={formId} state={state} /> : null}
    </Stack>
  );
}
