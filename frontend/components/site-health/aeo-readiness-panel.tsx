import { useQuery } from '@tanstack/react-query';

import type { SiteScoreSummary } from '@citeladder/contracts';

import {
  DimensionsTable,
  KindScoresTable,
  ReadableCard,
} from '@/components/site-health/aeo-readiness-cards';
import { IssueTable } from '@/components/site-health/overview-cards';
import { ScoreCard } from '@/components/site-health/score-cards';
import { AppGrid } from '@/components/ui/app-grid';
import { Notice, readErrorProps } from '@/components/ui/notice';
import type { BarRow } from '@/components/ui/score-gauge';
import { SectionStack } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import type { IssuesParams } from '@/lib/api/site-health';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { formatCount } from '@/lib/format';

const AEO_ISSUE_PARAMS = { section: 'aeo', sort: 'severity', limit: 25 } satisfies IssuesParams;

export function AeoReadinessPanel({
  workspaceId,
  projectId,
  crawlId,
  summary,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  crawlId: string;
  summary: SiteScoreSummary | null;
}>) {
  const readiness = useQuery(siteHealthQueries.aeoReadiness({ workspaceId, projectId }, crawlId));
  const issues = useQuery(siteHealthQueries.issues(workspaceId, crawlId, AEO_ISSUE_PARAMS));

  if (readiness.isLoading) {
    return (
      <StateBlock
        kind="loading"
        label="Loading AEO readiness"
        shape={{ kind: 'table', columns: 4 }}
      />
    );
  }
  if (readiness.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(readiness)}
        fallback="Retry in a moment."
        title="Couldn't load AEO readiness"
      />
    );
  if (!readiness.data || readiness.data.crawl_id === null) {
    return (
      <Notice tone="info">{readiness.data?.limitations[0] ?? 'No analyzed crawl yet.'}</Notice>
    );
  }

  const data = readiness.data;
  const groups = new Map<string, string>(
    issues.data?.items.map((issue) => [issue.rule_id, issue.group_id]),
  );
  return (
    <SectionStack data-testid="aeo-readiness">
      {data.limitations.length > 0 ? (
        <Notice tone="info">{data.limitations.join(' ')}</Notice>
      ) : null}
      <AppGrid layout="aside-main">
        <ScoreCard
          title="AEO readiness"
          score={data.score}
          state={data.state}
          rows={[
            pageRow('analyzed', 'Pages audited', data.analysis_count, data.analysis_count),
            pageRow(
              'affected',
              'Pages with an AEO gap',
              data.affected_page_count,
              data.analysis_count,
            ),
          ]}
        />
        <ReadableCard dimensions={data.dimensions} />
      </AppGrid>
      <DimensionsTable
        dimensions={data.dimensions}
        issueHref={(ruleId) => {
          const group = groups.get(ruleId);
          return group ? `/issues?issue=${group}` : `/issues?rule=${encodeURIComponent(ruleId)}`;
        }}
      />
      <KindScoresTable summary={summary} />
      <IssueTable
        title="AEO issues"
        workspaceId={workspaceId}
        crawlId={crawlId}
        params={AEO_ISSUE_PARAMS}
      />
    </SectionStack>
  );
}

function pageRow(key: string, label: string, count: number, of: number): BarRow {
  return {
    key,
    label,
    figure: formatCount(count),
    share: of > 0 ? count / of : null,
    tone: 'ink',
  };
}
