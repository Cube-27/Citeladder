'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ProjectLink } from '@/components/layout/scoped-link';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IssuesLoading } from '@/components/site-health/issues-loading';
import { ReadError } from '@/components/ui/read-error';
import { IssuesCatalog } from '@/components/site-health/issues-catalog';
import { AccentEyebrow } from '@/components/ui/eyebrow';
import { textRole } from '@/components/ui/typography';
import { siteHealthQueries } from '@/lib/api/site-health';
import type { SiteHealthDashboard } from '@/lib/api/types';
import { httpErrorStatus } from '@/lib/api/errors';
import { useProjectContext } from '@/lib/project/project-context';
import { resolveProjectRequestScope } from '@/lib/project/request-scope';

/**
 * Issues screen container (Slice 8, mockup 710).
 *
 * Resolves the active project's current (latest/selected) crawl via the
 * dashboard projection, then renders the grouped Issues catalog for that
 * crawl. If no crawl has produced issues yet, it directs the user to run Site
 * Health first (the catalog is per-crawl and there is nothing to group).
 */
export function IssuesScreen() {
  const { activeProject, activeWorkspaceId, isLoading: projectLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const requestScope = resolveProjectRequestScope(activeWorkspaceId, projectId);

  const dashboardQuery = useQuery({
    ...siteHealthQueries.dashboard(requestScope.workspaceId, requestScope.projectId),
    enabled: requestScope.enabled,
  });

  return (
    <div className="grid min-w-0 gap-4">
      <IssuesDataRegion
        projectId={projectId}
        workspaceId={activeWorkspaceId}
        projectLoading={projectLoading}
        dashboard={dashboardQuery}
      />
    </div>
  );
}

function IssuesDataRegion({
  projectId,
  workspaceId,
  projectLoading,
  dashboard,
}: Readonly<{
  projectId: string | null;
  workspaceId: string | null;
  projectLoading: boolean;
  dashboard: UseQueryResult<SiteHealthDashboard, Error>;
}>) {
  if (!projectId && !projectLoading)
    return <Alert tone="info">Select or create a project to view its Site Health issues.</Alert>;
  if (projectLoading || dashboard.isLoading) return <IssuesLoading />;

  const status = httpErrorStatus(dashboard.error);
  const accessDenied = status === 401 || status === 403;
  if (dashboard.isError && (accessDenied || !dashboard.data)) {
    return (
      <ReadError
        error={dashboard.error}
        fallback={
          accessDenied
            ? 'Site Health is unavailable for this project.'
            : 'Could not load Site Health.'
        }
        onRetry={() => void dashboard.refetch()}
        pending={dashboard.isFetching}
      />
    );
  }

  return <IssuesLoadedRegion workspaceId={workspaceId} dashboard={dashboard} />;
}

function IssuesLoadedRegion({
  workspaceId,
  dashboard,
}: Readonly<{
  workspaceId: string | null;
  dashboard: UseQueryResult<SiteHealthDashboard, Error>;
}>) {
  const crawl = dashboard.data?.crawl ?? null;
  if (dashboard.isError) {
    return (
      <>
        <ReadError
          error={dashboard.error}
          fallback="Could not refresh Site Health."
          onRetry={() => void dashboard.refetch()}
          pending={dashboard.isFetching}
        />
        {crawl && workspaceId ? (
          <IssuesCatalog workspaceId={workspaceId} crawlId={crawl.id} />
        ) : null}
      </>
    );
  }
  if (!crawl) {
    return (
      <Card>
        <CardContent className="grid gap-3 py-[var(--empty-state-padding)]">
          <AccentEyebrow>Issues</AccentEyebrow>
          <h2 className={textRole('sectionTitle')}>No Site Health crawl yet</h2>
          <p className="text-secondary max-w-md text-sm">
            Run Site Health to discover and analyze this project&apos;s pages — grouped issues will
            appear here once a crawl finishes.
          </p>
          <Button variant="secondary" asChild>
            <ProjectLink href="/site">Go to Website</ProjectLink>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return workspaceId ? <IssuesCatalog workspaceId={workspaceId} crawlId={crawl.id} /> : null;
}
