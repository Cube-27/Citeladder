/**
 * The app's route manifest: every destination the browser can open, declared
 * once. The router, the sidebar, the command palette, the account menu, page
 * titles, the workspace-only test and the project-switch landing all derive
 * from it, so adding or renaming a screen is one edit here.
 *
 * Data only: no React at runtime and no static domain import. Each screen is a
 * `() => import()` so the shell's boot download carries none of them. The
 * build loads this file in Node (apps/app/boot-shell.ts): type imports only.
 */
import type { LoadingShape } from '@/components/ui/skeleton-block';
import type { IconName } from '@/lib/icons';
import type {
  AppRouteRecord,
  NavDestination,
  NavEntry,
  NavPlacement,
  RouteLoading,
  Screen,
  SidebarGroup,
} from './route-types';

/**
 * Dashboard mode's groups in order, with their labels. Each group answers one question: how AI sees the brand, what is
 * measured and what AI reads, the brand's own site, classic search, products.
 */
export const DASHBOARD_SIDEBAR_GROUPS = [
  { group: 'home', title: 'Home' },
  { group: 'brand', title: 'Brand' },
  { group: 'tracking', title: 'Tracking' },
  { group: 'website', title: 'Website' },
  { group: 'search', title: 'Search' },
  { group: 'commerce', title: 'Commerce' },
] as const satisfies readonly { group: SidebarGroup; title: string }[];

/** Pick one named export of a lazily loaded module as the route's screen. */
function pick<M, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): () => Promise<{ default: M[K] }> {
  return () => load().then((module) => ({ default: module[name] }));
}

type RouteInput<P extends string> = Partial<Omit<AppRouteRecord, 'path' | 'screen'>> & {
  path: P;
  screen: Screen;
};

/** A destination; unless it says otherwise, a project page inside the shell. */
function page<const P extends string>(input: RouteInput<P>): AppRouteRecord & { path: P } {
  return { title: null, scope: 'project', shell: true, ...input };
}

/** A page outside the shell: public (no session) or a signed-in flow step. */
function flow<const P extends string>(
  path: P,
  scope: 'public' | 'workspace',
  screen: Screen,
  extra: Pick<AppRouteRecord, 'credentialInUrl'> = {},
): AppRouteRecord & { path: P } {
  return page({ path, scope, shell: false, screen, ...extra });
}

/** A nav entry listed in one sidebar group (and so in the palette's). */
function listed(label: string, icon: IconName, group: SidebarGroup): NavEntry {
  return { label, icon, placements: [`sidebar:${group}`] };
}

