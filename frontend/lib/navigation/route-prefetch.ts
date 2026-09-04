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
import { performanceApi } from '@/lib/api/performance';
import { visibilityApi } from '@/lib/api/visibility';

type RoutePrefetcher = (client: QueryClient, projectId: string) => void;

/**
 * Primary read intent for data-heavy application destinations. Query keys are
 * identical to each screen's default request, so pointer and keyboard intent
 * warm the existing domain cache rather than creating a navigation cache.
 */
const ROUTE_PREFETCHERS: Readonly<Record<string, RoutePrefetcher>> = {
  '/projects': (client, projectId) => {
    warm(client, {
      queryKey: queryKeys.projects.commandCenter(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        projectsApi.getCommandCenter(projectId, { signal }),
    });
  },
  '/site': prefetchSiteHealth,
  '/issues': prefetchSiteHealth,
  '/demand': (client, projectId) => {
    warm(client, {
      queryKey: queryKeys.demand.latest(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) => demandApi.getLatest(projectId, { signal }),
    });
  },
  '/performance': (client, projectId) => {
    // Warm the landing view: the latest persisted snapshot, no comparison.
    // The screen's own default selection sends exactly these params.
    const params = { range: 'custom' as const, compare: 'none' as const };
    warm(client, {
      queryKey: queryKeys.performance.dashboard(projectId, params),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        performanceApi.getDashboard(projectId, params, { signal }),
    });
  },
  '/products': (client, projectId) => {
    warm(client, {
      queryKey: queryKeys.commerce.catalog(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) => commerceApi.catalog(projectId, { signal }),
    });
  },
  '/opportunities': (client, projectId) => {
    warm(client, opportunitiesQueries.summary(projectId));
  },
  '/prompts': (client, projectId) => {
    warm(client, {
      queryKey: queryKeys.prompts.sets(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        promptsApi.listPromptSets(projectId, { signal }),
    });
  },
  '/visibility': (client, projectId) => {
    warm(client, runsQueries.list(projectId));
    warm(client, {
      queryKey: [...queryKeys.visibility.project(projectId), 'core'],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        visibilityApi.getProjectVisibility(projectId, { cohort: 'core' }, { signal }),
    });
  },
  '/runs': (client, projectId) => {
    warm(client, runsQueries.list(projectId));
  },
  '/ai-referrals': (client, projectId) => {
    const params = { granularity: 'week' as const };
    warm(client, {
      queryKey: queryKeys.aiReferrals.dashboard(projectId, params),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        aiReferralsApi.getDashboard(projectId, params, { signal }),
    });
  },
};

function prefetchSiteHealth(client: QueryClient, projectId: string) {
  warm(client, siteHealthQueries.dashboard(projectId));
}

/**
 * Pointer intent must never disturb what the CURRENT screen is rendering.
 *
 * An errored query is permanently stale, so `prefetchQuery` always refetches
 * it, and TanStack resets `error` back to `pending` while that refetch is in
 * flight. On a screen already showing the failure (Search Demand's "no
 * snapshot exists yet" 404 alert), that flips `isLoading` true and swaps the
 * settled alert for a full-page skeleton until the identical 404 returns —
 * a hover on an unrelated sidebar link visibly flickering the page.
 *
 * Warming a cache is strictly an optimisation, so a key that has already
 * failed is left exactly as it is: the destination screen mounts and retries
 * on its own terms.
 */
function warm<T>(client: QueryClient, options: { queryKey: readonly unknown[] } & T): void {
  if (client.getQueryCache().find({ queryKey: options.queryKey })?.state.status === 'error') {
    return;
  }
  void client.prefetchQuery(options as never);
}

export function prefetchRoute(client: QueryClient, href: string, projectId: string | null) {
  if (!projectId) return;
  const pathname = new URL(href, 'https://citeladder.local').pathname;
  ROUTE_PREFETCHERS[pathname]?.(client, projectId);
}
