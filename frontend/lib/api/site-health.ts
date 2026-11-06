/**
 * Site Health domain endpoints + query/mutation options (F2).
 *
 * Owns transport for the Site Health slice: crawl create/list/
 * get/cancel, progressive keyset inventory, the persistent monitored set,
 * analyzed pages, issues, events, per-URL rerun, and same-origin export/stream
 * URLs. Every JSON response passes through `strictValidate` (fail loud on any
 * drift). All paths are relative `/api/v1` (same-origin proxy, invariant 12)
 * and every read accepts an `AbortSignal` via `ApiRequestOptions`.
 *
 * The frontend never invents a discovered total: count-bearing fields the
 * backend redacts for Free arrive `null`/absent and are validated as such.
 */
import { mutationOptions, queryOptions, type QueryClient } from '@tanstack/react-query';
import { API_BASE_URL, SITE_HEALTH_EXECUTION_REQUEST_TIMEOUT_MS } from '@/lib/config/operational';
import { startInteractiveWork } from './interactive-work';
import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import type { ProjectScope } from './query-keys/scope';
import { retainPreviousDataForScope } from './query-client';
import {
  aeoReadinessSchema,
  architectureSchema,
  changeSummarySchema,
  changesPageSchema,
  inventoryPageSchema,
  issueHistoryPageSchema,
  monitoredUrlsResponseSchema,
  pageDetailSchema,
  pagesPageSchema,
  rerunPageResponseSchema,
  siteCrawlListPageSchema,
  siteCrawlSchema,
  siteHealthDashboardSchema,
  siteHealthOverviewSchema,
  siteIssueDetailSchema,
  siteIssuesPageSchema,
  urlPreviewResponseSchema,
  robotsHistoryPageSchema,
} from '@citeladder/contracts/site-health';
import type {
  SiteCrawlCreateRequest,
  UrlPreviewRequest,
} from '@citeladder/contracts/site-health-requests';
import { strictValidate } from '@citeladder/contracts/validation';
import { definedQuery, withQuery } from './shared';
import type {
  AeoReadiness,
  ChangeSummary,
  ChangesPage,
  InventoryPage,
  IssueHistoryPage,
  MonitoredUrlsResponse,
  PageDetail,
  PagesPage,
  RerunPageResponse,
  SiteCrawl,
  SiteArchitecture,
  SiteCrawlListPage,
  SiteHealthDashboard,
  SiteHealthOverview,
  SiteIssueDetail,
  SiteIssuesPage,
  UrlPreviewResponse,
} from '@citeladder/contracts';

/**
 * A new crawl, or with `recrawl_of` a rerun of that crawl's frozen scope and
 * settings. `recrawl_of` picks the route; it is never part of the body.
 */
export type StartCrawlInput = SiteCrawlCreateRequest & { recrawl_of?: string };

/** Keyset inventory query params. `limit<=200`, ordering is URL-only. */
export type InventoryParams = {
  cursor?: string;
  limit?: number;
  query?: string;
  status?: string;
  monitored?: boolean;
  /** v2 P1: filter to one classified page type (omitted = all types). */
  page_kind?: string;
};

type CrawlListParams = { project_id: string; limit?: number; cursor?: string };
/** Server-backed orderings of the pages list (keyset, never a client sort). */
export type PagesSort = 'status' | 'url' | 'inbound' | 'main_content_inbound' | 'depth';
export type PagesParams = {
  cursor?: string;
  limit?: number;
  status?: string;
  monitored?: boolean;
  /** v2 P1: filter to one classified page type (omitted = all types). */
  page_kind?: string;
  /** Ordering. Part of the cursor fingerprint, so changing it resets paging. */
  sort?: PagesSort;
};
type ChangesPageRequest = Parameters<typeof queryKeys.siteHealth.changes>[1];
export type IssuesParams = {
  cursor?: string;
  limit?: number;
  query?: string;
  severity?: string;
  category?: string;
  dimension?: string;
  rule?: string;
  site_url_id?: string;
  finding_class?: 'defect' | 'advisory';
  page_kind?: string; // v2 P1: issues affecting one classified page type
  detail_limit?: number; // embeds the first row's detail as `first_issue`
};

