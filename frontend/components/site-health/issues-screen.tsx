import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ProjectLink } from '@/components/ui/project-link';

import { Button } from '@/components/ui/button';
import { ReportPage } from '@/components/templates/report-page';
import { IssuesCatalog } from '@/components/site-health/issues-catalog';
import { ICONS } from '@/lib/icons';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import type { SiteHealthDashboard } from '@citeladder/contracts';
import { httpErrorStatus } from '@/lib/api/errors';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { IssuesPageLoading } from '@/components/site-health/issues-summary-loading';

/**
 * Issues screen container (Slice 8, mockup 710).
 *
 * Resolves the active project's current (latest/selected) crawl via the
 * dashboard projection, then renders the grouped Issues catalog for that
 * crawl. If no crawl has produced issues yet, it directs the user to run Site
 * Health first (the catalog is per-crawl and there is nothing to group).
 */
export function IssuesScreen() {
  const { workspaceId, projectId } = useProjectScope();
  const dashboardQuery = useQuery(siteHealthQueries.dashboard({ workspaceId, projectId }));
  return (
    <IssuesDataRegion workspaceId={workspaceId} projectId={projectId} dashboard={dashboardQuery} />
  );
}

function IssuesDataRegion({
  workspaceId,
  projectId,
  dashboard,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  dashboard: UseQueryResult<SiteHealthDashboard, Error>;
}>) {
  if (dashboard.isLoading)
    return (
      <ReportPage>
        <IssuesPageLoading />
      </ReportPage>
    );

  const status = httpErrorStatus(dashboard.error);
  const accessDenied = status === 401 || status === 403;
  if (dashboard.isError && (accessDenied || !dashboard.data)) {
    return (
      <ReportPage>
        <StateBlock
          kind="error"
          error={dashboard.error}
          fallback={
            accessDenied
              ? 'Website is unavailable for this project.'
              : "Couldn't load the latest Website crawl."
          }
          title={
            accessDenied
              ? 'Website is unavailable for this project'
              : "Couldn't load the latest Website crawl"
          }
          onRetry={() => void dashboard.refetch()}
          pending={dashboard.isFetching}
        />
      </ReportPage>
    );
  }

  return (
    <IssuesLoadedRegion workspaceId={workspaceId} projectId={projectId} dashboard={dashboard} />
  );
}

function IssuesLoadedRegion({
  workspaceId,
  projectId,
  dashboard,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  dashboard: UseQueryResult<SiteHealthDashboard, Error>;
}>) {
  const crawl = dashboard.data?.crawl ?? null;
  if (dashboard.isError) {
    return crawl ? (
      <IssuesCatalog
        workspaceId={workspaceId}
        projectId={projectId}
        crawlId={crawl.id}
        notice={
          <Notice
            kind="read"
            {...readErrorProps(dashboard)}
            fallback="Could not refresh the latest Website crawl."
            title="Could not refresh the latest Website crawl"
          />
        }
      />
    ) : (
      <ReportPage>
        <StateBlock
          kind="error"
          {...readErrorProps(dashboard)}
          fallback="Could not refresh the latest Website crawl."
          title="Could not refresh the latest Website crawl"
        />
      </ReportPage>
    );
  }
  if (!crawl) {
    return (
      <ReportPage>
        <StateBlock
          kind="empty"
          icon={ICONS.issues}
          heading="No Website crawl yet"
          description="Issue types appear here once a Website crawl finishes. Run one from Website."
          action={
            <Button asChild>
              <ProjectLink href="/site">Go to Website</ProjectLink>
            </Button>
          }
        />
      </ReportPage>
    );
  }
  return <IssuesCatalog workspaceId={workspaceId} projectId={projectId} crawlId={crawl.id} />;
}
