import type { ReactNode } from 'react';
import { Database, Unplug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { TextLink } from '@/components/ui/text-link';
import type { CredentialMode } from '@/lib/api/billing';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

const PROVIDER_SETTINGS = '/settings?tab=providers';

/** Keyword Research's tabs, by the value the URL carries. */
export type ResearchTab = 'overview' | 'keywords' | 'competitors' | 'backlinks';

/** What each tab shows, said by its empty state before anything is saved. */
const TAB_EMPTY: Readonly<Record<ResearchTab, { heading: string; shows: string }>> = {
  overview: {
    heading: 'See where you rank and where competitors outrank you',
    shows: 'Your organic keywords, estimated traffic and backlinks appear here.',
  },
  keywords: {
    heading: 'See the keywords your website ranks for',
    shows: 'Ranking keywords, your top pages and keyword ideas appear here.',
  },
  competitors: {
    heading: 'See the keywords competitors rank for and you do not',
    shows: 'Missing and shared keywords against each saved competitor appear here.',
  },
  backlinks: {
    heading: 'See who links to your website',
    shows: 'Backlinks, referring domains and their monthly history appear here.',
  },
};

/** No saved analysis yet: what this tab shows, and the analysis that fills it. */
export function NoAnalysisYet({ tab, action }: Readonly<{ tab: ResearchTab; action: ReactNode }>) {
  const copy = TAB_EMPTY[tab];
  return (
    <StateBlock
      kind="empty"
      icon={Database}
      heading={copy.heading}
      description={`${copy.shows} Run the first analysis; you see the exact cost before anything is fetched.`}
      action={action}
    />
  );
}

/**
 * Keyword Research without a DataForSEO login and no saved results:
 * unavailable on a funded plan, else a login to add. The login is a
 * credential, so only a role that manages credentials is sent to add it.
 */
export function NotConnected({ funded, tab }: Readonly<{ funded: boolean; tab: ResearchTab }>) {
  const canManage = useWorkspaceCapability('manage_credentials');
  const { shows } = TAB_EMPTY[tab];
  let state = (
    <StateBlock
      kind="empty"
      icon={Unplug}
      heading="Connect DataForSEO"
      description={`${shows} Add your DataForSEO login once to run analyses.`}
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
        description={`${shows} Ask a workspace Owner or Admin to add a DataForSEO login.`}
      />
    );
  if (funded)
    state = (
      <StateBlock
        kind="empty"
        icon={Unplug}
        heading="Keyword research is unavailable"
        description={`${shows} Keyword analyses are temporarily unavailable on your plan. Try again later.`}
      />
    );
  return state;
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
