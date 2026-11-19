import { useMutation } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { ConnectionRow } from '@/components/settings/integration-connection-row';
import { Dialog } from '@/components/ui/dialog';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import {
  FAMILY_META,
  isGrantGone,
  joinProviderLabels,
  type GrantFamily,
  type GrantModel,
} from '@/components/settings/grant-model';
import { StatusMark } from '@/components/ui/status-mark';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { GoogleMark } from '@/components/ui/google-glyph';
import { InfoHint } from '@/components/ui/info-hint';
import { Inline, Stack } from '@/components/ui/layout';
import { ItemList } from '@/components/ui/list-row';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatTimeZoneNote } from '@/lib/format';
import {
  integrationsApi,
  integrationsMutations,
  type IntegrationConnection,
} from '@/lib/api/integrations';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { textRole } from '@/components/ui/typography';
import { Notice } from '@/components/ui/notice';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
  SectionTitleLine,
} from '@/components/ui/section';

type GrantStatus = IntegrationConnection['grant_status'];
type GrantBadge =
  | { variant: 'status'; value: 'success' | 'warning' | 'danger' }
  | { variant: 'neutral' };

const GRANT_STATUS_BADGE: Record<GrantStatus, GrantBadge> = {
  connected: { variant: 'status', value: 'success' },
  needs_reauth: { variant: 'status', value: 'warning' },
  pending_revocation: { variant: 'status', value: 'warning' },
  error: { variant: 'status', value: 'danger' },
  revoked: { variant: 'neutral' },
};

const GRANT_STATUS_LABEL: Record<GrantStatus, string> = {
  connected: 'Connected',
  needs_reauth: 'Reconnect needed',
  pending_revocation: 'Disconnecting',
  error: 'Error',
  revoked: 'Disconnected',
};

function GrantAlert({ family, status }: Readonly<{ family: GrantFamily; status: GrantStatus }>) {
  const title = FAMILY_META[family].title;

  if (status === 'needs_reauth') {
    return (
      <Notice tone="warning">
        {title} needs you to sign in again. Reconnect to resume syncing. Previously imported data is
        unaffected.
      </Notice>
    );
  }
  if (status === 'error') {
    return (
      <Notice tone="negative">
        The last connection test failed: {title}&nbsp;rejected CiteLadder&rsquo;s access. Reconnect
        to resume syncing.
      </Notice>
    );
  }
  if (status === 'pending_revocation') {
    return (
      <Notice tone="warning">
        Disconnect is finishing. CiteLadder is retrying the {title} revocation in the background.
        Previously imported data is kept.
      </Notice>
    );
  }
  if (status === 'revoked') {
    return (
      <Notice tone="info">
        {title} is disconnected. Imported data is kept; reconnect to resume syncing.
      </Notice>
    );
  }

  return null;
}

function GrantHeader({
  family,
  grant,
  actions,
}: Readonly<{ family: GrantFamily; grant: GrantModel | null; actions?: ReactNode }>) {
  const meta = FAMILY_META[family];
  const badge = grant ? GRANT_STATUS_BADGE[grant.status] : { variant: 'neutral' as const };
  const label = grant ? GRANT_STATUS_LABEL[grant.status] : 'Not connected';

  return (
    <SectionHeader actions={actions}>
      <SectionTitleLine>
        {family === 'google' ? <GoogleMark /> : null}
        <SectionTitle>{meta.title}</SectionTitle>
        {badge.variant === 'status' ? (
          <StatusMark variant="status" value={badge.value} data-testid={`grant-status-${family}`}>
            {label}
          </StatusMark>
        ) : (
          <StatusMark data-testid={`grant-status-${family}`}>{label}</StatusMark>
        )}
      </SectionTitleLine>
      <SectionDescription>{meta.blurb}</SectionDescription>
    </SectionHeader>
  );
}

/** Connect, or connect again: Google's is the named action (3.1). */
function ConnectButton({
  workspaceId,
  family,
}: Readonly<{ workspaceId: string; family: GrantFamily }>) {
  const meta = FAMILY_META[family];
  const start = () =>
    hardNavigate(integrationsApi.oauthStartUrl(meta.connectProvider, workspaceId));
  if (family === 'google') return <ActionButton action="connectGoogle" onClick={start} />;
  return (
    <Button variant="secondary" onClick={start}>
      Connect {meta.title}
    </Button>
  );
}