/** Keyset params for a grouped issue's affected-URL page and a URL's issue history. */
type IssueDetailParams = Pick<IssuesParams, 'cursor' | 'limit' | 'page_kind'>;
type IssueHistoryParams = Pick<IssuesParams, 'cursor' | 'limit'>;
type RobotsPage = Pick<IssuesParams, 'cursor' | 'limit'>;

export const siteHealthApi = {
  getRobotsHistory: async (projectId: string, page: RobotsPage, options?: ApiRequestOptions) => {
    const res = await apiClient.get(
      withQuery(`/projects/${projectId}/site-health/robots-history`, definedQuery(page)),
      options,
    );
    return strictValidate(robotsHistoryPageSchema, res, 'siteHealth.getRobotsHistory');
  },
  createCrawl: async ({ recrawl_of, ...input }: StartCrawlInput, options?: ApiRequestOptions) => {
    const path = recrawl_of ? `/site-crawls/${recrawl_of}/recrawl` : '/site-crawls';
    const res = await apiClient.post<SiteCrawl>(path, recrawl_of ? undefined : input, options);
    const crawl = strictValidate(siteCrawlSchema, res, 'siteHealth.createCrawl');
    startInteractiveWork(`/site-crawls/${crawl.id}/run`, {
      ...options,
      timeoutMs: SITE_HEALTH_EXECUTION_REQUEST_TIMEOUT_MS,
    });
    return crawl;
  },
  previewUrls: async (input: UrlPreviewRequest, options?: ApiRequestOptions) => {
    const res = await apiClient.post<UrlPreviewResponse>(
      '/site-crawls/url-preview',
      input,
      options,
    );
    return strictValidate(urlPreviewResponseSchema, res, 'siteHealth.previewUrls');
  },
  listCrawls: async (params: CrawlListParams, options?: ApiRequestOptions) => {
    const path = withQuery('/site-crawls', definedQuery(params));
    const res = await apiClient.get<SiteCrawlListPage>(path, options);
    return strictValidate(siteCrawlListPageSchema, res, 'siteHealth.listCrawls');
  },
  getCrawl: async (crawlId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<SiteCrawl>(`/site-crawls/${crawlId}`, options);
    return strictValidate(siteCrawlSchema, res, 'siteHealth.getCrawl');
  },
  cancelCrawl: async (crawlId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<SiteCrawl>(
      `/site-crawls/${crawlId}/cancel`,
      undefined,
      options,
    );
    return strictValidate(siteCrawlSchema, res, 'siteHealth.cancelCrawl');
  },
  getInventory: async (crawlId: string, params?: InventoryParams, options?: ApiRequestOptions) => {
    const path = withQuery(`/site-crawls/${crawlId}/inventory`, definedQuery(params));
    const res = await apiClient.get<InventoryPage>(path, options);
    return strictValidate(inventoryPageSchema, res, 'siteHealth.getInventory');
  },
  getMonitoredUrls: async (projectId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<MonitoredUrlsResponse>(
      `/projects/${projectId}/monitored-urls`,
      options,
    );
    return strictValidate(monitoredUrlsResponseSchema, res, 'siteHealth.getMonitoredUrls');
  },
  getPages: async (crawlId: string, params?: PagesParams, options?: ApiRequestOptions) => {
    const path = withQuery(`/site-crawls/${crawlId}/pages`, definedQuery(params));
    const res = await apiClient.get<PagesPage>(path, options);
    return strictValidate(pagesPageSchema, res, 'siteHealth.getPages');
  },
  getPage: async (crawlId: string, siteUrlId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<PageDetail>(
      `/site-crawls/${crawlId}/pages/${siteUrlId}`,
      options,
    );
    return strictValidate(pageDetailSchema, res, 'siteHealth.getPage');
  },
  rerunPage: async (crawlId: string, siteUrlId: string, options?: ApiRequestOptions) => {
    // 202 Accepted carrying the (possibly fresh) rerun identity + status so
    // the client polls the new run — not the terminal source crawl.
    const res = await apiClient.post<RerunPageResponse>(
      `/site-crawls/${crawlId}/pages/${siteUrlId}/rerun`,
      undefined,
      options,
    );
    return strictValidate(rerunPageResponseSchema, res, 'siteHealth.rerunPage');
  },
  getIssues: async (crawlId: string, params?: IssuesParams, options?: ApiRequestOptions) => {
    const path = withQuery(`/site-crawls/${crawlId}/issues`, definedQuery(params));
    const res = await apiClient.get<SiteIssuesPage>(path, options);
    return strictValidate(siteIssuesPageSchema, res, 'siteHealth.getIssues');
  },
  getIssue: async (
    crawlId: string,
    groupId: string,
    params?: IssueDetailParams,
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(`/site-crawls/${crawlId}/issues/${groupId}`, definedQuery(params));
    const res = await apiClient.get<SiteIssueDetail>(path, options);
    return strictValidate(siteIssueDetailSchema, res, 'siteHealth.getIssue');
  },
  getIssueHistory: async (
    crawlId: string,
    siteUrlId: string,
    params?: IssueHistoryParams,
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(
      `/site-crawls/${crawlId}/pages/${siteUrlId}/issue-history`,
      definedQuery(params),
    );
    const res = await apiClient.get<IssueHistoryPage>(path, options);
    return strictValidate(issueHistoryPageSchema, res, 'siteHealth.getIssueHistory');
  },
  getDashboard: async (projectId: string, crawlId?: string, options?: ApiRequestOptions) => {
    const path = withQuery(
      `/projects/${projectId}/site-health`,
      definedQuery({ crawl_id: crawlId }),
    );
    const res = await apiClient.get<SiteHealthDashboard>(path, options);
    return strictValidate(siteHealthDashboardSchema, res, 'siteHealth.getDashboard');
  },
  getAeoReadiness: async (projectId: string, crawlId?: string, options?: ApiRequestOptions) => {
    const path = withQuery(
      `/projects/${projectId}/site-health/aeo-readiness`,
      definedQuery({ crawl_id: crawlId }),
    );
    const res = await apiClient.get<AeoReadiness>(path, options);
    return strictValidate(aeoReadinessSchema, res, 'siteHealth.getAeoReadiness');
  },
  getOverview: async (projectId: string, crawlId?: string, options?: ApiRequestOptions) => {
    const path = withQuery(
      `/projects/${projectId}/site-health/overview`,
      definedQuery({ crawl_id: crawlId }),
    );
    const res = await apiClient.get<SiteHealthOverview>(path, options);
    return strictValidate(siteHealthOverviewSchema, res, 'siteHealth.getOverview');
  },
  getArchitecture: async (projectId: string, crawlId?: string, options?: ApiRequestOptions) => {
    const path = withQuery(
      `/projects/${projectId}/site-health/architecture`,
      definedQuery({ crawl_id: crawlId }),
    );
    const res = await apiClient.get<SiteArchitecture>(path, options);
    return strictValidate(architectureSchema, res, 'siteHealth.getArchitecture');
  },
  getChangesSummary: async (projectId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<ChangeSummary>(
      `/projects/${projectId}/site-health/changes/summary`,
      options,
    );
    return strictValidate(changeSummarySchema, res, 'siteHealth.getChangesSummary');
  },
  getChanges: async (
    projectId: string,
    crawlAId: string,
    crawlBId: string,
    cursor?: string,
    limit?: number,
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(
      `/projects/${projectId}/site-health/changes`,
      definedQuery({ crawl_a_id: crawlAId, crawl_b_id: crawlBId, limit, cursor }),
    );
    const res = await apiClient.get<ChangesPage>(path, options);
    return strictValidate(changesPageSchema, res, 'siteHealth.getChanges');
  },
  /** Same-origin SSE endpoint (polling is the baseline; `?stream=true`). */
  eventsUrl: (crawlId: string) => `${API_BASE_URL}/site-crawls/${crawlId}/events?stream=true`,
  /** Same-origin export URLs (browser navigation / download links). */
  exportUrl: (
    crawlId: string,
    format: 'csv' | 'md',
    // `architecture` is a tree, so it renders as Markdown only; CSV rejects it.
    view?: 'inventory' | 'pages' | 'issues' | 'architecture',
  ) => {
    const base = `${API_BASE_URL}/site-crawls/${crawlId}/export.${format}`;
    return view ? `${base}?view=${view}` : base;
  },
};

