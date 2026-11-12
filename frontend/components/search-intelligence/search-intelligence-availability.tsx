import { Unplug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { ProjectLink } from '@/components/ui/project-link';
import { QueryState } from '@/components/ui/query-state';
import { TextLink } from '@/components/ui/text-link';
import { useWorkspaceCapability } from '@/lib/project/project-context';

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
      <QueryState
        kind="empty"
        icon={Unplug}
        heading="Keyword Research is unavailable"
        description="Research is temporarily unavailable on your plan. Try again later."
      />
    );
  if (!canManage)
    return (
      <QueryState
        kind="empty"
        icon={Unplug}
        heading="Connect DataForSEO"
        description="Ask a workspace Owner or Admin to add a DataForSEO login."
      />
    );
  return (
    <QueryState
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
}: Readonly<{ data: { connected: boolean; credential_mode: 'byok' | 'funded' } }>) {
  const canManage = useWorkspaceCapability('manage_credentials');
  if (data.connected) return null;
  if (data.credential_mode === 'funded')
    return (
      <Callout tone="negative">
        Research is temporarily unavailable, so saved results can be read but not refreshed.
      </Callout>
    );
  return (
    <Callout tone="negative">
      DataForSEO is not connected, so saved results can be read but not refreshed.{' '}
      {canManage ? (
        <TextLink href={PROVIDER_SETTINGS}>Open provider settings</TextLink>
      ) : (
        'A workspace Owner or Admin can add the login.'
      )}
    </Callout>
  );
}