/** Every screen's loader, named once; a route refers to its screen by name. */
const screens = {
  mailbox: () => import('@/components/auth/mailbox-screen'),
  login: pick(() => import('@/components/auth/auth-routes'), 'LoginRoute'),
  register: pick(() => import('@/components/auth/auth-routes'), 'RegisterRoute'),
  workspaces: pick(() => import('@/components/auth/workspace-chooser'), 'WorkspaceChooser'),
  onboarding: pick(
    () => import('@/components/onboarding/onboarding-page-client'),
    'OnboardingPageClient',
  ),
  projects: pick(() => import('@/components/projects/projects-screen'), 'ProjectsScreen'),
  site: pick(() => import('@/components/site-health/site-health-screen'), 'SiteHealthScreen'),
  pageDetail: pick(() => import('@/components/site-health/url-detail'), 'PageDetailScreen'),
  issues: pick(() => import('@/components/site-health/issues-screen'), 'IssuesScreen'),
  keywords: pick(
    () => import('@/components/search-intelligence/search-intelligence-page'),
    'SearchIntelligencePage',
  ),
  performance: pick(
    () => import('@/components/performance/performance-screen'),
    'PerformanceScreen',
  ),
  products: pick(() => import('@/components/products/products-screen'), 'ProductsScreen'),
  shoppingOverview: pick(
    () => import('@/components/products/shopping-overview-screen'),
    'ShoppingOverviewScreen',
  ),
  product: pick(() => import('@/components/products/product-detail-screen'), 'ProductDetailScreen'),
  newChat: pick(() => import('@/components/agent/new-chat-screen'), 'NewChatScreen'),
  chat: pick(() => import('@/components/agent/chat-screen'), 'ChatScreen'),
  actions: pick(() => import('@/components/agent/actions-list-screen'), 'ActionsScreen'),
  action: pick(() => import('@/components/agent/action-detail-screen'), 'ActionDetailScreen'),
  actionUrl: pick(() => import('@/components/agent/action-url-screen'), 'ActionUrlScreen'),
  skills: pick(() => import('@/components/agent/skills-screen'), 'SkillsScreen'),
  context: pick(() => import('@/components/agent/context-screen'), 'ContextScreen'),
  insights: pick(() => import('@/components/brand/insights-screen'), 'InsightsScreen'),
  perception: pick(() => import('@/components/perception/perception-screen'), 'PerceptionScreen'),
  competitors: pick(() => import('@/components/brand/competitors-screen'), 'CompetitorsScreen'),
  competitor: pick(() => import('@/components/brand/competitor-screen'), 'CompetitorScreen'),
  prompts: pick(() => import('@/components/prompts/prompt-library'), 'PromptLibrary'),
  promptBuilder: pick(
    () => import('@/components/prompts/prompt-builder-page'),
    'PromptBuilderPage',
  ),
  prompt: pick(() => import('@/components/prompts/prompt-detail-screen'), 'PromptDetailScreen'),
  visibility: pick(
    () => import('@/components/visibility/visibility-dashboard'),
    'VisibilityDashboard',
  ),
  runs: pick(() => import('@/components/runs/runs-screen'), 'RunsScreen'),
  run: pick(() => import('@/components/runs/run-detail-screen'), 'RunDetailScreen'),
  aiTraffic: pick(() => import('@/components/ai-traffic/ai-traffic-screen'), 'AiTrafficScreen'),
  settings: pick(() => import('@/components/settings/settings-screen'), 'SettingsScreen'),
  billing: pick(() => import('@/components/billing/billing-screen'), 'BillingScreen'),
  pricing: () => import('@/components/billing/pricing-route'),
  invitation: pick(
    () => import('@/components/settings/accept-invitation-screen'),
    'AcceptInvitationPage',
  ),
} satisfies Record<string, Screen>;

const credential = { credentialInUrl: true } as const;

const chart = { kind: 'chart' } satisfies LoadingShape;
const table = (columns: number, desktopOnly?: number): LoadingShape => ({
  kind: 'table',
  columns,
  desktopOnly,
});
const figures = (count?: number): LoadingShape => ({ kind: 'figures', count });
const facts = (rows: number, tagRows?: readonly number[]): LoadingShape => ({
  kind: 'facts',
  rows,
  tagRows,
});
const cards = (
  shapes: readonly LoadingShape[],
  frame: Readonly<{ tabs?: readonly string[]; filters?: boolean }> = {},
): RouteLoading => ({ kind: 'cards', shapes, ...frame });
/** A record: its identity card. */
const RECORD_LOADING = cards([facts(3)]);

