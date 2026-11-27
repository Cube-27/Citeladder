import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { AgentView } from '@citeladder/contracts/agent-views';
import { ViewFrame, ViewRead } from '@/components/agent/thread-view-frame';
import { OverviewFigures, RequestsByPurpose } from '@/components/ai-traffic/overview-signals';
import { useSourceStep } from '@/components/integrations/data-sources';
import {
  SearchIntelligenceRows,
  searchIntelligenceColumns,
} from '@/components/search-intelligence/search-intelligence-rows-table';
import { ScoreSection } from '@/components/site-health/score-section';
import { DataTable } from '@/components/ui/data-table';
import { SectionStack } from '@/components/ui/section';
import { crawlLogsAvailable, useCrawlSources } from '@/lib/ai-traffic/use-crawl-connections';
import { aiTrafficQueries } from '@/lib/api/ai-traffic';
import { searchIntelligenceQueries } from '@/lib/api/search-intelligence';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { agentViewHref } from '@/lib/agent/view-links';
import { defaultRowOrder, type SearchRowOrder } from '@/lib/config/search-intelligence';

type Scope = Readonly<{ workspaceId: string; projectId: string }>;
type ViewOf<Kind extends AgentView['kind']> = Extract<AgentView, { kind: Kind }>;

const KEYWORD_ROWS = 10;

export function SiteHealthView({
  scope,
  view,
}: Readonly<{ scope: Scope; view: ViewOf<'site_health_summary'> }>) {
  const query = useQuery(siteHealthQueries.dashboard(scope, view.crawl_id ?? undefined));
  return (
    <ViewFrame title="Site health" href={agentViewHref(view)}>
      <ViewRead query={query} subject="Site health" shape={{ kind: 'figures' }}>
        {(dashboard) => <ScoreSection crawl={dashboard.crawl} dashboard={dashboard} />}
      </ViewRead>
    </ViewFrame>
  );
}

export function AiTrafficView({
  scope,
  view,
}: Readonly<{ scope: Scope; view: ViewOf<'ai_traffic_overview'> }>) {
  const query = useQuery(aiTrafficQueries.overview(scope, { range: view.range }));
  const sources = useCrawlSources(scope.projectId, scope.workspaceId);
  const ga4 = useSourceStep(scope.workspaceId, scope.projectId, 'ga4');
  const crawlAvailable = sources.data ? crawlLogsAvailable(sources.data) : true;
  const read = {
    data: query.data,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
    isPending: query.isPending || sources.isPending,
  };
  return (
    <ViewFrame title="AI traffic" href={agentViewHref(view)}>
      <ViewRead query={read} subject="AI traffic" shape={{ kind: 'figures' }}>
        {(data) => (
          <SectionStack>
            <OverviewFigures
              data={data}
              projectId={scope.projectId}
              crawlAvailable={crawlAvailable}
              ga4={ga4}
            />
            {data.crawl.series.length ? <RequestsByPurpose series={data.crawl.series} /> : null}
          </SectionStack>
        )}
      </ViewRead>
    </ViewFrame>
  );
}

export function KeywordRowsView({
  scope,
  view,
}: Readonly<{ scope: Scope; view: ViewOf<'keyword_research_rows'> }>) {
  const [chosen, setChosen] = useState<SearchRowOrder | null>(null);
  const dataset = useQuery(
    searchIntelligenceQueries.datasetRows(scope, view.dataset_id, {
      sort: 'id',
      direction: 'asc',
      limit: 1,
    }),
  );
  const kind = dataset.data?.dataset.dataset_kind ?? null;
  const order = chosen ?? defaultRowOrder(kind ?? '');
  const rows = useQuery({
    ...searchIntelligenceQueries.datasetRows(scope, view.dataset_id, {
      ...order,
      limit: KEYWORD_ROWS,
    }),
    enabled: kind !== null,
  });
  const query = kind === null ? dataset : rows;
  return (
    <ViewFrame title="Keyword research" href={agentViewHref(view, kind)}>
      <ViewRead query={query} subject="the saved rows" shape={{ kind: 'table' }}>
        {(page) => (
          <DataTable
            label={page.dataset.target_hostname}
            columns={searchIntelligenceColumns({
              kind: page.dataset.dataset_kind,
              order,
              onSort: (sort) =>
                setChosen({
                  sort,
                  direction: order.sort === sort && order.direction === 'asc' ? 'desc' : 'asc',
                }),
            })}
            pageSize={KEYWORD_ROWS}
            busy={{ active: query.isFetching, label: 'Updating saved rows' }}
            state={
              page.items.length
                ? undefined
                : { kind: 'empty', headingLevel: 3, heading: 'No saved rows in this dataset' }
            }
          >
            <SearchIntelligenceRows kind={page.dataset.dataset_kind} rows={page.items} />
          </DataTable>
        )}
      </ViewRead>
    </ViewFrame>
  );
}
