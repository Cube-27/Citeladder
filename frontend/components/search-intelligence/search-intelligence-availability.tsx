import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { Database, Unplug } from '@/lib/icons';
import type { CredentialMode } from '@/lib/api/billing';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

const PROVIDER_SETTINGS = '/settings?tab=providers';

type ResearchTab = 'overview' | 'keywords' | 'backlinks';

const TAB_EMPTY: Readonly<Record<ResearchTab, string>> = {
  overview: 'See where you rank and where competitors outrank you',
  keywords: 'See the keywords your website ranks for',
  backlinks: 'See who links to your website',
};

export function NoAnalysisYet({ tab, action }: Readonly<{ tab: ResearchTab; action: ReactNode }>) {
  return <StateBlock kind="empty" icon={Database} heading={TAB_EMPTY[tab]} action={action} />;
}

export function NotConnected({ funded }: Readonly<{ funded: boolean }>) {
  const canManage = useWorkspaceCapability('manage_credentials');
  let state = (
    <StateBlock
      kind="empty"
      icon={Unplug}
      heading="Connect DataForSEO"
      action={
        <Button asChild>
          <ProjectLink href={PROVIDER_SETTINGS}>Open provider settings</ProjectLink>
        </Button>
      }
    />
  );
  if (!canManage)
    state = (
      <StateBlock
        kind="empty"
        icon={Unplug}
        heading="Connect DataForSEO"
        description="Ask a workspace Owner or Admin to add a DataForSEO login."
      />
    );
  if (funded)
    state = (
      <StateBlock
        kind="empty"
        icon={Unplug}
        heading="Keyword research is unavailable"
        description="Keyword analyses are temporarily unavailable on your plan."
      />
    );
  return state;
}

export function UnavailableNotice({
  data,
}: Readonly<{ data: { connected: boolean; credential_mode: CredentialMode } }>) {
  if (data.connected || data.credential_mode !== 'funded') return null;
  return (
    <Notice tone="negative">
      Research is temporarily unavailable, so saved results can be read but not refreshed.
    </Notice>
  );
}