export const APP_ROUTES = [
  // Public: no session.
  flow('/verify-email', 'public', screens.mailbox, credential),
  flow('/reset-password', 'public', screens.mailbox, credential),
  flow('/forgot-password', 'public', screens.mailbox),
  flow('/resend-verification', 'public', screens.mailbox),
  flow('/login', 'public', screens.login),
  flow('/register', 'public', screens.register),

  // Signed in, before the shell opens.
  flow('/workspaces', 'workspace', screens.workspaces),
  flow('/onboarding', 'workspace', screens.onboarding),

  // The application shell, in the order of the product loop (the sidebar's).
  page({
    path: '/projects',
    title: 'Overview',
    screen: screens.projects,
    loading: { kind: 'overview' },
    nav: [listed('Overview', 'overview', 'home')],
  }),
  page({
    path: '/site',
    title: 'Site health',
    screen: screens.site,
    loading: cards([figures(), table(6)], {
      tabs: ['Overview', 'Pages', 'Architecture', 'AEO readiness', 'Internal links', 'Changes'],
    }),
    nav: [listed('Site health', 'site', 'website')],
  }),
  page({
    path: '/site/crawls/:crawlId/pages/:siteUrlId',
    title: 'Page detail',
    collection: '/site',
    screen: screens.pageDetail,
    // URL, Kind (a tag) and Audited, then the page's scores.
    loading: cards([facts(3, [1]), figures(3)]),
  }),
  page({
    path: '/issues',
    width: 'narrow',
    title: 'Issues',
    screen: screens.issues,
    loading: cards([table(4)], { filters: true }),
    nav: [listed('Issues', 'issues', 'website')],
  }),
  page({
    path: '/performance',
    title: 'Performance',
    screen: screens.performance,
    // No tab row: its range toolbar is the filter row.
    loading: cards([figures(4), chart], { filters: true }),
    nav: [listed('Performance', 'performance', 'search')],
  }),
  page({
    path: '/search-intelligence',
    title: 'Keyword research',
    screen: screens.keywords,
    // Opens on Demand: its signals table under a held control strip.
    loading: cards([table(8)], {
      tabs: ['Demand', 'Overview', 'Keywords', 'Organic competitors', 'Backlinks'],
      filters: true,
    }),
    nav: [listed('Keyword research', 'searchIntelligence', 'search')],
  }),
  // Commerce: Shopping, then the Products table. Shopping is declared before
  // `/products/:targetId`, which would otherwise match it.
  page({
    path: '/products/overview',
    title: 'Shopping',
    screen: screens.shoppingOverview,
    loading: cards([figures(4), table(4)]),
    nav: [listed('Shopping', 'reports', 'commerce')],
  }),
  page({
    path: '/products',
    title: 'Products',
    screen: screens.products,
    loading: cards([table(4)], { filters: true }),
    nav: [listed('Products', 'products', 'commerce')],
  }),
  page({
    path: '/products/:targetId',
    title: 'Product',
    collection: '/products',
    screen: screens.product,
    // The product's identity, then its six KPIs.
    loading: cards([facts(3), figures(6)]),
  }),
  page({
    path: '/actions',
    width: 'narrow',
    title: 'Actions',
    screen: screens.actions,
    // The goal strip, then Action, Priority and Source.
    loading: cards([figures(4), table(3)], { filters: true }),
    // A Dashboard page: every Action in the app, Issues included (owner, 2026-11-16).
    nav: [
      {
        label: 'Actions',
        icon: 'opportunities',
        badge: 'open-actions',
        placements: ['sidebar:home'],
      },
    ],
  }),
  page({
    path: '/actions/:actionId',
    width: 'narrow',
    title: 'Action',
    collection: '/actions',
    screen: screens.action,
    // The Details card: Status, Impact, Scope, Source, Grouping.
    loading: cards([facts(5)]),
  }),
  page({
    path: '/actions/urls/:siteUrlId',
    width: 'narrow',
    title: 'URL',
    collection: '/actions',
    screen: screens.actionUrl,
    // The Details card: Page type, Last crawled, Open actions.
    loading: cards([facts(3)]),
  }),
  // Brand: how AI sees the brand. Built next by docs/plans/ai-visibility-gaps.md.
  page({
    path: '/insights',
    title: 'Insights',
    screen: screens.insights,
    // The lede's key figures, then the trend.
    loading: cards([figures(3), chart], { filters: true }),
    nav: [listed('Insights', 'insights', 'brand')],
  }),
  page({
    path: '/perception',
    title: 'Perception',
    screen: screens.perception,
    // Fact-checking, shown only to the pilot, is last and arrives after.
    loading: cards([figures(5), chart], { tabs: ['Brand'], filters: true }),
    nav: [
      listed('Perception', 'perception', 'brand'),
      // A non-pilot project opens on Brand: the page owns the pilot gate.
      {
        label: 'Fact-checking',
        icon: 'factChecking',
        search: 'tab=fact-checking',
        placements: ['palette:brand'],
      },
    ],
  }),
  page({
    path: '/competitors',
    title: 'Competitors',
    screen: screens.competitors,
    // The ranking, then the suggestions.
    loading: cards([table(5), table(5)], { filters: true }),
    nav: [listed('Competitors', 'competitors', 'brand')],
  }),
  page({
    path: '/competitors/:name',
    title: 'Competitor',
    collection: '/competitors',
    screen: screens.competitor,
    // Its figures beside yours, the trend, then sources and prompts side by side.
    loading: cards([figures(5), chart, table(3)], { filters: true }),
  }),
  page({
    path: '/agent',
    width: 'narrow',
    title: 'Agent',
    screen: screens.newChat,
    loading: { kind: 'new-chat' },
    // Agent mode draws it as its "New chat" button, first in the list.
    nav: [{ label: 'New chat', icon: 'newChat', placements: ['sidebar:agent'] }],
  }),
  page({
    path: '/agent/chats/:chatId',
    width: 'narrow',
    title: 'Chat',
    collection: '/agent',
    screen: screens.chat,
    loading: { kind: 'thread' },
  }),
  page({
    path: '/agent/skills',
    width: 'narrow',
    title: 'Skills',
    screen: screens.skills,
    loading: cards([table(4)]),
    nav: [listed('Skills', 'skills', 'agent')],
  }),
  page({
    path: '/agent/context',
    width: 'narrow',
    title: 'Context',
    screen: screens.context,
    // The Company facts form's five fields.
    loading: cards([facts(5)], {
      tabs: [
        'Company',
        'Audience & Offerings',
        'Business map',
        'Competitors',
        'Agent instructions',
      ],
    }),
    nav: [listed('Context', 'context', 'agent')],
  }),
  page({
    path: '/prompts',
    title: 'Prompts',
    screen: screens.prompts,
    loading: cards([table(8)], { filters: true }),
    nav: [listed('Prompts', 'prompts', 'tracking')],
  }),
  // Before `/prompts/:promptId`, so `build` is never read as a prompt id.
  page({
    path: '/prompts/build',
    title: 'Prompt builder',
    collection: '/prompts',
    screen: screens.promptBuilder,
    // The step list beside the business step's fields.
    loading: cards([facts(6)]),
    nav: [{ label: 'Prompt builder', icon: 'promptBuilder', placements: ['palette:tracking'] }],
  }),
  page({
    path: '/prompts/:promptId',
    title: 'Prompt',
    collection: '/prompts',
    screen: screens.prompt,
    // Titled by the prompt itself: no identity card, its visibility figures first.
    loading: cards([figures(2), chart]),
  }),
  page({
    path: '/visibility',
    title: 'Sources',
    screen: screens.visibility,
    // Domains, the default tab, opens on its cited-domain table and charts.
    loading: cards([table(6), chart], {
      tabs: ['Domains', 'URLs', 'Read, not cited', 'Query fanouts', 'Ads'],
      filters: true,
    }),
    nav: [
      listed('Sources', 'visibility', 'tracking'),
      {
        label: 'Query fanouts',
        icon: 'queryFanouts',
        search: 'tab=query-fanout',
        placements: ['palette:tracking'],
      },
    ],
  }),
  page({
    path: '/runs',
    title: 'Runs',
    screen: screens.runs,
    loading: cards([table(5)]),
    nav: [listed('Runs', 'runs', 'tracking')],
  }),
  page({
    path: '/runs/:runId',
    title: 'Run',
    collection: '/runs',
    screen: screens.run,
    loading: cards([facts(3), table(7)]),
  }),
  page({
    path: '/ai-traffic',
    title: 'AI traffic',
    screen: screens.aiTraffic,
    loading: cards([figures(3), chart], {
      tabs: ['Overview', 'Crawlers', 'Referrals', 'Pages', 'Activity'],
    }),
    nav: [listed('AI traffic', 'aiTraffic', 'website')],
  }),

  // The workspace's own pages, inside the shell.
  page({
    path: '/settings',
    width: 'narrow',
    title: 'Settings',
    scope: 'workspace',
    screen: screens.settings,
    // Account's Profile card: the identity row, then two facts.
    loading: cards([facts(3)], {
      tabs: ['Account', 'Workspace', 'Providers', 'Integrations', 'MCP connections', 'API keys'],
    }),
    nav: [
      {
        label: 'Integrations',
        icon: 'setup',
        search: 'tab=integrations',
        placements: ['sidebar:foot'],
      },
      { label: 'Settings', icon: 'settings', placements: ['account'] },
      {
        label: 'Providers',
        icon: 'settings',
        search: 'tab=providers',
        hiddenWhenManaged: true,
        placements: ['palette'],
      },
      {
        label: 'MCP connections',
        icon: 'connect',
        search: 'tab=connections',
        listedLast: true,
        placements: ['account'],
      },
    ],
  }),
  page({
    path: '/billing',
    width: 'narrow',
    title: 'Billing',
    scope: 'workspace',
    screen: screens.billing,
    // The current plan (its access tag), then usage.
    loading: cards([facts(3, [1]), table(5)]),
    nav: [{ label: 'Billing', icon: 'billing', placements: ['account'] }],
  }),
  page({
    path: '/pricing',
    title: 'Pricing',
    scope: 'workspace',
    screen: screens.pricing,
  }),
  // An invitation is a Flow page: it opens before the shell, as setup does.
  flow('/invitations/accept', 'workspace', screens.invitation, credential),
];