const scoped = (scope: ProjectScope, signal?: AbortSignal) => ({
  signal,
  workspaceId: scope.workspaceId,
});

/**
 * React Query option factories. Screens, the route prefetchers and cursor
 * tables pass these straight to `useQuery`, so the query key ↔ endpoint
 * pairing lives in one place. Project reads take the project scope; a
 * crawl's reads take the workspace and the crawl. Every `queryFn` forwards
 * the abort signal.
 */
export const siteHealthQueries = {
  robotsHistory: (scope: ProjectScope, page: RobotsPage) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.robotsHistory(scope, page),
      // Opening history refreshes the project's observation sequence, irrespective of selected crawl.
      refetchOnMount: 'always',
      queryFn: ({ signal }) =>
        siteHealthApi.getRobotsHistory(scope.projectId, page, scoped(scope, signal)),
    }),
  dashboard: (scope: ProjectScope, crawlId?: string) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.dashboard(scope, crawlId),
      queryFn: ({ signal }) =>
        siteHealthApi.getDashboard(scope.projectId, crawlId, scoped(scope, signal)),
    }),
  aeoReadiness: (scope: ProjectScope, crawlId?: string) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.aeoReadiness(scope, crawlId),
      queryFn: ({ signal }) =>
        siteHealthApi.getAeoReadiness(scope.projectId, crawlId, scoped(scope, signal)),
    }),
  overview: (scope: ProjectScope, crawlId?: string) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.overview(scope, crawlId),
      queryFn: ({ signal }) =>
        siteHealthApi.getOverview(scope.projectId, crawlId, scoped(scope, signal)),
    }),
  architecture: (scope: ProjectScope, crawlId?: string) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.architecture(scope, crawlId),
      queryFn: ({ signal }) =>
        siteHealthApi.getArchitecture(scope.projectId, crawlId, scoped(scope, signal)),
    }),
  changesSummary: (scope: ProjectScope) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.changesSummary(scope),
      queryFn: ({ signal }) =>
        siteHealthApi.getChangesSummary(scope.projectId, scoped(scope, signal)),
    }),
  /** One page of a compared pair's changes; the summary names the pair. */
  changes: (scope: ProjectScope, page: ChangesPageRequest) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.changes(scope, page),
      queryFn: ({ signal }) => {
        const { crawlAId, crawlBId, cursor, limit } = page;
        if (!crawlAId || !crawlBId) throw new Error('A persisted crawl pair is required');
        return siteHealthApi.getChanges(
          scope.projectId,
          crawlAId,
          crawlBId,
          cursor,
          limit,
          scoped(scope, signal),
        );
      },
    }),
  crawls: (scope: ProjectScope, page: Omit<CrawlListParams, 'project_id'> = {}) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.crawls(scope, {
        limit: page.limit ?? null,
        cursor: page.cursor ?? null,
      }),
      queryFn: ({ signal }) =>
        siteHealthApi.listCrawls({ project_id: scope.projectId, ...page }, scoped(scope, signal)),
      placeholderData: (previousData, previousQuery) =>
        retainPreviousDataForScope(scope.projectId, previousData, previousQuery),
    }),
  monitored: (scope: ProjectScope) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.monitored(scope),
      queryFn: ({ signal }) =>
        siteHealthApi.getMonitoredUrls(scope.projectId, scoped(scope, signal)),
    }),
  crawl: (workspaceId: string | null, crawlId: string) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.crawl(workspaceId, crawlId),
      queryFn: ({ signal }) => siteHealthApi.getCrawl(crawlId, { signal, workspaceId }),
    }),
  inventory: (workspaceId: string | null, crawlId: string, params?: InventoryParams) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.inventory(workspaceId, crawlId, {
        cursor: params?.cursor ?? null,
        limit: params?.limit ?? null,
        query: params?.query ?? null,
        status: params?.status ?? null,
        monitored: params?.monitored ?? null,
        page_kind: params?.page_kind ?? null,
      }),
      queryFn: ({ signal }) => siteHealthApi.getInventory(crawlId, params, { signal, workspaceId }),
      placeholderData: (previousData, previousQuery) =>
        retainPreviousDataForScope(crawlId, previousData, previousQuery),
    }),
  pages: (workspaceId: string | null, crawlId: string, params?: PagesParams) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.pages(workspaceId, crawlId, {
        cursor: params?.cursor ?? null,
        limit: params?.limit ?? null,
        status: params?.status ?? null,
        monitored: params?.monitored ?? null,
        page_kind: params?.page_kind ?? null,
        // The sort changes the server's ordering, so it must be part of the
        // cache identity — otherwise two sorts share one entry and the table
        // renders the previous ordering's rows.
        sort: params?.sort ?? null,
      }),
      queryFn: ({ signal }) => siteHealthApi.getPages(crawlId, params, { signal, workspaceId }),
      placeholderData: (previousData, previousQuery) =>
        retainPreviousDataForScope(crawlId, previousData, previousQuery),
    }),
  page: (workspaceId: string | null, crawlId: string, siteUrlId: string) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.page(workspaceId, crawlId, siteUrlId),
      queryFn: ({ signal }) => siteHealthApi.getPage(crawlId, siteUrlId, { signal, workspaceId }),
    }),
  issues: (workspaceId: string | null, crawlId: string, params?: IssuesParams) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.issues(workspaceId, crawlId, {
        cursor: params?.cursor ?? null,
        limit: params?.limit ?? null,
        query: params?.query ?? null,
        severity: params?.severity ?? null,
        category: params?.category ?? null,
        dimension: params?.dimension ?? null,
        rule: params?.rule ?? null,
        site_url_id: params?.site_url_id ?? null,
        finding_class: params?.finding_class ?? 'defect',
        page_kind: params?.page_kind ?? null,
        detail_limit: params?.detail_limit ?? null,
      }),
      queryFn: ({ signal }) => siteHealthApi.getIssues(crawlId, params, { signal, workspaceId }),
      placeholderData: (previousData, previousQuery) =>
        retainPreviousDataForScope(crawlId, previousData, previousQuery),
    }),
  issue: (
    workspaceId: string | null,
    crawlId: string,
    groupId: string,
    params?: IssueDetailParams,
  ) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.issue(workspaceId, crawlId, groupId, {
        cursor: params?.cursor ?? null,
        limit: params?.limit ?? null,
        page_kind: params?.page_kind ?? null,
      }),
      queryFn: ({ signal }) =>
        siteHealthApi.getIssue(crawlId, groupId, params, { signal, workspaceId }),
      placeholderData: (previousData, previousQuery) =>
        retainPreviousDataForScope(crawlId, previousData, previousQuery),
    }),
  issueHistory: (
    workspaceId: string | null,
    crawlId: string,
    siteUrlId: string,
    params?: IssueHistoryParams,
  ) =>
    queryOptions({
      queryKey: queryKeys.siteHealth.issueHistory(workspaceId, crawlId, siteUrlId, {
        cursor: params?.cursor ?? null,
        limit: params?.limit ?? null,
      }),
      queryFn: ({ signal }) =>
        siteHealthApi.getIssueHistory(crawlId, siteUrlId, params, { signal, workspaceId }),
      placeholderData: (previousData, previousQuery) =>
        retainPreviousDataForScope(crawlId, previousData, previousQuery),
    }),
};

