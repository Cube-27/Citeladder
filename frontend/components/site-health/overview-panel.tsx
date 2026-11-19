import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

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

/** The details open with the AEO readiness by pillar table: Pillar, Score, Coverage. */
const PILLAR_TABLE = { kind: 'table', columns: 3 } satisfies LoadingShape;

/**
 * Overview shares the screen's single polling dashboard while a crawl runs.
 * Its immutable snapshot query is enabled only after the crawl terminalizes.
 */
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
  let overviewBody: ReactNode = null;
  // The snapshot is WRITTEN at terminalization, so before then the endpoint
  // answers 404 by design — an absence, not a failure. Two things used to turn
  // that into a red alert over a perfectly healthy running crawl: hovering the
  // Overview tab warmed this exact query key regardless of the crawl's state,
  // and `isError` is sticky, so the 404 it cached stayed on screen long after
  // `enabled` went false. Report only a failure this query is actually making
  // now, and never the expected absence.
  if (terminal && overview.isError && httpErrorStatus(overview.error) !== 404) {
    overviewBody = (
      <StateBlock
        kind="error"
        {...readErrorProps(overview)}
        fallback={READ_FAILED}
        title="Couldn't load the Site health overview"
      />
    );
  } else if (data) {
    overviewBody = <OverviewDetails data={data} />;
  } else if (terminal && overview.isLoading) {
    overviewBody = (
      <StateBlock kind="loading" label="Loading Overview details" shape={PILLAR_TABLE} />
    );
  }

  return (
    <Stack gap="workspace" className="min-w-0" data-testid="site-health-overview">
      <OverviewMetricCards overview={data} dashboard={dashboard} crawl={crawl} />
      {overviewBody}
    </Stack>
  );
}

/**
 * The panel's first paint waits for a finished crawl's snapshot as one loading
 * box. Drawn early, the score row came up from the live dashboard with a
 * loading box under it, and only then the details: a second loader between
 * the page's first one and the data. Once the scores have been on screen they
 * stay — a recrawl finishing loads its snapshot under them.
 */
function useAwaitingFirstSnapshot(snapshotPending: boolean): boolean {
  const [scoresShown, setScoresShown] = useState(false);
  if (!snapshotPending && !scoresShown) setScoresShown(true);
  return snapshotPending && !scoresShown;
}