export type AppRoutePath = (typeof APP_ROUTES)[number]['path'];

/** A manifest record, with its path known to be one of the manifest's. */
type AppRoute = AppRouteRecord & { path: AppRoutePath };

const ROUTES: readonly AppRoute[] = APP_ROUTES;

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matchesPattern(pattern: string, pathname: string): boolean {
  const want = segments(pattern);
  const have = segments(pathname);
  return (
    want.length === have.length &&
    want.every((segment, index) => segment.startsWith(':') || segment === have[index])
  );
}

/** The route whose pattern matches the whole pathname, if any. */
export function findAppRoute(pathname: string): AppRoute | undefined {
  return ROUTES.find((route) => matchesPattern(route.path, pathname));
}

/**
 * The route the pathname belongs to: its own route, or else the deepest
 * parameter-free route it sits below. Every tab and unknown sub-path of
 * Website is still Website.
 */
function sectionRoute(pathname: string): AppRoute | undefined {
  const own = findAppRoute(pathname);
  if (own) return own;
  let best: AppRoute | undefined;
  for (const route of ROUTES) {
    if (route.path.includes(':') || !pathname.startsWith(`${route.path}/`)) continue;
    if (!best || route.path.length > best.path.length) best = route;
  }
  return best;
}

const FALLBACK_TITLE = 'CiteLadder';