/*
 * ONE definition of "what a crawl change refreshes".
 *
 * The Site Health screen used to run five independent 4s polls over the same
 * crawl (dashboard, pages, and three list views), each owning its own timer,
 * while the SSE hook invalidated a hand-listed set of keys on every frame.
 * Overlapping refetches then resolved out of order and panels rendered state
 * from different moments — counts ticking backwards, a score appearing then
 * vanishing. Now there is a single subscription (the dashboard query's timer)
 * plus the stream, and BOTH refresh the derived views through these helpers,
 * so the two paths can never drift apart.
 */

/**
 * Refresh every list view derived from a crawl: the crawl row and the first
 * page of the pages / inventory / issues lists, across all filter
 * combinations. Deeper cursor pages are deliberately left alone: the reader is
 * looking at a fixed window of rows, and refetching it as new URLs stream in
 * shifts the rows under their cursor.
 */
export function refreshCrawlViews(client: QueryClient, crawlId: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.siteHealth.crawlRow(crawlId) }),
    ...[
      queryKeys.siteHealth.crawlPages(crawlId),
      queryKeys.siteHealth.crawlInventory(crawlId),
      queryKeys.siteHealth.crawlIssues(crawlId),
    ].map((queryKey) =>
      client.invalidateQueries({
        queryKey,
        predicate: (query) => queryKeys.siteHealth.isFirstPage(query.queryKey),
      }),
    ),
  ]);
}

