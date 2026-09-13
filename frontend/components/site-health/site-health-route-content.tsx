'use client';

import { AgentLauncher } from '@/components/layout/agent-sheet';
import { PageHeader } from '@/components/layout/page-header';
import { textRole } from '@/components/ui/typography';

import { IssuesScreen } from './issues-screen';
import { SiteHealthScreen } from './site-health-screen';
import { UrlDetail } from './url-detail';

/** Shared Website content for the active project's current crawl. */
export function WebsiteRouteContent() {
  return (
    <div className="flex flex-col gap-[var(--page-section-gap)]">
      <SiteHealthScreen />
      <AgentLauncher
        taskType="build_roadmap"
        objective="Build a roadmap from the current Website evidence."
        className={textRole(
          'bodyStrong',
          'text-accent-text self-start underline-offset-2 hover:underline',
        )}
      >
        Build a roadmap with the Growth Agent
      </AgentLauncher>
    </div>
  );
}

/** Shared Issues catalog route content for the active project. */
export function IssuesRouteContent() {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <PageHeader />
      <IssuesScreen />
    </div>
  );
}

/** Shared crawl-scoped page-detail route content. */
export function WebsitePageDetailRouteContent({
  crawlId,
  siteUrlId,
}: Readonly<{ crawlId: string; siteUrlId: string }>) {
  return <UrlDetail crawlId={crawlId} siteUrlId={siteUrlId} />;
}
