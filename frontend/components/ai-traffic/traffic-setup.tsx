import { useState } from 'react';
import { Unplug } from 'lucide-react';

import { ActionButton, ACTIONS } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { StateBlock } from '@/components/ui/state-block';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { CrawlLogConnections } from './crawl-log-connections';

/**
 * A view's one next step while it has never had anything to show: with
 * neither GA4 nor crawl logs connected, connect a traffic source (GA4 first);
 * with GA4 connected, a crawl-log view asks for its logs alone. The connect
 * dialog lives here, so the step works the same on every tab.
 */
export function TrafficSetupState({
  ga4Missing,
  crawlAvailable,
}: Readonly<{
  /** True while GA4 is not connected. */
  ga4Missing: boolean;
  /** False when this workspace cannot collect crawl logs yet. */
  crawlAvailable: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const canManage = useWorkspaceCapability('manage_credentials');
  const connectCrawl = crawlAvailable ? (
    <ActionButton action="connectCrawlLogs" onClick={() => setOpen(true)} disabled={!canManage} />
  ) : null;
  return (
    <>
      {ga4Missing ? (
        <StateBlock
          kind="empty"
          icon={Unplug}
          heading="Connect a traffic source"
          action={
            <>
              {/* The Overview's first figures need GA4, so it is the one primary. */}
              <Button asChild>
                <ProjectLink href="/ai-traffic?tab=referrals">
                  Connect Google Analytics 4
                </ProjectLink>
              </Button>
              {crawlAvailable ? (
                <Button variant="quiet" onClick={() => setOpen(true)} disabled={!canManage}>
                  <Icon icon={ACTIONS.connectCrawlLogs.icon} />
                  {ACTIONS.connectCrawlLogs.label}
                </Button>
              ) : null}
            </>
          }
        />
      ) : (
        <StateBlock
          kind="empty"
          icon={Unplug}
          heading="Connect crawl logs"
          action={connectCrawl ?? undefined}
        />
      )}
      {crawlAvailable ? (
        <CrawlLogConnections open={open} onOpenChange={setOpen} headerWhenEmpty={false} />
      ) : null}
    </>
  );
}
