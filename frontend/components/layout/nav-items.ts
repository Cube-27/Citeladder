import type { LucideIcon } from 'lucide-react';

import { ICONS } from '@/lib/icons';
import { DASHBOARD_SIDEBAR_GROUPS, MODE_HOMES, navDestinations } from '@/lib/navigation/app-routes';
import type { NavDestination } from '@/lib/navigation/route-types';

/** A manifest nav entry with its glyph resolved, ready to render as a link. */
export type NavItem = Omit<NavDestination, 'icon'> & { icon: LucideIcon };

type DashboardGroup = (typeof DASHBOARD_SIDEBAR_GROUPS)[number];

/** A Dashboard group: its label and its rail glyph. */
export type NavGroup = Readonly<
  DashboardGroup & {
    /** The collapsed rail's one button for the group. */
    icon: LucideIcon;
    items: readonly NavItem[];
  }
>;

function navItems(placement: Parameters<typeof navDestinations>[0]): readonly NavItem[] {
  return navDestinations(placement).map((entry) => ({ ...entry, icon: ICONS[entry.icon] }));
}

const GROUP_ICONS = {
  home: ICONS.overview,
  brand: ICONS.insights,
  tracking: ICONS.prompts,
  website: ICONS.site,
  search: ICONS.searchIntelligence,
  commerce: ICONS.products,
} satisfies Record<DashboardGroup['group'], LucideIcon>;

/** Dashboard mode: Home, Brand, Tracking, Website, Search and Commerce. */
export const DASHBOARD_GROUPS: readonly NavGroup[] = DASHBOARD_SIDEBAR_GROUPS.map((entry) => ({
  ...entry,
  icon: GROUP_ICONS[entry.group],
  items: navItems(`sidebar:${entry.group}`),
}));

const agentEntries = navItems('sidebar:agent');

/** Agent mode's "New chat" button: the Agent's own home. */
export const NEW_CHAT_ITEM: NavItem = agentEntries.find(
  (item) => item.href === MODE_HOMES.agent,
) ?? { label: 'New chat', icon: ICONS.newChat, href: MODE_HOMES.agent, scope: 'project' };

/** Agent mode's destinations under "New chat": Skills, Context. */
export const AGENT_NAV_ITEMS = agentEntries.filter((item) => item !== NEW_CHAT_ITEM);

/** The foot's destinations, above the account button. */
export const FOOT_NAV_ITEMS = navItems('sidebar:foot');

/** The account menu's workspace and account links. */
export const ACCOUNT_MENU_ITEMS = navItems('account');

/** Every sidebar row in either mode, for marking the current one. */
const SIDEBAR_ITEMS: readonly NavItem[] = [
  ...DASHBOARD_GROUPS.flatMap((entry) => entry.items),
  NEW_CHAT_ITEM,
  ...AGENT_NAV_ITEMS,
  ...FOOT_NAV_ITEMS,
].filter((item, index, all) => all.findIndex((other) => other.href === item.href) === index);

const SIDEBAR_PATHS = SIDEBAR_ITEMS.map(
  (item) => new URL(item.href, 'https://citeladder.local').pathname,
);

const AGENT_HREFS = new Set([NEW_CHAT_ITEM, ...AGENT_NAV_ITEMS].map((item) => item.href));

/**
 * Every shell destination, grouped for the command palette with the
 * sidebar's labels: Overview, Analyze, Commerce, Track, Agent, then Settings
 * (Integrations and the account's pages). An Agent destination the Dashboard
 * list repeats is listed once, under Agent. A managed plan has no
 * provider settings (B32).
 */
export function resolveCommandGroups({ managed = false }: { managed?: boolean } = {}): readonly {
  title: string;
  items: readonly NavItem[];
}[] {
  const settings = [...FOOT_NAV_ITEMS, ...ACCOUNT_MENU_ITEMS, ...navItems('palette')].filter(
    (item) => !managed || !item.hiddenWhenManaged,
  );
  return [
    ...DASHBOARD_GROUPS.map(({ group, title, items }) => ({
      title,
      items: [
        ...items.filter((item) => !AGENT_HREFS.has(item.href)),
        ...navItems(`palette:${group}`),
      ],
    })),
    { title: 'Agent', items: [NEW_CHAT_ITEM, ...AGENT_NAV_ITEMS] },
    { title: 'Settings', items: settings },
  ];
}

const atOrBelow = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/** The pages behind the account button: its menu's pages, and Pricing, reached from Billing. */
const ACCOUNT_PATHS = [
  ...ACCOUNT_MENU_ITEMS.map((item) => new URL(item.href, 'https://citeladder.local').pathname),
  '/pricing',
];

/**
 * The current page lives behind the account button (Settings, Billing,
 * Pricing), so the button carries the location mark; a settings tab that has
 * its own sidebar row (Integrations) marks that row instead.
 */
export function isAccountCurrent(pathname: string, searchParams: URLSearchParams): boolean {
  if (SIDEBAR_ITEMS.some((item) => isNavItemActive(pathname, searchParams, item))) return false;
  return ACCOUNT_PATHS.some((base) => atOrBelow(pathname, base));
}

/**
 * A destination is current when the path is it or below it, unless another
 * destination sits deeper on that path: Shopping (`/products/overview`) is
 * not also Products, and Skills (`/agent/skills`) is not also New chat. New
 * chat is current on its own page only: a chat (`/agent/chats/…`) is marked
 * in the chat list instead. A destination that names query parameters (a
 * settings tab) also needs each of them to match, so Integrations is not
 * current on another settings tab. Every tab of Website is still Website.
 */
export function isNavItemActive(
  pathname: string,
  searchParams: URLSearchParams,
  item: Pick<NavItem, 'href'>,
): boolean {
  const target = new URL(item.href, 'https://citeladder.local');
  if (target.pathname === MODE_HOMES.agent) return pathname === MODE_HOMES.agent;
  if (!atOrBelow(pathname, target.pathname)) return false;
  const deeper = SIDEBAR_PATHS.some(
    (path) => path.length > target.pathname.length && atOrBelow(pathname, path),
  );
  if (deeper) return false;
  return [...target.searchParams].every(([key, value]) => searchParams.get(key) === value);
}
