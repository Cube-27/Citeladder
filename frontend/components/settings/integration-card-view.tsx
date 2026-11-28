import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import {
  CONNECT_ADMIN_ONLY,
  ConnectProviderButton,
} from '@/components/settings/connect-provider-button';
import { ConnectionRow } from '@/components/settings/integration-connection-row';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  FAMILY_META,
  isGrantGone,
  joinProviderLabels,
  type GrantFamily,
  type GrantModel,
} from '@/components/settings/grant-model';
import { StatusMark, type StatusTone } from '@/components/ui/status-mark';
import { Button } from '@/components/ui/button';
import { GlyphMark } from '@/components/ui/engine-mark';
import { SectionBleed } from '@/components/ui/section';
import { SettingRow, SettingRows, SettingsGroup } from '@/components/ui/setting-row';
import {
  integrationsApi,
  integrationsMutations,
  type IntegrationConnection,
} from '@/lib/api/integrations';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice } from '@/components/ui/notice';

type GrantStatus = IntegrationConnection['grant_status'];
const GRANT_STATUS_TONE: Record<GrantStatus, StatusTone> = {
  connected: 'positive',
  needs_reauth: 'warning',
  pending_revocation: 'warning',
  error: 'negative',
  revoked: 'neutral',
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
    return <Notice tone="warning">{title} needs you to sign in again.</Notice>;
  }
  if (status === 'error') {
    return <Notice tone="negative">{title} rejected CiteLadder&rsquo;s access.</Notice>;
  }
  return null;
}

function GrantStatus({
  family,
  grant,
}: Readonly<{ family: GrantFamily; grant: GrantModel | null }>) {
  return (
    <StatusMark
      tone={grant ? GRANT_STATUS_TONE[grant.status] : 'neutral'}
      data-testid={`grant-status-${family}`}
    >
      {grant ? GRANT_STATUS_LABEL[grant.status] : 'Not connected'}
    </StatusMark>
  );
}

function GrantTitle({ family }: Readonly<{ family: GrantFamily }>) {
  return (
    <>
      {family === 'google' ? <GlyphMark glyph="google" placement="row" /> : null}
      {FAMILY_META[family].title}
    </>
  );
}

function ConnectButton({
  workspaceId,
  family,
}: Readonly<{ workspaceId: string; family: GrantFamily }>) {
  return (
    <ConnectProviderButton
      family={family}
      onConnect={() =>
        hardNavigate(
          integrationsApi.oauthStartUrl(FAMILY_META[family].connectProvider, workspaceId),
        )
      }
    />
  );
}

function ConnectCard({
  workspaceId,
  family,
}: Readonly<{ workspaceId: string; family: GrantFamily }>) {
  const canManage = useWorkspaceCapability('manage_credentials');

  return (
    <div data-testid={`grant-card-${family}`}>
      <SettingsGroup
        title={<GrantTitle family={family} />}
        status={<GrantStatus family={family} grant={null} />}
        action={canManage ? <ConnectButton workspaceId={workspaceId} family={family} /> : null}
      >
        {canManage ? null : (
          <SettingRows>
            <SettingRow label={CONNECT_ADMIN_ONLY} />
          </SettingRows>
        )}
      </SettingsGroup>
    </div>
  );
}

function ReconnectButton({
  workspaceId,
  family,
}: Readonly<{ workspaceId: string; family: GrantFamily }>) {
  const meta = FAMILY_META[family];
  return (
    <Button
      onClick={() => hardNavigate(integrationsApi.oauthStartUrl(meta.connectProvider, workspaceId))}
    >
      Reconnect
    </Button>
  );
}

function DisconnectGrant({ grant }: Readonly<{ grant: GrantModel }>) {
  const [open, setOpen] = useState(false);
  const title = FAMILY_META[grant.family].title;
  const [connection] = grant.connections;
  const disconnect = useMutation(integrationsMutations.disconnect(connection.workspace_id));
  const sources = joinProviderLabels(grant.connections.map((item) => item.provider));
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Disconnect {title}
      </Button>
      <ConfirmDialog
        request={
          open
            ? {
                question: `Disconnect ${title}`,
                body: `CiteLadder's access to ${sources} is revoked and their properties stop importing.`,
                confirmLabel: 'Disconnect',
                destructive: true,
                onConfirm: () =>
                  disconnect.mutate(connection.id, { onSuccess: () => setOpen(false) }),
              }
            : null
        }
        pending={disconnect.isPending}
        onCancel={() => setOpen(false)}
      >
        <Notice kind="mutation" error={disconnect.error} act="disconnect the integration" />
      </ConfirmDialog>
    </>
  );
}

function ConnectedCard({
  workspaceId,
  family,
  grant,
}: Readonly<{ workspaceId: string; family: GrantFamily; grant: GrantModel }>) {
  const canManage = useWorkspaceCapability('manage_credentials');
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
    <div data-testid={`grant-card-${family}`}>
      <SettingsGroup
        title={<GrantTitle family={family} />}
        status={<GrantStatus family={family} grant={grant} />}
        action={actions}
      >
        <GrantAlert family={family} status={grant.status} />
        <SectionBleed as="ul" rows>
          {grant.connections.map((connection) => (
            <ConnectionRow key={connection.id} connection={connection} grant={grant} />
          ))}
        </SectionBleed>
      </SettingsGroup>
    </div>
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
