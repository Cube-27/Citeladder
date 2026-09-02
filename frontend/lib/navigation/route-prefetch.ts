import type { QueryClient } from '@tanstack/react-query';

import { aiReferralsApi } from '@/lib/api/ai-referrals';
import { commerceApi } from '@/lib/api/commerce';
import { demandApi } from '@/lib/api/demand';
import { opportunitiesQueries } from '@/lib/api/opportunities';
import { projectsApi } from '@/lib/api/projects';
import { promptsApi } from '@/lib/api/prompts';
import { queryKeys } from '@/lib/api/query-keys';
import { runsQueries } from '@/lib/api/runs';
import { siteHealthQueries } from '@/lib/api/site-health';
import { trafficApi } from '@/lib/api/traffic';
import { visibilityApi } from '@/lib/api/visibility';

type RoutePrefetcher = (client: QueryClient, projectId: string) => void;

/**
 * Primary read intent for data-heavy application destinations. Query keys are
 * identical to each screen's default request, so pointer and keyboard intent
 * warm the existing domain cache rather than creating a navigation cache.
 */
const ROUTE_PREFETCHERS: Readonly<Record<string, RoutePrefetcher>> = {
  '/projects': (client, projectId) => {
    void client.prefetchQuery({
      queryKey: queryKeys.projects.commandCenter(projectId),
      queryFn: ({ signal }) => projectsApi.getCommandCenter(projectId, { signal }),
    });
  },
  '/site': prefetchSiteHealth,
  '/issues': prefetchSiteHealth,
  '/demand': (client, projectId) => {
    void client.prefetchQuery({
      queryKey: queryKeys.demand.latest(projectId),
      queryFn: ({ signal }) => demandApi.getLatest(projectId, { signal }),
    });
  },
  '/traffic': (client, projectId) => {
    const params = { granularity: 'day' as const };
    void client.prefetchQuery({
      queryKey: queryKeys.traffic.dashboard(projectId, params),
      queryFn: ({ signal }) => trafficApi.getTraffic(projectId, params, { signal }),
    });
  },
  '/products': (client, projectId) => {
    void client.prefetchQuery({
      queryKey: queryKeys.commerce.catalog(projectId),
      queryFn: ({ signal }) => commerceApi.catalog(projectId, { signal }),
    });
  },
  '/opportunities': (client, projectId) => {
    void client.prefetchQuery(opportunitiesQueries.summary(projectId));
  },
  '/content': (client, projectId) => {
    void client.prefetchQuery({
      queryKey: queryKeys.demand.latest(projectId),
      queryFn: ({ signal }) => demandApi.getLatest(projectId, { signal }),
    });
  },
  '/prompts': (client, projectId) => {
    void client.prefetchQuery({
      queryKey: queryKeys.prompts.sets(projectId),
      queryFn: ({ signal }) => promptsApi.listPromptSets(projectId, { signal }),
    });
  },
  '/visibility': (client, projectId) => {
    void Promise.all([
      client.prefetchQuery(runsQueries.list(projectId)),
      client.prefetchQuery({
        queryKey: [...queryKeys.visibility.project(projectId), 'core'],
        queryFn: ({ signal }) =>
          visibilityApi.getProjectVisibility(projectId, { cohort: 'core' }, { signal }),
      }),
    ]);
  },
  '/runs': (client, projectId) => {
    void client.prefetchQuery(runsQueries.list(projectId));
  },
  '/ai-referrals': (client, projectId) => {
    const params = { granularity: 'week' as const };
    void client.prefetchQuery({
      queryKey: queryKeys.aiReferrals.dashboard(projectId, params),
      queryFn: ({ signal }) => aiReferralsApi.getDashboard(projectId, params, { signal }),
    });
  },
};

function prefetchSiteHealth(client: QueryClient, projectId: string) {
  void client.prefetchQuery(siteHealthQueries.dashboard(projectId));
}

export function prefetchRoute(client: QueryClient, href: string, projectId: string | null) {
  if (!projectId) return;
  const pathname = new URL(href, 'https://citeladder.local').pathname;
  ROUTE_PREFETCHERS[pathname]?.(client, projectId);
}
