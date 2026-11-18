import type { QueryClient } from '@tanstack/react-query';

import { readFromIntent, warmQuery } from '@/lib/api/query-client';
import { findAppRoute, type AppRoutePath } from '@/lib/navigation/app-routes';
import { preloadRouteChunk } from '@/lib/navigation/route-chunks';

export type ProjectScope = { projectId: string; workspaceId: string };

type Warm<M> = (
  modules: M,
  client: QueryClient,
  scope: ProjectScope,
  search: URLSearchParams,
) => void | Promise<void>;

type RouteReads = Readonly<{
  /** Start loading the modules the reads need; safe to call before any scope is known. */
  load: () => Promise<unknown>;
  prefetch: (client: QueryClient, scope: ProjectScope, search: URLSearchParams) => Promise<void>;
}>;

/**
 * A destination's reads: the modules they need, loaded dynamically, and the
 * warm that issues them once they are here.
 *
 * **The imports stay dynamic, and that is load-bearing.** This map reaches a
 * dozen domains. `sidebar-nav` imports it, `app-shell` imports that, and the
 * router imports the shell — so a static import here placed every domain's
 * client, and the Zod schema module behind each one, in the chunk the browser
 * must download before it can render anything at all.
 *
 * The cost is that a read cannot start before its module has loaded. On a
 * cold load that is a whole round trip, so the bootstrap loader calls
 * `preloadRouteReads` first, before the session and gate reads it waits on:
 * the module downloads beside them and the warm finds it already here.
 */
function routeReads<M>(load: () => Promise<M>, warm: Warm<M>): RouteReads {
  return {
    load,
    prefetch: async (client, scope, search) => warm(await load(), client, scope, search),
  };
}

const visibilitySelection = () =>
  Promise.all([
    import('@/lib/api/runs'),
    import('@/lib/api/visibility'),
    import('@/lib/api/visibility-queries'),
    import('@/lib/api/projects'),
  ]);

/** Warm the reads every screen over the visibility selection opens on (Sources, Insights, Competitors). */
const warmVisibilitySelection: Warm<Awaited<ReturnType<typeof visibilitySelection>>> = (
  [{ runsQueries }, { INITIAL_VISIBILITY_PARAMS }, { visibilityQueries }, { projectQueries }],
  client,
  scope,
) => {
  warmQuery(client, runsQueries.list(scope));
  // The market picker's list, which the screen reads beside the runs.
  warmQuery(client, projectQueries.markets(scope));
  // The landing selection, built from the screen's own defaults. A key
  // spelled out here drifted from the one the screen reads and warmed an
  // entry nothing consumed.
  warmQuery(client, visibilityQueries.project(scope, INITIAL_VISIBILITY_PARAMS));
};

