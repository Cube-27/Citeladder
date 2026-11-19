import { Button } from '@/components/ui/button';
import { StateBlock } from '@/components/ui/state-block';
import { ICONS } from '@/lib/icons';
import { integrationsApi } from '@/lib/api/integrations';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Settings → Integrations when the workspace has no connections yet: the
 * page's empty state, Connect Google its main action and Connect Bing the
 * supporting one.
 *
 * Both are full-page navigations to the same-origin OAuth start endpoints
 * (302s — never apiClient fetches): one Google consent links Search Console +
 * Analytics 4 on a shared grant; Bing needs its own consent because a Google
 * token cannot authorize Bing Webmaster Tools (the Bing account itself may
 * still have been created with a Google ID).
 */
export function IntegrationsEmptyState({ workspaceId }: Readonly<{ workspaceId: string }>) {
  // Connecting is a credential action, offered only to a role that may take it.
  const canManage = useWorkspaceCapability('manage_credentials');
  return (
    <StateBlock
      kind="empty"
      icon={ICONS.connect}
      heading="No integrations connected"
      description={
        canManage
          ? undefined
          : 'A workspace Owner or Admin can connect Google Search Console, Analytics 4 and Bing Webmaster Tools.'
      }
      action={
        canManage ? (
          <>
            <Button onClick={() => hardNavigate(integrationsApi.oauthStartUrl('gsc', workspaceId))}>
              Connect Google
            </Button>
            <Button
              variant="secondary"
              onClick={() => hardNavigate(integrationsApi.oauthStartUrl('bing', workspaceId))}
            >
              Connect Bing
            </Button>
          </>
        ) : undefined
      }
    />
  );
}
