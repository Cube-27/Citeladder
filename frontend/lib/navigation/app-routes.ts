/**
 * The app's route manifest: every destination the browser can open, declared
 * once. The router, the sidebar, the command palette, the user menu, page
 * titles, the workspace-only test, the project-switch landing and the mode
 * homes all derive from it, so adding or renaming a screen is one edit here.
 *
 * Data only: no React at runtime and no static domain import. Each screen is a
 * `() => import()` so the shell's boot download carries none of them.
 */
import type { ComponentType } from 'react';

import type { IconName } from '@/lib/icons';
import type { NavigationMode } from '@/lib/navigation/mode-memory';

/**
 * Who a destination belongs to: `public` needs no session; `workspace` manages
 * the workspace (reachable with no project at all); `project` works inside the
 * active project.
 */
type RouteScope = 'public' | 'workspace' | 'project';

type DashboardGroup = 'overview' | 'analyze' | 'act' | 'track' | 'setup';
type PaletteGroup = 'Overview' | 'Analyze' | 'Track' | 'Agent' | 'Settings';

/**
 * Where a nav entry is listed: a Dashboard sidebar group, Agent mode's fixed
 * destinations, a command-palette group, or the user menu.
 */
type NavPlacement =
  | `dashboard:${DashboardGroup}`
  | 'agent'
  | `palette:${PaletteGroup}`
  | 'user-menu';

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
  /** Drawn inside the application shell (sidebar, header). */
  shell: boolean;
  mode: NavigationMode;
  /** The destination its mode opens on. */
  modeHome?: true;
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

const mailbox: Screen = () => import('@/components/auth/mailbox-screen');