const ROUTE_READS: Readonly<Partial<Record<AppRoutePath, RouteReads>>> = {
  '/projects': routeReads(
    () => Promise.all([import('@/lib/api/projects'), import('@/lib/overview/widget-queries')]),
    warmOverview,
  ),
  '/site': routeReads(
    () =>
      Promise.all([
        import('@/lib/api/site-health-queries'),
        import('@/lib/api/site-health-latest-crawl'),
        import('@/lib/site-health/use-site-health-screen'),
        import('@/lib/site-health/status'),
      ]),
    warmSiteHealth,
  ),
  '/issues': routeReads(
    () =>
      Promise.all([
        import('@/lib/api/site-health-queries'),
        import('@/lib/api/site-health-latest-crawl'),
        import('@/lib/site-health/issue-filters'),
      ]),
    warmIssues,
  ),
  '/performance': routeReads(
    () => Promise.all([import('@/lib/api/performance'), import('@/lib/performance/performance')]),
    // The landing view, built from the screen's own defaults: the latest
    // persisted snapshot, daily buckets, no comparison.
    ([{ performanceQueries }, { INITIAL_DASHBOARD_PARAMS }], client, scope) =>
      warmQuery(client, performanceQueries.dashboard(scope, INITIAL_DASHBOARD_PARAMS)),
  ),
  // The page opens on Demand, which draws from the latest snapshot alone.
  '/search-intelligence': routeReads(
    () => import('@/lib/api/demand'),
    ({ demandQueries }, client, scope) => warmQuery(client, demandQueries.latest(scope)),
  ),
  '/products': routeReads(
    () => Promise.all([import('@/lib/api/commerce'), import('@/lib/products/product-filters')]),
    ([{ commerceQueries }, { DEFAULT_PRODUCT_FILTERS, productSearch }], client, scope) => {
      // The catalog (header and categories) and the landing page of the table.
      warmQuery(client, commerceQueries.catalog(scope));
      warmQuery(
        client,
        commerceQueries.products(scope, productSearch(DEFAULT_PRODUCT_FILTERS), null),
      );
    },
  ),
  '/products/overview': routeReads(
    () => Promise.all([import('@/lib/api/commerce'), import('@/lib/products/product-filters')]),
    ([{ commerceQueries }, { DEFAULT_OVERVIEW_FILTERS, overviewSearch }], client, scope) => {
      // The category filter's options and the landing window's overview.
      warmQuery(client, commerceQueries.catalog(scope));
      warmQuery(client, commerceQueries.overview(scope, overviewSearch(DEFAULT_OVERVIEW_FILTERS)));
    },
  ),
  // New chat: its recommended Actions are the screen's one project read.
  '/agent': routeReads(
    () => import('@/lib/api/actions'),
    ({ actionsQueries }, client, scope) => warmQuery(client, actionsQueries.list(scope)),
  ),
  // The Actions page's one read: the New tree, grouped by goal.
  '/actions': routeReads(
    () => import('@/lib/api/actions'),
    ({ actionsQueries, DEFAULT_ACTION_TREE }, client, scope) =>
      warmQuery(client, actionsQueries.tree(scope, DEFAULT_ACTION_TREE)),
  ),
  '/agent/skills': routeReads(
    () => import('@/lib/api/agent'),
    ({ agentQueries }, client, { workspaceId }) =>
      warmQuery(client, agentQueries.skills(workspaceId)),
  ),
  '/agent/context': routeReads(
    () => import('@/lib/api/projects'),
    // The profile fills the first tab; the brand-facts gate decides which tabs exist.
    ({ projectQueries }, client, scope) => {
      warmQuery(client, projectQueries.brandProfile(scope));
      warmQuery(client, projectQueries.brandFacts(scope));
    },
  ),
  '/prompts': routeReads(
    () =>
      Promise.all([
        import('@/lib/api/prompts'),
        import('@/lib/api/topics'),
        import('@/lib/api/visibility-queries'),
        import('@/lib/prompts/prompt-sets'),
      ]),
    warmPrompts,
  ),
  '/visibility': routeReads(visibilitySelection, warmVisibilitySelection),
  '/insights': routeReads(visibilitySelection, warmVisibilitySelection),
  '/competitors': routeReads(visibilitySelection, warmVisibilitySelection),
  // The same selection as Sources, and the pilot gate that adds Fact-checking.
  '/perception': routeReads(visibilitySelection, (modules, client, scope, search) => {
    warmQuery(client, modules[3].projectQueries.brandFacts(scope));
    return warmVisibilitySelection(modules, client, scope, search);
  }),
  '/runs': routeReads(
    () => import('@/lib/api/runs'),
    ({ runsQueries }, client, scope) => warmQuery(client, runsQueries.list(scope)),
  ),
  '/ai-traffic': routeReads(
    () => Promise.all([import('@/lib/api/ai-traffic'), import('@/lib/config/crawl-logs')]),
    // The landing view's three reads, side by side: the sources that choose
    // the default tab, and the Overview tab's summary and insights.
    ([{ aiTrafficQueries }, { TRAFFIC_RANGES }], client, scope) => {
      const range = TRAFFIC_RANGES[0].value;
      warmQuery(client, aiTrafficQueries.sources(scope));
      warmQuery(client, aiTrafficQueries.overview(scope, { range }));
      warmQuery(client, aiTrafficQueries.insights(scope, range));
    },
  ),
  '/settings': routeReads(
    () =>
      Promise.all([
        import('@/lib/api/auth'),
        import('@/lib/api/providers'),
        import('@/lib/api/integrations'),
        import('@/lib/api/mcp-connections'),
      ]),
    warmSettings,
  ),
};

/**
 * Settings mounts Account, Workspace and Providers whatever the tab, so their
 * reads always go; the tab in the address adds its own. Members and API keys
 * depend on a capability the warm cannot see, so they wait for the screen.
 */
