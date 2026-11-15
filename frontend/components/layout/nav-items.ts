import type { LucideIcon } from 'lucide-react';

import { ICONS } from '@/lib/icons';
import {
  navDestinations,
  type NavDestination,
  type SidebarGroup,
} from '@/lib/navigation/app-routes';

/** A manifest nav entry with its glyph resolved, ready to render as a link. */
export type NavItem = Omit<NavDestination, 'icon'> & { icon: LucideIcon };

type NavGroup = Readonly<{
  group: SidebarGroup;
  /** The sidebar's `overline` head; null draws the group without one. */
  title: 'Analyze' | 'Commerce' | 'Act' | 'Track' | null;
  /** The command palette's head for the same group. */
  paletteTitle: string;
  items: readonly NavItem[];
}>;

function navItems(placement: Parameters<typeof navDestinations>[0]): readonly NavItem[] {
  return navDestinations(placement).map((entry) => ({ ...entry, icon: ICONS[entry.icon] }));
}

function group(
  id: SidebarGroup,
  title: NavGroup['title'],
  paletteTitle: string = title ?? '',
): NavGroup {
  return { group: id, title, paletteTitle, items: navItems(`sidebar:${id}`) };
}

/** The sidebar's destinations in the order of the product loop (brand direction 4). */
export const NAV_GROUPS: readonly NavGroup[] = [
  group('overview', null, 'Overview'),
  group('analyze', 'Analyze'),
  group('commerce', 'Commerce'),
  group('act', 'Act'),
  group('track', 'Track'),
];

/** The foot's destinations, above the account button. */
export const FOOT_NAV_ITEMS = navItems('sidebar:foot');

/** The account menu's workspace and account links. */
export const ACCOUNT_MENU_ITEMS = navItems('account');

/** Every destination a sidebar row stands for, for telling a nested one from its parent. */
const SIDEBAR_PATHS = [...NAV_GROUPS.flatMap((entry) => entry.items), ...FOOT_NAV_ITEMS].map(
  (item) => new URL(item.href, 'https://citeladder.local').pathname,
);

/**
 * Every shell destination, grouped for the command palette: the sidebar's
 * groups in the same order with the same labels, then the workspace and
 * account pages. A managed plan has no provider settings (B32).
 */
export function resolveCommandGroups({ managed = false }: { managed?: boolean } = {}): readonly {
  title: string;
  items: readonly NavItem[];
}[] {
  const workspace = [...FOOT_NAV_ITEMS, ...ACCOUNT_MENU_ITEMS, ...navItems('palette')].filter(
    (item) => !managed || !item.hiddenWhenManaged,
  );
  return [
    ...NAV_GROUPS.map(({ paletteTitle, items }) => ({ title: paletteTitle, items })),
    { title: 'Workspace', items: workspace },
  ];
}

const atOrBelow = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/**
 * A destination is current when the path is it or below it, unless another
 * destination sits deeper on that path: Shopping (`/products/overview`) is
 * not also Products, and Actions (`/agent/actions`) is not also Agent. A
 * destination that names query parameters (a settings tab) also needs each of
 * them to match, so Integrations is not current on another settings tab.
 * Screens own their own tabs: every tab of Website is still Website.
 */
export function isNavItemActive(
  pathname: string,
  searchParams: URLSearchParams,
  item: Pick<NavItem, 'href'>,
): boolean {
  const target = new URL(item.href, 'https://citeladder.local');
  if (!atOrBelow(pathname, target.pathname)) return false;
  const deeper = SIDEBAR_PATHS.some(
    (path) => path.length > target.pathname.length && atOrBelow(pathname, path),
  );
  if (deeper) return false;
  return [...target.searchParams].every(([key, value]) => searchParams.get(key) === value);
}