/**
 * The project's crawl + phase projection, in every workspace and for every
 * selected crawl. The dashboard's own poll must not call this: it is the
 * trigger.
 */
export const refreshSiteHealthDashboard = (client: QueryClient, projectId: string) =>
  client.invalidateQueries({ queryKey: queryKeys.siteHealth.resource(projectId, 'dashboard') });

/**
 * The project-level monitored projection, while automatic admission is still
 * growing it. It is not crawl-owned data, so it stays out of
 * `refreshCrawlViews`: callers decide when a crawl progress change can also
 * have changed the persistent monitored set.
 */
export const refreshMonitoredUrls = (client: QueryClient, projectId: string) =>
  client.invalidateQueries({ queryKey: queryKeys.siteHealth.resource(projectId, 'monitored') });

/**
 * What a created crawl changes: the project's projection, and the monitored
 * set automatic admission adds the root to. Any in-flight dashboard read stops
 * first, so a pre-create answer cannot commit after creation and read as the
 * acknowledgement.
 */
async function refreshCrawlStart(client: QueryClient, projectId: string) {
  await client.cancelQueries({ queryKey: queryKeys.siteHealth.resource(projectId, 'dashboard') });
  await Promise.all([
    refreshSiteHealthDashboard(client, projectId),
    refreshMonitoredUrls(client, projectId),
  ]);
}