function warmSettings(
  [{ authQueries }, { providerQueries }, { integrationsQueries }, { mcpConnectionQueries }]: [
    typeof import('@/lib/api/auth'),
    typeof import('@/lib/api/providers'),
    typeof import('@/lib/api/integrations'),
    typeof import('@/lib/api/mcp-connections'),
  ],
  client: QueryClient,
  { workspaceId }: ProjectScope,
  search: URLSearchParams,
) {
  warmQuery(client, authQueries.security());
  warmQuery(client, providerQueries.catalog());
  warmQuery(client, providerQueries.connections(workspaceId));
  warmQuery(client, providerQueries.states(workspaceId));
  const tab = search.get('tab');
  if (tab === 'integrations') warmQuery(client, integrationsQueries.connections(workspaceId));
  if (tab === 'connections') warmQuery(client, mcpConnectionQueries.list(workspaceId));
}

/**
 * The library's three independent reads: its sets, its topic filter, and what
 * the run that last measured each prompt found. Once the sets name the main
 * set, its suggestions waiting for review, which the library holds its first
 * paint for.
 */
async function warmPrompts(
  [{ promptsQueries }, { topicsQueries }, { visibilityQueries }, { mainPromptSet }]: [
    typeof import('@/lib/api/prompts'),
    typeof import('@/lib/api/topics'),
    typeof import('@/lib/api/visibility-queries'),
    typeof import('@/lib/prompts/prompt-sets'),
  ],
  client: QueryClient,
  scope: ProjectScope,
) {
  const sets = promptsQueries.sets(scope);
  warmQuery(client, sets);
  warmQuery(client, topicsQueries.list(scope));
  warmQuery(client, visibilityQueries.latestPerPrompt(scope));
  const main = mainPromptSet((await readFromIntent(client, sets))?.prompt_sets ?? []);
  if (main) warmQuery(client, promptsQueries.candidates(scope, main.id));
}

/**
 * Warm the Overview's two independent reads side by side — the command center
 * and the layout — and, once the layout names its widgets, the reads those
 * widgets make. The screen used to ask for each of these only after the one
 * before it had rendered: three or four round trips in a row.
 */
async function warmOverview(
  [{ projectQueries }, { warmOverviewWidgets }]: [
    typeof import('@/lib/api/projects'),
    typeof import('@/lib/overview/widget-queries'),
  ],
  client: QueryClient,
  scope: ProjectScope,
) {
  warmQuery(client, projectQueries.commandCenter(scope));
  const layoutQuery = projectQueries.overviewLayout(scope);
  warmQuery(client, layoutQuery);
  if (client.getQueryState(layoutQuery.queryKey)?.status === 'error') return;
  const layout = await client.ensureQueryData(layoutQuery).catch(() => null);
  if (layout)
    await warmOverviewWidgets(
      client,
      { id: scope.projectId, workspace_id: scope.workspaceId },
      layout.widgets,
    );
}

/**
 * Warm the Website screen's dashboard and, beside it, the page preview the
 * screen requests once the dashboard names its crawl.
 *
 * A cached dashboard already names the crawl, so the preview is warmed under
 * it directly. Otherwise the project-scoped read answers for the newest crawl
 * (the one the dashboard shows) and names it, and the answer is filed under
 * that crawl's key — the preview no longer waits a round trip for the
 * dashboard. Only a finished crawl's answer is filed: an active crawl's
 * preview shows completed rows only, which is a different key.
 */
async function warmSiteHealth(
  [{ siteHealthQueries }, { latestCrawlQueries }, screen, { CRAWL_STATES }]: [
    typeof import('@/lib/api/site-health-queries'),
    typeof import('@/lib/api/site-health-latest-crawl'),
    typeof import('@/lib/site-health/use-site-health-screen'),
    typeof import('@/lib/site-health/status'),
  ],
  client: QueryClient,
  scope: ProjectScope,
) {
  const { workspaceId } = scope;
  const dashboard = siteHealthQueries.dashboard(scope);
  const cached = client.getQueryData(dashboard.queryKey);
  warmQuery(client, dashboard);
  if (cached) {
    const preview = screen.pagePreviewQuery(workspaceId, cached);
    if (preview) warmQuery(client, preview);
    return;
  }
  const params = screen.monitoredPagePreviewParams(false);
  const latest = await readFromIntent(client, latestCrawlQueries.pages(scope, params));
  if (!latest) return;
  const { crawl_id: crawlId, crawl_status: status, ...page } = latest;
  const key = siteHealthQueries.pages(workspaceId, crawlId, params).queryKey;
  if (!CRAWL_STATES[status].active && client.getQueryData(key) === undefined)
    client.setQueryData(key, page);
}

