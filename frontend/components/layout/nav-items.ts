import type { LucideIcon } from 'lucide-react';

import { ICONS } from '@/lib/icons';
import type { NavigationMode } from '@/lib/navigation/mode-memory';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  count?: number;
  queryMatch?: { key: string; values: readonly string[]; defaultValue?: string };
  requiredCapability?: string;
  /** Project is the default; workspace destinations never inherit a project. */
  scope?: 'project' | 'workspace';
};

export type NavGroup = {
  title: 'Overview' | 'Analyze' | 'Track';
  href: string;
  icon: LucideIcon;
  items: readonly NavItem[];
};

export const NAV_GROUPS = [
  {
    title: 'Overview',
    href: '/projects',
    icon: ICONS.overview,
    items: [{ label: 'Overview', href: '/projects', icon: ICONS.overview }],
  },
  {
    title: 'Analyze',
    href: '/site?tab=pages',
    icon: ICONS.site,
    items: [
      {
        label: 'Website',
        href: '/site?tab=pages',
        icon: ICONS.site,
        queryMatch: { key: 'tab', values: ['pages'], defaultValue: 'pages' },
      },
      { label: 'Search Demand', href: '/demand', icon: ICONS.demand },
      { label: 'Issues', href: '/issues', icon: ICONS.issues },
      { label: 'Search Intelligence', href: '/search-intelligence', icon: ICONS.analytics },
      { label: 'Performance', href: '/performance', icon: ICONS.performance },
      { label: 'Commerce Suite', href: '/products', icon: ICONS.products },
    ],
  },
  {
    title: 'Track',
    href: '/visibility?tab=trends',
    icon: ICONS.visibility,
    items: [
      { label: 'Prompts', href: '/prompts', icon: ICONS.prompts },
      {
        label: 'AI Visibility',
        href: '/visibility?tab=trends',
        icon: ICONS.visibility,
        queryMatch: { key: 'tab', values: ['trends'], defaultValue: 'trends' },
      },
      { label: 'Runs', href: '/runs', icon: ICONS.runs },
      { label: 'AI Referrals', href: '/ai-referrals', icon: ICONS.analytics },
    ],
  },
] as const satisfies readonly NavGroup[];

export const AGENT_HOME = '/agent';

/** Agent mode's fixed destinations, below New chat and above the chat list. */
export const AGENT_NAV_ITEMS = [
  { label: 'Actions', href: '/agent/actions', icon: ICONS.opportunities },
  { label: 'Skills', href: '/agent/skills', icon: ICONS.skills },
  { label: 'Context', href: '/agent/context', icon: ICONS.context },
] as const satisfies readonly NavItem[];

export function navigationMode(pathname: string): NavigationMode {
  return pathname === AGENT_HOME || pathname.startsWith(`${AGENT_HOME}/`) ? 'agent' : 'dashboard';
}

const SUPPORT_NAV_ITEMS = [
  {
    label: 'Integrations',
    href: '/settings?tab=integrations',
    icon: ICONS.setup,
    scope: 'workspace',
  },
  {
    label: 'Providers',
    href: '/settings?tab=providers',
    icon: ICONS.settings,
    scope: 'workspace',
  },
  { label: 'Billing', href: '/billing', icon: ICONS.billing, scope: 'workspace' },
  { label: 'Settings', href: '/settings', icon: ICONS.settings, scope: 'workspace' },
] as const satisfies readonly NavItem[];

export type CapabilityResolver = (capability: string) => boolean;

export function resolveNavigationItems(
  items: readonly NavItem[],
  hasCapability: CapabilityResolver,
): readonly NavItem[] {
  return items.filter((item) => !item.requiredCapability || hasCapability(item.requiredCapability));
}

/**
 * The visible sidebar, compact navigation, and command palette all resolve
 * destinations through this one capability gate.  The registry remains static
 * so active-state and route-prefetch helpers keep their stable route data.
 */
export function resolveNavigationGroups(hasCapability: CapabilityResolver): readonly NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: resolveNavigationItems(group.items, hasCapability),
  }));
}

export function resolveCommandGroups(hasCapability: CapabilityResolver) {
  return [
    ...resolveNavigationGroups(hasCapability),
    {
      title: 'Agent',
      items: [
        { label: 'New chat', href: AGENT_HOME, icon: ICONS.newChat },
        ...AGENT_NAV_ITEMS,
      ] satisfies readonly NavItem[] as readonly NavItem[],
    },
    { title: 'Settings', items: SUPPORT_NAV_ITEMS },
  ] as const;
}

export function isNavItemActive(
  pathname: string,
  searchParams: URLSearchParams,
  item: NavItem,
): boolean {
  const target = new URL(item.href, 'https://citeladder.local');
  const pathMatches = pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
  if (!pathMatches) return false;
  if (!item.queryMatch) return true;
  const current = searchParams.get(item.queryMatch.key) ?? item.queryMatch.defaultValue ?? '';
  return item.queryMatch.values.includes(current);
}