/**
 * A crawl start's projection refresh. The mutation settles at the POST, so a
 * slow projection read can neither hold the control pending nor report a
 * failure for a crawl that already exists; a caller that waits for the
 * refreshed projection awaits `refreshed` from its own `onSuccess`.
 */
export type CrawlStart = { refreshed: Promise<void> | null };

/** Site Health writes; each success refreshes every read it changes. */
export const siteHealthMutations = {
  createCrawl: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: (input: StartCrawlInput) => siteHealthApi.createCrawl(input, { workspaceId }),
      onMutate: (): CrawlStart => ({ refreshed: null }),
      onSuccess: (_crawl, input, start, { client }) => {
        start.refreshed = refreshCrawlStart(client, input.project_id);
      },
    }),
  /**
   * Cancellation also changes the server-owned phase, so the whole projection
   * refreshes at once instead of pairing the terminal crawl row with an
   * active phase in the cache.
   */
  cancelCrawl: (scope: ProjectScope) =>
    mutationOptions({
      mutationFn: (crawlId: string) => siteHealthApi.cancelCrawl(crawlId, scoped(scope)),
      onSuccess: (_crawl, _crawlId, _result, { client }) =>
        refreshSiteHealthDashboard(client, scope.projectId),
    }),
  /**
   * A per-URL rerun. Rerun inside the same crawl refreshes the URL's detail
   * before the caller starts polling it: polling first can observe the stale
   * terminal entry and stop before the fresh pending snapshot lands. A rerun
   * that minted a new crawl seeds that crawl's entry with the new identity.
   */
  rerunPage: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: (vars: { crawlId: string; siteUrlId: string }) =>
        siteHealthApi.rerunPage(vars.crawlId, vars.siteUrlId, { workspaceId }),
      onSuccess: async (result, vars, _result, { client }) => {
        if (result.crawl_id === vars.crawlId && result.site_url_id === vars.siteUrlId) {
          await client.invalidateQueries({
            queryKey: queryKeys.siteHealth.crawlPage(vars.crawlId, vars.siteUrlId),
          });
          return;
        }
        client.setQueryData<PageDetail>(
          queryKeys.siteHealth.page(workspaceId, result.crawl_id, result.site_url_id),
          (previous) =>
            previous
              ? { ...previous, crawl_id: result.crawl_id, analysis_status: result.analysis_status }
              : previous,
        );
      },
    }),
};
