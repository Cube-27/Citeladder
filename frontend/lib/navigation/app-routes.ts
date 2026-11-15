/**
 * The app's route manifest: every destination the browser can open, declared
 * once. The router, the sidebar, the command palette, the account menu, page
 * titles, the workspace-only test and the project-switch landing all derive
 * from it, so adding or renaming a screen is one edit here.
 *
 * Data only: no React at runtime and no static domain import. Each screen is a
 * `() => import()` so the shell's boot download carries none of them.
 */
import type { ComponentType } from 'react';

import type { IconName } from '@/lib/icons';

/**
 * Who a destination belongs to: `public` needs no session; `workspace` manages
 * the workspace (reachable with no project at all); `project` works inside the
 * active project.
 */
type RouteScope = 'public' | 'workspace' | 'project';

/** The sidebar's groups, in the order of the product loop; `foot` sits above the account. */
export type SidebarGroup = 'overview' | 'analyze' | 'commerce' | 'act' | 'track' | 'foot';

/**
 * Where a nav entry is listed: a sidebar group (the command palette lists the
 * same groups in the same order), the account menu, or the palette alone.
 */
type NavPlacement = `sidebar:${SidebarGroup}` | 'account' | 'palette';

/** One way into a destination. A route may have several (a settings tab). */
type NavEntry = {
  label: string;
  icon: IconName;
  /** Query the entry adds to the route's path, e.g. `tab=integrations`. */
  search?: string;
  /** A live count shown beside the label. */
  badge?: 'open-actions';
  /** A managed plan has no provider settings (B32). */
  hiddenWhenManaged?: true;
  /** Listed after the placement's other entries rather than in manifest order. */
  listedLast?: true;
  placements: readonly NavPlacement[];
};

type Screen = () => Promise<{ default: ComponentType }>;

export type AppRouteRecord = {
  /** A React Router pattern; `:name` segments match one path segment. */
  path: string;
  /** The page header and document title; null where the route draws its own. */
  title: string | null;
  scope: RouteScope;
  /** Drawn inside the application shell (sidebar, masthead). */
  shell: boolean;
  screen: Screen;
  /**
   * For a path naming one project's record: the section a project switch
   * lands on, since the next project does not have that record.
   */
  collection?: string;
  /** The URL carries a single-use bearer credential (an email or invitation link). */
  credentialInUrl?: true;
  nav?: readonly NavEntry[];
};

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
  demand: pick(() => import('@/components/demand/demand-projection'), 'DemandProjection'),
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
  actions: pick(() => import('@/components/agent/actions-screen'), 'ActionsScreen'),
  action: pick(() => import('@/components/agent/action-detail-screen'), 'ActionDetailScreen'),
  skills: pick(() => import('@/components/agent/skills-screen'), 'SkillsScreen'),
  context: pick(() => import('@/components/agent/context-screen'), 'ContextScreen'),
  prompts: pick(() => import('@/components/prompts/prompts-route-content'), 'PromptsRouteContent'),
  prompt: pick(() => import('@/components/prompts/prompt-detail-screen'), 'PromptDetailScreen'),
  visibility: pick(() => import('@/components/visibility/visibility-screen'), 'VisibilityScreen'),
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
    nav: [listed('Overview', 'overview', 'overview')],
  }),
  page({
    path: '/site',
    title: 'Website',
    screen: screens.site,
    nav: [listed('Website', 'site', 'analyze')],
  }),
  page({
    path: '/site/crawls/:crawlId/pages/:siteUrlId',
    title: 'Page detail',
    collection: '/site',
    screen: screens.pageDetail,
  }),
  page({
    path: '/issues',
    title: 'Issues',
    screen: screens.issues,
    nav: [listed('Issues', 'issues', 'analyze')],
  }),
  page({
    path: '/performance',
    title: 'Performance',
    screen: screens.performance,
    nav: [listed('Performance', 'performance', 'analyze')],
  }),
  page({
    path: '/demand',
    title: 'Search Demand',
    screen: screens.demand,
    nav: [listed('Search Demand', 'demand', 'analyze')],
  }),
  page({
    path: '/search-intelligence',
    title: 'Keyword Research',
    screen: screens.keywords,
    nav: [listed('Keyword Research', 'searchIntelligence', 'analyze')],
  }),
  // Commerce: Shopping, then the Products table. Shopping is declared before
  // `/products/:targetId`, which would otherwise match it.
  page({
    path: '/products/overview',
    title: 'Shopping',
    screen: screens.shoppingOverview,
    nav: [listed('Shopping', 'reports', 'commerce')],
  }),
  page({
    path: '/products',
    title: 'Products',
    screen: screens.products,
    nav: [listed('Products', 'products', 'commerce')],
  }),
  page({
    path: '/products/:targetId',
    title: 'Product',
    collection: '/products',
    screen: screens.product,
  }),
  page({
    path: '/agent/actions',
    title: 'Actions',
    screen: screens.actions,
    nav: [
      {
        label: 'Actions',
        icon: 'opportunities',
        badge: 'open-actions',
        placements: ['sidebar:act'],
      },
    ],
  }),
  page({
    path: '/agent/actions/:actionId',
    title: 'Action',
    collection: '/agent/actions',
    screen: screens.action,
  }),
  page({
    path: '/agent',
    title: 'Agent',
    screen: screens.newChat,
    nav: [listed('Agent', 'agent', 'act')],
  }),
  page({
    path: '/agent/chats/:chatId',
    title: 'Chat',
    collection: '/agent',
    screen: screens.chat,
  }),
  page({
    path: '/agent/skills',
    title: 'Skills',
    screen: screens.skills,
    nav: [listed('Skills', 'skills', 'act')],
  }),
  page({
    path: '/agent/context',
    title: 'Context',
    screen: screens.context,
    nav: [listed('Context', 'context', 'act')],
  }),
  page({
    path: '/prompts',
    title: 'Prompts',
    screen: screens.prompts,
    nav: [listed('Prompts', 'prompts', 'track')],
  }),
  page({
    path: '/prompts/:promptId',
    title: 'Prompt',
    collection: '/prompts',
    screen: screens.prompt,
  }),
  page({
    path: '/visibility',
    title: 'AI Visibility',
    screen: screens.visibility,
    nav: [listed('AI Visibility', 'visibility', 'track')],
  }),
  page({
    path: '/runs',
    title: 'Runs',
    screen: screens.runs,
    nav: [listed('Runs', 'runs', 'track')],
  }),
  page({
    path: '/runs/:runId',
    title: 'Run',
    collection: '/runs',
    screen: screens.run,
  }),
  page({
    path: '/ai-traffic',
    title: 'AI Traffic',
    screen: screens.aiTraffic,
    nav: [listed('AI Traffic', 'aiTraffic', 'track')],
  }),

  // The workspace's own pages, inside the shell.
  page({
    path: '/settings',
    title: 'Settings',
    scope: 'workspace',
    screen: screens.settings,
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
        label: 'Connect AI assistants',
        icon: 'connect',
        search: 'tab=connections',
        listedLast: true,
        placements: ['account'],
      },
    ],
  }),
  page({
    path: '/billing',
    title: 'Billing',
    scope: 'workspace',
    screen: screens.billing,
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

/** A nav entry with its full address and the scope its link carries. */
export type NavDestination = Pick<NavEntry, 'label' | 'icon' | 'badge' | 'hiddenWhenManaged'> & {
  href: string;
  scope: Exclude<RouteScope, 'public'>;
};

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
