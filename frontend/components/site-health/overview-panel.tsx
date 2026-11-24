import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { OverviewDetails } from './overview-details';
import { OverviewMetricCards } from './overview-metrics';
import { Stack } from '@/components/ui/layout';
import { httpErrorStatus } from '@/lib/api/client';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import type { SiteCrawl, SiteHealthDashboard } from '@citeladder/contracts';
import { CRAWL_STATES } from '@/lib/site-health/status';
import { readErrorProps } from '@/components/ui/notice';
import type { LoadingShape } from '@/components/ui/skeleton-block';
import { READ_FAILED, StateBlock } from '@/components/ui/state-block';

const PILLAR_TABLE = { kind: 'table', columns: 3 } satisfies LoadingShape;

export function OverviewPanel({
  workspaceId,
  projectId,
  crawlId,
  crawl,
  dashboard,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  crawlId: string;
  crawl: SiteCrawl | null;
  dashboard: SiteHealthDashboard | undefined;
}>) {
  const terminal = crawl ? !CRAWL_STATES[crawl.status].active : false;
  const overview = useQuery({
    ...siteHealthQueries.overview({ workspaceId, projectId }, crawlId),
    enabled: terminal,
  });
  const data = overview.data;
  if (useAwaitingFirstSnapshot(terminal && overview.isPending))
    return (
      <Stack gap="workspace" className="min-w-0" data-testid="site-health-overview">
        <StateBlock kind="loading" label="Loading Overview" shape={{ kind: 'figures' }} />
        <StateBlock kind="loading" label="Loading Overview details" shape={PILLAR_TABLE} />
      </Stack>
    );
  const summary = dashboard?.score_summary ?? crawl?.score_summary ?? null;
  return (
    <Stack gap="workspace" className="min-w-0" data-testid="site-health-overview">
      {data ? (
        <OverviewDetails
          data={data}
          workspaceId={workspaceId}
          crawlId={crawlId}
          summary={summary}
        />
      ) : (
        <>
          <OverviewMetricCards overview={data} dashboard={dashboard} crawl={crawl} />
          {terminal ? <OverviewReadState overview={overview} /> : null}
        </>
      )}
    </Stack>
  );
}

function OverviewReadState({
  overview,
}: Readonly<{
  overview: Pick<UseQueryResult, 'isError' | 'isLoading' | 'isFetching' | 'error' | 'refetch'>;
}>) {
  if (overview.isError && httpErrorStatus(overview.error) !== 404)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(overview)}
        fallback={READ_FAILED}
        title="Couldn't load the Site health overview"
      />
    );
  if (overview.isLoading)
    return <StateBlock kind="loading" label="Loading Overview details" shape={PILLAR_TABLE} />;
  return null;
}

function useAwaitingFirstSnapshot(snapshotPending: boolean): boolean {
  const [scoresShown, setScoresShown] = useState(false);
  if (!snapshotPending && !scoresShown) setScoresShown(true);
  return snapshotPending && !scoresShown;
}
