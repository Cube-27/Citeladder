import type { LucideIcon } from 'lucide-react';

import { CONTENT_CREATION_CAPABILITY } from '@/lib/config/billing';
import { ICONS } from '@/lib/icons';

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
  title: 'Overview' | 'Analyze' | 'Act' | 'Track';
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
      { label: 'Issues', href: '/issues', icon: ICONS.issues },
      { label: 'Search Demand', href: '/demand', icon: ICONS.demand },
      { label: 'Performance', href: '/performance', icon: ICONS.performance },
      { label: 'Commerce Suite', href: '/products', icon: ICONS.products },
    ],
  },
  {
    title: 'Act',
    href: '/opportunities',
    icon: ICONS.opportunities,
    items: [
      { label: 'Opportunities', href: '/opportunities', icon: ICONS.opportunities },
      {
        label: 'Content',
        href: '/content',
        icon: ICONS.content,
        requiredCapability: CONTENT_CREATION_CAPABILITY,
      },
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
