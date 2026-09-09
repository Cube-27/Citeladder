import type { QueryClient } from '@tanstack/react-query';

import { aiReferralsApi } from '@/lib/api/ai-referrals';
import { commerceApi } from '@/lib/api/commerce';
import { demandApi } from '@/lib/api/demand';
import { opportunitiesQueries } from '@/lib/api/opportunities';
import { projectsApi } from '@/lib/api/projects';
import { promptsApi } from '@/lib/api/prompts';
import { warmQuery } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { runsQueries } from '@/lib/api/runs';
import { siteHealthQueries } from '@/lib/api/site-health';
import { performanceQueries } from '@/lib/api/performance';
import { INITIAL_VISIBILITY_PARAMS, visibilityQueries } from '@/lib/api/visibility';
import { INITIAL_DASHBOARD_PARAMS } from '@/lib/performance/performance';

type RoutePrefetcher = (client: QueryClient, projectId: string) => void;

/**
 * Primary read intent for data-heavy application destinations. Query keys are
 * identical to each screen's default request, so pointer and keyboard intent
 * warm the existing domain cache rather than creating a navigation cache.
 */
const ROUTE_PREFETCHERS: Readonly<Record<string, RoutePrefetcher>> = {
  '/projects': (client, projectId) => {
    warmQuery(client, {
      queryKey: queryKeys.projects.commandCenter(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        projectsApi.getCommandCenter(projectId, { signal }),
    });
  },
  '/site': prefetchSiteHealth,
  '/issues': prefetchSiteHealth,
  '/demand': (client, projectId) => {
    warmQuery(client, {
      queryKey: queryKeys.demand.latest(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) => demandApi.getLatest(projectId, { signal }),
    });
  },
  '/performance': (client, projectId) => {
    // The landing view, built from the screen's own defaults: the latest
    // persisted snapshot, daily buckets, no comparison.
    warmQuery(client, performanceQueries.dashboard(projectId, INITIAL_DASHBOARD_PARAMS));
  },
  '/products': (client, projectId) => {
    warmQuery(client, {
      queryKey: queryKeys.commerce.catalog(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) => commerceApi.catalog(projectId, { signal }),
    });
  },
  '/opportunities': (client, projectId) => {
    warmQuery(client, opportunitiesQueries.summary(projectId));
  },
  '/prompts': (client, projectId) => {
    warmQuery(client, {
      queryKey: queryKeys.prompts.sets(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        promptsApi.listPromptSets(projectId, { signal }),
    });
  },
  '/visibility': (client, projectId) => {
    warmQuery(client, runsQueries.list(projectId));
    // The landing selection, built from the screen's own defaults. A key
    // spelled out here drifted from the one the screen reads and warmed an
    // entry nothing consumed.
    warmQuery(client, visibilityQueries.project(projectId, INITIAL_VISIBILITY_PARAMS));
  },
  '/runs': (client, projectId) => {
    warmQuery(client, runsQueries.list(projectId));
  },
  '/ai-referrals': (client, projectId) => {
    const params = { granularity: 'week' as const };
    warmQuery(client, {
      queryKey: queryKeys.aiReferrals.dashboard(projectId, params),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        aiReferralsApi.getDashboard(projectId, params, { signal }),
    });
  },
};

function prefetchSiteHealth(client: QueryClient, projectId: string) {
  warmQuery(client, siteHealthQueries.dashboard(projectId));
}

export function prefetchRoute(client: QueryClient, href: string, projectId: string | null) {
  if (!projectId) return;
  const pathname = new URL(href, 'https://citeladder.local').pathname;
  ROUTE_PREFETCHERS[pathname]?.(client, projectId);
}