/**
 * Warm the issues page itself, not only the dashboard above it.
 *
 * The catalog asks one crawl for its issues, and only the dashboard names the
 * crawl. A cached dashboard warms the catalog under its crawl directly;
 * otherwise the project-scoped read answers for the current crawl (the one the
 * dashboard shows unless a crawl is running), beside the dashboard rather than
 * after it, and its answer is filed under the crawl it names.
 *
 * Only the DEFAULT page is warmed. A reader arriving with filters in the
 * address wants a different key, and warming this one would spend a request on
 * a page they will not see.
 */
async function warmIssues(
  [
    { siteHealthQueries },
    { latestCrawlQueries },
    { emptyIssueFilters, issueCatalogParams, ISSUE_PRIORITY_PARAMS },
  ]: [
    typeof import('@/lib/api/site-health-queries'),
    typeof import('@/lib/api/site-health-latest-crawl'),
    typeof import('@/lib/site-health/issue-filters'),
  ],
  client: QueryClient,
  scope: ProjectScope,
) {
  const { workspaceId } = scope;
  const dashboard = siteHealthQueries.dashboard(scope);
  const cachedCrawlId = client.getQueryData(dashboard.queryKey)?.crawl?.id;
  warmQuery(client, dashboard);
  // The identical params `IssuesCatalog` builds for an unfiltered first page.
  // Spelling them out differently here would warm a key nothing reads.
  const params = issueCatalogParams(emptyIssueFilters, null);
  // The summary above the list reads the crawl's worst issues beside it.
  const warmSummary = (crawlId: string) =>
    warmQuery(client, siteHealthQueries.issues(workspaceId, crawlId, ISSUE_PRIORITY_PARAMS));
  if (cachedCrawlId) {
    warmQuery(client, siteHealthQueries.issues(workspaceId, cachedCrawlId, params));
    warmSummary(cachedCrawlId);
    return;
  }
  const latest = await readFromIntent(client, latestCrawlQueries.issues(scope, params));
  if (!latest) return;
  const { crawl_id: crawlId, ...page } = latest;
  const key = siteHealthQueries.issues(workspaceId, crawlId, params).queryKey;
  if (client.getQueryData(key) === undefined) client.setQueryData(key, page);
  warmSummary(crawlId);
}

const shellReads = () => import('@/lib/api/actions');

/**
 * Warm the reads the application shell makes for a project on every screen:
 * the Actions badge beside the navigation reads the unfiltered first page of
 * the project's Actions. Its component loads lazily, so on a cold load the
 * read otherwise started a round trip after the page's own.
 */
export function prefetchProjectShell(client: QueryClient, scope: ProjectScope): Promise<void> {
  return shellReads()
    .then(({ actionsQueries }) => warmQuery(client, actionsQueries.list(scope)))
    .catch(() => {});
}

/** The destination's own reads: only its own path warms them; a record under it has its own. */
function readsFor(pathname: string): RouteReads | undefined {
  const route = findAppRoute(pathname);
  return route?.path === pathname ? ROUTE_READS[route.path] : undefined;
}

/**
 * Start loading a destination's code and the modules its reads need, before
 * anything says which project they are for. Its reads then go out the moment
 * the scope is known, not a module download later.
 */
export function preloadRouteReads(href: string): void {
  const { pathname } = new URL(href, 'https://citeladder.local');
  preloadRouteChunk(pathname);
  void shellReads().catch(() => {});
  void readsFor(pathname)
    ?.load()
    .catch(() => {});
}

/**
 * Warm a destination's route code and, with a project, its primary read.
 *
 * Settles, never rejects, once every read the destination warms has been
 * issued — nothing needs to wait for that except a caller withdrawing those
 * reads, which must not run before they exist.
 */
export function prefetchRoute(
  client: QueryClient,
  href: string,
  project: ProjectScope | null,
): Promise<void> {
  const { pathname, searchParams } = new URL(href, 'https://citeladder.local');
  preloadRouteChunk(pathname);
  const reads = project ? readsFor(pathname) : undefined;
  if (!project || !reads) return Promise.resolve();
  // Intent is best-effort: a chunk that fails to load must not surface here,
  // and the navigation that follows will report the failure properly.
  return reads.prefetch(client, project, searchParams).catch(() => {});
}
