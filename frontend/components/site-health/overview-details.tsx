import type { SiteHealthOverview, SiteScoreSummary } from '@citeladder/contracts';

import { KnownUrlsCard, PageKindsCard, TopIssues } from './overview-cards';
import { AeoScoreCard, SeverityCard, WebFundamentalsScoreCard } from './score-cards';
import { AppGrid } from '@/components/ui/app-grid';
import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';

export function OverviewDetails({
  data,
  workspaceId,
  crawlId,
  summary,
}: Readonly<{
  data: SiteHealthOverview;
  workspaceId: string;
  crawlId: string;
  summary: SiteScoreSummary | null;
}>) {
  return (
    <>
      <AppGrid layout="thirds">
        <WebFundamentalsScoreCard data={data} />
        <AeoScoreCard
          score={data.aeo_readiness_score}
          state={data.aeo_measurement_state}
          dimensions={data.aeo_dimensions}
          actions={
            <Button asChild variant="secondary">
              <ProjectLink href="/aeo-readiness">Open report</ProjectLink>
            </Button>
          }
        />
        <SeverityCard data={data} />
      </AppGrid>
      <TopIssues workspaceId={workspaceId} crawlId={crawlId} />
      <AppGrid layout="halves">
        <PageKindsCard summary={summary} />
        <KnownUrlsCard summary={summary} />
      </AppGrid>
    </>
  );
}
