'use client';

import { AgentLauncher } from '@/components/layout/agent-sheet';
import { PageRegion } from '@/components/layout/page-shell';
import { textRole } from '@/components/ui/typography';

import { IssuesScreen } from './issues-screen';
import { SiteHealthScreen } from './site-health-screen';
import { UrlDetail } from './url-detail';

/** Shared Website content for the active project's current crawl. */
export function WebsiteRouteContent() {
  return (
    <>
      <SiteHealthScreen />
      {/* Outside the screen's own bands, so it keeps the page's gutter without
          being mounted by every test that renders the screen alone. */}
      <PageRegion>
        <AgentLauncher
          taskType="build_roadmap"
          objective="Build a roadmap from the current Website evidence."
          className={textRole(
            'bodyStrong',
            'text-accent-text inline-block underline-offset-2 hover:underline',
          )}
        >
          Build a roadmap with the Growth Agent
        </AgentLauncher>
      </PageRegion>
    </>
  );
}

/** Shared Issues catalog route content for the active project. */
export function IssuesRouteContent() {
  return <IssuesScreen />;
}

/** Shared crawl-scoped page-detail route content. */
export function WebsitePageDetailRouteContent({
  crawlId,
  siteUrlId,
}: Readonly<{ crawlId: string; siteUrlId: string }>) {
  return <UrlDetail crawlId={crawlId} siteUrlId={siteUrlId} />;
}
