import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { CRAWL_VIEW_REFRESH_MS } from '@/lib/config/operational';
import {
  refreshCrawlViews,
  refreshMonitoredUrls,
  siteHealthQueries,
} from '@/lib/api/site-health-queries';
import { useCrawlEvents } from '@/lib/site-health/use-crawl-events';
import {
  crawlPollInterval,
  crawlProgressVersion,
  crawlViewsDue,
  CRAWL_STATES,
  type SeenProgress,
} from '@/lib/site-health/status';

/**
 * The project's crawl dashboard, kept live while its crawl runs. Polling is
 * ONE subscription: the dashboard query owns the only timer, the SSE stream
 * only accelerates it, and every other crawl-derived view (pages, inventory,
 * issues) refreshes when the crawl's progress fingerprint changes. Five
 * components each running their own 4s timer over the same crawl produced
 * overlapping refetches that resolved out of order, so panels rendered state
 * from different moments.
 */
export function useLiveCrawlDashboard(
  scope: Parameters<typeof siteHealthQueries.dashboard>[0],
  pinnedCrawlId?: string,
) {
  const queryClient = useQueryClient();
  const { projectId } = scope;
  const dashboardQuery = useQuery({
    ...siteHealthQueries.dashboard(scope, pinnedCrawlId),
    // Backed off by crawl age, and stops entirely on a crawl that has gone
    // silent — an active-forever crawl must not pin the tab to a 4s poll of
    // five queries indefinitely.
    refetchInterval: (query) => {
      const polled = query.state.data?.crawl;
      return polled ? crawlPollInterval(polled) : false;
    },
  });

  const crawl = dashboardQuery.data?.crawl ?? null;
  const active = crawl ? CRAWL_STATES[crawl.status].active : false;

  // SSE invalidation accelerator (polling stays the baseline). Keep it active
  // through an expired-lease report so the sweeper's recovery is observed.
  useCrawlEvents(crawl?.id, projectId, active);

  // Refresh crawl-derived lists only when persisted progress changes, and at
  // most every CRAWL_VIEW_REFRESH_MS while the crawl runs (a throttled change
  // still lands when its interval ends). The first sighting
  // mounts its own queries, and unchanged dashboard polls do no downstream work.
  const crawlId = crawl?.id ?? null;
  const crawlStatus = crawl?.status ?? null;
  const crawlVersion = crawl ? crawlProgressVersion(crawl) : null;
  const lastSeenRef = useRef<(SeenProgress & { crawlId: string }) | null>(null);
  useEffect(() => {
    if (!crawlId || !crawlStatus || crawlVersion === null) return;
    const previous = lastSeenRef.current;
    const next = { version: crawlVersion, status: crawlStatus };
    const now = Date.now();
    if (previous?.crawlId !== crawlId) {
      lastSeenRef.current = { crawlId, ...next, refreshedAt: now };
      return;
    }
    if (previous.version === crawlVersion) return;
    const refresh = () => {
      lastSeenRef.current = { crawlId, ...next, refreshedAt: Date.now() };
      void refreshCrawlViews(queryClient, crawlId);
      void refreshMonitoredUrls(queryClient, projectId);
    };
    if (crawlViewsDue(previous, next, now)) {
      refresh();
      return;
    }
    // A throttled change refreshes once its interval ends, unless newer progress or unmount comes first.
    const trailing = setTimeout(refresh, previous.refreshedAt + CRAWL_VIEW_REFRESH_MS - now);
    return () => clearTimeout(trailing);
  }, [crawlId, crawlStatus, crawlVersion, projectId, queryClient]);

  return dashboardQuery;
}