export const APP_ROUTES = [
  // Public: no session.
  ...(
    ['/verify-email', '/reset-password', '/forgot-password', '/resend-verification'] as const
  ).map(
    (path) =>
      ({
        path,
        title: null,
        scope: 'public',
        shell: false,
        mode: 'dashboard',
        screen: mailbox,
        ...(path === '/verify-email' || path === '/reset-password'
          ? { credentialInUrl: true as const }
          : {}),
      }) satisfies AppRouteRecord,
  ),
  {
    path: '/login',
    title: null,
    scope: 'public',
    shell: false,
    mode: 'dashboard',
    screen: pick(() => import('@/components/auth/auth-routes'), 'LoginRoute'),
  },
  {
    path: '/register',
    title: null,
    scope: 'public',
    shell: false,
    mode: 'dashboard',
    screen: pick(() => import('@/components/auth/auth-routes'), 'RegisterRoute'),
  },

  // Signed in, before the shell opens.
  {
    path: '/workspaces',
    title: null,
    scope: 'workspace',
    shell: false,
    mode: 'dashboard',
    screen: pick(() => import('@/components/auth/workspace-chooser'), 'WorkspaceChooser'),
  },
  {
    path: '/onboarding',
    title: null,
    scope: 'workspace',
    shell: false,
    mode: 'dashboard',
    screen: pick(
      () => import('@/components/onboarding/onboarding-page-client'),
      'OnboardingPageClient',
    ),
  },

  // The application shell, in the order of the product loop.
  {
    path: '/projects',
    title: 'Overview',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    modeHome: true,
    screen: pick(() => import('@/components/projects/projects-screen'), 'ProjectsScreen'),
    nav: [
      {
        label: 'Overview',
        icon: 'overview',
        placements: ['dashboard:overview', 'palette:Overview'],
      },
    ],
  },
  {
    path: '/site',
    title: 'Website',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/site-health/site-health-screen'), 'SiteHealthScreen'),
    nav: [{ label: 'Website', icon: 'site', placements: ['dashboard:analyze', 'palette:Analyze'] }],
  },
  {
    path: '/site/crawls/:crawlId/pages/:siteUrlId',
    title: 'Page detail',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    collection: '/site',
    screen: pick(() => import('@/components/site-health/url-detail'), 'PageDetailScreen'),
  },
  // One download per screen: a shared module for unrelated screens made
  // `/demand` fetch Performance and its chart code.
  {
    path: '/demand',
    title: 'Search Demand',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/demand/demand-projection'), 'DemandProjection'),
    nav: [
      {
        label: 'Search Demand',
        icon: 'demand',
        placements: ['dashboard:analyze', 'palette:Analyze'],
      },
    ],
  },
  {
    path: '/issues',
    title: 'Issues',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/site-health/issues-screen'), 'IssuesScreen'),
    nav: [
      { label: 'Issues', icon: 'issues', placements: ['dashboard:analyze', 'palette:Analyze'] },
    ],
  },
  {
    path: '/search-intelligence',
    title: 'Keyword Research',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(
      () => import('@/components/search-intelligence/search-intelligence-page'),
      'SearchIntelligencePage',
    ),
    nav: [
      {
        label: 'Keyword Research',
        icon: 'searchIntelligence',
        placements: ['dashboard:analyze', 'palette:Analyze'],
      },
    ],
  },
  {
    path: '/performance',
    title: 'Performance',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/performance/performance-screen'), 'PerformanceScreen'),
    nav: [
      {
        label: 'Performance',
        icon: 'performance',
        placements: ['dashboard:analyze', 'palette:Analyze'],
      },
    ],
  },
  {
    path: '/products',
    title: 'Commerce Suite',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/products/products-screen'), 'ProductsScreen'),
    nav: [
      {
        label: 'Commerce Suite',
        icon: 'products',
        placements: ['dashboard:analyze', 'palette:Analyze'],
      },
    ],
  },
  {
    path: '/agent',
    title: 'New chat',
    scope: 'project',
    shell: true,
    mode: 'agent',
    modeHome: true,
    screen: pick(() => import('@/components/agent/new-chat-screen'), 'NewChatScreen'),
    // Agent mode draws New chat above its fixed destinations itself.
    nav: [{ label: 'New chat', icon: 'newChat', placements: ['palette:Agent'] }],
  },
  {
    path: '/agent/chats/:chatId',
    title: 'Agent',
    scope: 'project',
    shell: true,
    mode: 'agent',
    collection: '/agent',
    screen: pick(() => import('@/components/agent/chat-screen'), 'ChatScreen'),
  },
  {
    path: '/agent/actions',
    title: 'Actions',
    scope: 'project',
    shell: true,
    mode: 'agent',
    screen: pick(() => import('@/components/agent/actions-screen'), 'ActionsScreen'),
    // Listed once in the palette, under Agent.
    nav: [
      {
        label: 'Actions',
        icon: 'opportunities',
        badge: 'open-actions',
        placements: ['dashboard:act', 'agent', 'palette:Agent'],
      },
    ],
  },
  {
    path: '/agent/actions/:actionId',
    title: 'Actions',
    scope: 'project',
    shell: true,
    mode: 'agent',
    collection: '/agent/actions',
    screen: pick(() => import('@/components/agent/action-detail-screen'), 'ActionDetailScreen'),
  },
  {
    path: '/agent/skills',
    title: 'Skills',
    scope: 'project',
    shell: true,
    mode: 'agent',
    screen: pick(() => import('@/components/agent/skills-screen'), 'SkillsScreen'),
    nav: [{ label: 'Skills', icon: 'skills', placements: ['agent', 'palette:Agent'] }],
  },
  {
    path: '/agent/context',
    title: 'Context',
    scope: 'project',
    shell: true,
    mode: 'agent',
    screen: pick(() => import('@/components/agent/context-screen'), 'ContextScreen'),
    nav: [{ label: 'Context', icon: 'context', placements: ['agent', 'palette:Agent'] }],
  },
  {
    path: '/prompts',
    title: 'Prompts',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/prompts/prompts-route-content'), 'PromptsRouteContent'),
    nav: [{ label: 'Prompts', icon: 'prompts', placements: ['dashboard:track', 'palette:Track'] }],
  },
  {
    path: '/prompts/:promptId',
    title: 'Prompts',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    collection: '/prompts',
    screen: pick(() => import('@/components/prompts/prompt-detail-screen'), 'PromptDetailScreen'),
  },
  {
    path: '/visibility',
    title: 'AI Visibility',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/visibility/visibility-screen'), 'VisibilityScreen'),
    nav: [
      {
        label: 'AI Visibility',
        icon: 'visibility',
        placements: ['dashboard:track', 'palette:Track'],
      },
    ],
  },
  {
    path: '/runs',
    title: 'Runs',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/runs/runs-screen'), 'RunsScreen'),
    nav: [{ label: 'Runs', icon: 'runs', placements: ['dashboard:track', 'palette:Track'] }],
  },
  {
    path: '/runs/:runId',
    title: 'Run detail',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    collection: '/runs',
    screen: pick(() => import('@/components/runs/run-detail-screen'), 'RunDetailScreen'),
  },
  {
    path: '/ai-traffic',
    title: 'AI Traffic',
    scope: 'project',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/ai-traffic/ai-traffic-screen'), 'AiTrafficScreen'),
    nav: [
      { label: 'AI Traffic', icon: 'aiTraffic', placements: ['dashboard:track', 'palette:Track'] },
    ],
  },

  // The workspace's own pages, inside the shell.
  {
    path: '/settings',
    title: 'Settings',
    scope: 'workspace',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/settings/settings-screen'), 'SettingsScreen'),
    nav: [
      { label: 'Settings', icon: 'settings', placements: ['palette:Settings', 'user-menu'] },
      {
        label: 'Integrations',
        icon: 'setup',
        search: 'tab=integrations',
        placements: ['dashboard:setup', 'palette:Settings'],
      },
      {
        label: 'Providers',
        icon: 'settings',
        search: 'tab=providers',
        hiddenWhenManaged: true,
        placements: ['palette:Settings'],
      },
      {
        label: 'Connect AI assistants',
        icon: 'connect',
        search: 'tab=connections',
        listedLast: true,
        placements: ['user-menu'],
      },
    ],
  },
  {
    path: '/billing',
    title: 'Billing',
    scope: 'workspace',
    shell: true,
    mode: 'dashboard',
    screen: pick(() => import('@/components/billing/billing-screen'), 'BillingScreen'),
    nav: [{ label: 'Billing', icon: 'billing', placements: ['palette:Settings', 'user-menu'] }],
  },
  {
    path: '/pricing',
    title: 'Pricing',
    scope: 'workspace',
    shell: true,
    mode: 'dashboard',
    screen: () => import('@/components/billing/pricing-route'),
  },
  {
    path: '/invitations/accept',
    title: null,
    scope: 'workspace',
    shell: true,
    mode: 'dashboard',
    credentialInUrl: true,
    screen: pick(
      () => import('@/components/settings/accept-invitation-screen'),
      'AcceptInvitationPage',
    ),
  },
] as const satisfies readonly AppRouteRecord[];

