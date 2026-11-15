import { Unplug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { TextLink } from '@/components/ui/text-link';
import type { CredentialMode } from '@/lib/api/billing';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

const PROVIDER_SETTINGS = '/settings?tab=providers';

/**
 * Keyword Research without a DataForSEO login and no saved results:
 * unavailable on a funded plan, else a login to add. The login is a
 * credential, so only a role that manages credentials is sent to add it.
 */
export function NotConnected({ funded }: Readonly<{ funded: boolean }>) {
  const canManage = useWorkspaceCapability('manage_credentials');
  if (funded)
    return (
      <StateBlock
        kind="empty"
        icon={Unplug}
        heading="Keyword Research is unavailable"
        description="Research is temporarily unavailable on your plan. Try again later."
      />
    );
  if (!canManage)
    return (
      <StateBlock
        kind="empty"
        icon={Unplug}
        heading="Connect DataForSEO"
        description="Ask a workspace Owner or Admin to add a DataForSEO login."
      />
    );
  return (
    <StateBlock
      kind="empty"
      icon={Unplug}
      heading="Connect DataForSEO"
      description="Add your DataForSEO login once to run analyses."
      action={
        <Button asChild variant="secondary">
          <ProjectLink href={PROVIDER_SETTINGS}>Open provider settings</ProjectLink>
        </Button>
      }
    />
  );
}

/** Why saved results cannot be refreshed: a missing connection, or managed research being down. */
export function UnavailableNotice({
  data,
}: Readonly<{ data: { connected: boolean; credential_mode: CredentialMode } }>) {
  const canManage = useWorkspaceCapability('manage_credentials');
  if (data.connected) return null;
  if (data.credential_mode === 'funded')
    return (
      <Notice tone="negative">
        Research is temporarily unavailable, so saved results can be read but not refreshed.
      </Notice>
    );
  return (
    <Notice tone="negative">
      DataForSEO is not connected, so saved results can be read but not refreshed.{' '}
      {canManage ? (
        <TextLink href={PROVIDER_SETTINGS}>Open provider settings</TextLink>
      ) : (
        'A workspace Owner or Admin can add the login.'
      )}
    </Notice>
  );
}
