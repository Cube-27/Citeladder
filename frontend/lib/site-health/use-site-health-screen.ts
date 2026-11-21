import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { billingQueries } from '@/lib/api/billing';
import { TABLE_DEFAULT_PAGE_SIZE } from '@/lib/config/tables';
import { type StartCrawlInput } from '@/lib/api/site-health';
import { siteHealthMutations, siteHealthQueries } from '@/lib/api/site-health-queries';
import type { SiteCrawl, SiteHealthDashboard } from '@citeladder/contracts';
import {
  downloadCrawlExport,
  type ExportFormat,
  type ExportView,
} from '@/lib/site-health/download';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { optionalStringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useLiveCrawlDashboard } from '@/lib/site-health/use-live-crawl-dashboard';
import {
  DEFAULT_PAGES_SORT,
  inventoryModeForPhase,
  isCrawlStalled,
  CRAWL_STATES,
  type InventoryMode,
  type SiteHealthPhase,
} from '@/lib/site-health/status';

export function monitoredPagePreviewParams(active: boolean) {
  return {
    limit: TABLE_DEFAULT_PAGE_SIZE,
    monitored: true,
    status: active ? 'completed' : undefined,
    sort: DEFAULT_PAGES_SORT,
  };
}

function canLoadPagePreview(crawlId: string | undefined, phase: SiteHealthPhase): boolean {
  return Boolean(crawlId) && (phase === 'analyzing' || phase === 'dashboard');
}

export function pagePreviewQuery(workspaceId: string, dashboard: SiteHealthDashboard | null) {
  const crawl = dashboard?.crawl ?? null;
  const phase: SiteHealthPhase = dashboard?.phase ?? 'resolving';
  if (!crawl || !canLoadPagePreview(crawl.id, phase)) return null;
  return siteHealthQueries.pages(
    workspaceId,
    crawl.id,
    monitoredPagePreviewParams(CRAWL_STATES[crawl.status].active),
  );
}

export function useSiteHealthScreen() {
  const { workspaceId, projectId } = useProjectScope();
  const requestScope = { workspaceId, projectId };
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const entitlementQuery = useQuery(billingQueries.workspaceEntitlement(workspaceId));

  const [pinnedCrawlId, setPinnedCrawlId] = useUrlState('crawl_id', optionalStringUrlCodec);
  const dashboardQuery = useLiveCrawlDashboard(requestScope, pinnedCrawlId ?? undefined);

  const crawl: SiteCrawl | null = dashboardQuery.data?.crawl ?? null;
  const active = crawl ? CRAWL_STATES[crawl.status].active : false;
  const stalled = isCrawlStalled(crawl);
  const phase: SiteHealthPhase = dashboardQuery.data?.phase ?? 'resolving';

  const pagesQuery = useQuery({
    ...siteHealthQueries.pages(workspaceId, crawl?.id ?? '', monitoredPagePreviewParams(active)),
    enabled: canLoadPagePreview(crawl?.id, phase),
  });

  const inventoryMode: InventoryMode = inventoryModeForPhase(phase, crawl);

  const [starting, setStarting] = useState<{
    projectId: string;
    crawlId: string | null;
    token: number;
  } | null>(null);
  const createAttemptRef = useRef(0);

  const createMutation = useMutation(siteHealthMutations.createCrawl(workspaceId));
  const cancelMutation = useMutation(siteHealthMutations.cancelCrawl(requestScope));
  const startCrawl = (input?: StartCrawlInput) => {
    const variables = input ?? { project_id: projectId };
    setPinnedCrawlId(null, 'replace');
    createAttemptRef.current += 1;
    const token = createAttemptRef.current;
    setStarting({ projectId: variables.project_id, crawlId: null, token });
    createMutation.mutate(variables, {
      onSuccess: (created, _variables, start) => {
        if (token === createAttemptRef.current)
          setStarting({ projectId: variables.project_id, crawlId: created.id, token });
        void Promise.resolve(start?.refreshed).finally(() =>
          setStarting((current) => (current?.token === token ? null : current)),
        );
      },
      onError: () => {
        if (token === createAttemptRef.current) setStarting(null);
      },
    });
  };
  const retryStart = () => startCrawl(createMutation.variables);
  const cancelCrawl = () => crawl && cancelMutation.mutate(crawl.id);

  const startPending = starting?.projectId === projectId;

  const runExport = async (format: ExportFormat, view: ExportView) => {
    if (!crawl) return;
    setExportError(null);
    setExporting(true);
    try {
      await downloadCrawlExport(crawl.id, format, view, { workspaceId });
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return {
    entitlementQuery,
    dashboardQuery,
    pagesQuery,
    crawl,
    active,
    stalled,
    phase,
    inventoryMode,
    startPending,
    createMutation,
    cancelMutation,
    startCrawl,
    retryStart,
    cancelCrawl,
    runExport,
    exporting,
    exportError,
  };
}