function ConnectCard({
  workspaceId,
  family,
}: Readonly<{ workspaceId: string; family: GrantFamily }>) {
  const meta = FAMILY_META[family];
  const canManage = useWorkspaceCapability('manage_credentials');

  return (
    <Section data-testid={`grant-card-${family}`}>
      <GrantHeader
        family={family}
        grant={null}
        actions={canManage ? <ConnectButton workspaceId={workspaceId} family={family} /> : null}
      />
      <SectionContent>
        <p className={textRole('body', 'text-ink-2')}>
          {canManage
            ? `Connect your ${meta.title} account to automatically import traffic and search visibility metrics.`
            : `A workspace Owner or Admin can connect ${meta.title} to import traffic and search visibility metrics.`}
        </p>
      </SectionContent>
    </Section>
  );
}

/** Reconnect, with what it does as its description (an info hint beside it). */
function ReconnectButton({
  workspaceId,
  family,
}: Readonly<{ workspaceId: string; family: GrantFamily }>) {
  const meta = FAMILY_META[family];
  const noteId = useId();
  return (
    <Inline gap="tight">
      <Button
        aria-describedby={noteId}
        onClick={() =>
          hardNavigate(integrationsApi.oauthStartUrl(meta.connectProvider, workspaceId))
        }
      >
        Reconnect
      </Button>
      <span id={noteId} hidden>
        {meta.reconnectNote}
      </span>
      <InfoHint label="About reconnecting">{meta.reconnectNote}</InfoHint>
    </Inline>
  );
}

/**
 * Disconnect the whole grant: access is revoked at the provider and every
 * property it serves stops importing. Imported data is kept, so reconnecting
 * resumes the same history.
 */
function DisconnectGrant({ grant }: Readonly<{ grant: GrantModel }>) {
  const [open, setOpen] = useState(false);
  const title = FAMILY_META[grant.family].title;
  const [connection] = grant.connections;
  // Disconnecting stops imports into the same projections a new property feeds.
  const disconnect = useMutation(integrationsMutations.disconnect(connection.workspace_id));
  const sources = joinProviderLabels(grant.connections.map((item) => item.provider));
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Disconnect {title}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!disconnect.isPending) setOpen(next);
        }}
        title={`Disconnect ${title}`}
        description={`CiteLadder's access to ${sources} is revoked and their properties stop importing.`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={disconnect.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => disconnect.mutate(connection.id, { onSuccess: () => setOpen(false) })}
              pending={disconnect.isPending}
              pendingLabel="Disconnecting…"
            >
              Disconnect
            </Button>
          </>
        }
      >
        <Stack gap="compact">
          <p className={textRole('body', 'text-ink-2')}>
            Previously imported data is kept. Reconnecting resumes from it; to stop importing just
            one property, use Remove on its row instead.
          </p>
          {disconnect.isError ? (
            <Notice
              kind="mutation"
              notice={mutationNoticeForError(disconnect.error, {
                action: 'disconnect the integration',
              })}
            />
          ) : null}
        </Stack>
      </Dialog>
    </>
  );
}

function ConnectedCard({
  workspaceId,
  family,
  grant,
}: Readonly<{ workspaceId: string; family: GrantFamily; grant: GrantModel }>) {
  // Connecting and disconnecting are credential actions.
  const canManage = useWorkspaceCapability('manage_credentials');
  const timeZone = useDisplayTimeZone();
  const datesShown = grant.connections.some((connection) => connection.last_synced_at !== null);
  const actions = canManage ? (
    <>
      {grant.status === 'revoked' ? (
        <ConnectButton workspaceId={workspaceId} family={family} />
      ) : (
        <ReconnectButton workspaceId={workspaceId} family={family} />
      )}
      {isGrantGone(grant.status) ? null : <DisconnectGrant grant={grant} />}
    </>
  ) : null;

  return (
    <Section data-testid={`grant-card-${family}`}>
      <GrantHeader family={family} grant={grant} actions={actions} />
      <SectionContent>
        <Stack gap="compact">
          <GrantAlert family={family} status={grant.status} />
          <ItemList>
            {grant.connections.map((connection) => (
              <ConnectionRow key={connection.id} connection={connection} grant={grant} />
            ))}
          </ItemList>
          {datesShown ? (
            <p className={textRole('caption', 'text-ink-2')}>{formatTimeZoneNote(timeZone)}</p>
          ) : null}
        </Stack>
      </SectionContent>
    </Section>
  );
}

export function IntegrationCardView({
  workspaceId,
  family,
  grant,
}: Readonly<{ workspaceId: string; family: GrantFamily; grant: GrantModel | null }>) {
  return grant ? (
    <ConnectedCard workspaceId={workspaceId} family={family} grant={grant} />
  ) : (
    <ConnectCard workspaceId={workspaceId} family={family} />
  );
}