export type AppRoutePath = (typeof APP_ROUTES)[number]['path'];

/** A manifest record, with its path known to be one of the manifest's. */
export type AppRoute = AppRouteRecord & { path: AppRoutePath };

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

/** The shell mode a pathname is in; anything unknown is Dashboard. */
export function navigationMode(pathname: string): NavigationMode {
  return sectionRoute(pathname)?.mode ?? 'dashboard';
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

function modeHome(mode: NavigationMode): string {
  const home = ROUTES.find((route) => route.mode === mode && route.modeHome);
  if (!home) throw new Error(`No home route for ${mode} mode`);
  return home.path;
}

export const MODE_HOMES: Readonly<Record<NavigationMode, string>> = {
  dashboard: modeHome('dashboard'),
  agent: modeHome('agent'),
};

/** A nav entry with its full address and the scope its link carries. */
export type NavDestination = Pick<NavEntry, 'label' | 'icon' | 'badge' | 'hiddenWhenManaged'> & {
  href: string;
  scope: Exclude<RouteScope, 'public'>;
};

/** Every entry listed at a placement, in manifest order (`listedLast` entries after). */
export function navDestinations(placement: NavPlacement): readonly NavDestination[] {
  const listed = ROUTES.flatMap((route) =>
    (route.nav ?? [])
      .filter((entry) => entry.placements.includes(placement))
      .map((entry) => ({ route, entry })),
  );
  return [
    ...listed.filter(({ entry }) => !entry.listedLast),
    ...listed.filter(({ entry }) => entry.listedLast),
  ].map(({ route, entry: { label, icon, badge, hiddenWhenManaged, search } }) => ({
    label,
    icon,
    ...(badge ? { badge } : {}),
    ...(hiddenWhenManaged ? { hiddenWhenManaged } : {}),
    href: search ? `${route.path}?${search}` : route.path,
    scope: route.scope === 'project' ? 'project' : 'workspace',
  }));
}
