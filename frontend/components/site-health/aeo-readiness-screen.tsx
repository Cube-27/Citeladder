import { AeoReadinessPanel } from '@/components/site-health/aeo-readiness-panel';
import { ReportPage } from '@/components/templates/report-page';
import { Button } from '@/components/ui/button';
import { readErrorProps } from '@/components/ui/notice';
import { ProjectLink } from '@/components/ui/project-link';
import { READ_FAILED, StateBlock } from '@/components/ui/state-block';
import { ICONS } from '@/lib/icons';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useLiveCrawlDashboard } from '@/lib/site-health/use-live-crawl-dashboard';

export function AeoReadinessScreen() {
  const { workspaceId, projectId } = useProjectScope();
  const dashboard = useLiveCrawlDashboard({ workspaceId, projectId });
  const crawl = dashboard.data?.crawl ?? null;
  if (dashboard.isLoading)
    return (
      <ReportPage>
        <StateBlock
          kind="loading"
          label="Loading AEO readiness"
          shape={{ kind: 'table', columns: 4 }}
        />
      </ReportPage>
    );
  if (dashboard.isError && !dashboard.data)
    return (
      <ReportPage>
        <StateBlock
          kind="error"
          {...readErrorProps(dashboard)}
          fallback={READ_FAILED}
          title="Couldn't load the latest Site health crawl"
        />
      </ReportPage>
    );
  if (!crawl)
    return (
      <ReportPage>
        <StateBlock
          kind="empty"
          icon={ICONS.aeoReadiness}
          heading="No Site health crawl yet"
          action={
            <Button asChild>
              <ProjectLink href="/site">Go to Site health</ProjectLink>
            </Button>
          }
        />
      </ReportPage>
    );
  return (
    <ReportPage>
      <AeoReadinessPanel
        workspaceId={workspaceId}
        projectId={projectId}
        crawlId={crawl.id}
        summary={dashboard.data?.score_summary ?? crawl.score_summary ?? null}
      />
    </ReportPage>
  );
}