/** The page header and document title for a pathname. */
export function resolveTitle(pathname: string): string {
  return sectionRoute(pathname)?.title ?? FALLBACK_TITLE;
}

/** The loading frame for a pathname: its section's, else a record's. */
export function routeLoading(pathname: string): RouteLoading {
  return sectionRoute(pathname)?.loading ?? RECORD_LOADING;
}

/** A page's width: its section's, else the main column's. */
export function routeWidth(pathname: string): 'narrow' | 'full' {
  return sectionRoute(pathname)?.width ?? 'full';
}

/** Whether the path is one of the application shell's titled pages. */
export function hasPageTitle(pathname: string): boolean {
  const route = sectionRoute(pathname);
  return Boolean(route?.shell && route.title);
}

/** The Overview, where `/` and a workspace switch land. */
export const HOME_PATH = '/projects' satisfies AppRoutePath;

/** Whether the path is one of the Agent's own pages, known or not (they have no "Ask agent"). */
export function isAgentPath(pathname: string): boolean {
  return pathname === '/agent' || pathname.startsWith('/agent/');
}

/** The shell's two modes; the sidebar lists one at a time. */
export type NavigationMode = 'dashboard' | 'agent';

/** The mode a path belongs to: every Agent page is Agent mode, everything else Dashboard. */
export function navigationMode(pathname: string): NavigationMode {
  return isAgentPath(pathname) ? 'agent' : 'dashboard';
}

/** Where a mode opens when it has no remembered route for the project. */
export const MODE_HOMES = {
  dashboard: HOME_PATH,
  agent: '/agent',
} as const satisfies Record<NavigationMode, AppRoutePath>;

/**
 * Whether the route manages the WORKSPACE rather than working inside a project.
 *
 * A workspace with no projects is a valid workspace: its owner may still need
 * billing, members and settings, and an invitee at an acceptance link has not
 * joined anything yet. Sending these to project creation made an empty
 * workspace unmanageable.
 */
export function isWorkspaceOnlyRoute(pathname: string | null): boolean {
  return pathname ? sectionRoute(pathname)?.scope === 'workspace' : false;
}

/**
 * Where a project switch lands from this pathname. A path naming one
 * project's crawl, run, prompt, chat or Action would ask the next project for
 * a record it does not have, so it lands on that section's collection.
 */
export function projectSwitchPathname(pathname: string): string {
  return findAppRoute(pathname)?.collection ?? pathname;
}

/** Every entry listed at a placement, in manifest order (`listedLast` entries after). */
export function navDestinations(placement: NavPlacement): readonly NavDestination[] {
  const entries = ROUTES.flatMap((route) =>
    (route.nav ?? [])
      .filter((entry) => entry.placements.includes(placement))
      .map((entry) => ({ route, entry })),
  );
  return [
    ...entries.filter(({ entry }) => !entry.listedLast),
    ...entries.filter(({ entry }) => entry.listedLast),
  ].map(({ route, entry: { label, icon, badge, hiddenWhenManaged, search } }) => ({
    label,
    icon,
    ...(badge ? { badge } : {}),
    ...(hiddenWhenManaged ? { hiddenWhenManaged } : {}),
    href: search ? `${route.path}?${search}` : route.path,
    scope: route.scope === 'project' ? 'project' : 'workspace',
  }));
}
