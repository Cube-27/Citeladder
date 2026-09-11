'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';
import { prefetchRoute } from '@/lib/navigation/route-prefetch';
import { useProjectContext } from '@/lib/project/project-context';
import { useEntitlement } from '@/lib/billing/entitlement-context';

import {
  isNavItemActive,
  resolveNavigationGroups,
  resolveNavigationItems,
  type NavGroup,
  type NavItem,
} from './nav-items';

function NavLink({
  item,
  active,
  onIntent,
  onNavigate,
}: Readonly<{
  item: NavItem;
  active: boolean;
  onIntent: (href: string) => void;
  onNavigate?: () => void;
}>) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onMouseEnter={() => {
        if (!active) onIntent(item.href);
      }}
      onFocus={() => {
        if (!active) onIntent(item.href);
      }}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-[var(--nav-item-height)] items-center gap-2.5 rounded-[var(--radius-control)] border px-2.5 text-sm transition-colors duration-150',
        // Navigation is a label, not reading copy, so both states sit at the
        // shared label weight rather than body regular — the destinations stay
        // scannable against the group titles above them. The role owns the
        // weight; 600 stays reserved for headings, and the active row is
        // already carried by the accent surface and ink.
        active
          ? textRole('label', 'border-transparent bg-accent-soft text-accent-text')
          : textRole(
              'label',
              'border-transparent text-secondary hover:bg-accent-soft hover:text-accent-text',
            ),
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors duration-150',
          active ? 'text-accent' : 'text-subtle group-hover:text-accent-text',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

function StationLinks({
  group,
  onNavigate,
}: Readonly<{ group: NavGroup; onNavigate?: () => void }>) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const onIntent = useRouteIntent();
  const { hasCapability } = useEntitlement();
  const items = resolveNavigationItems(group.items, hasCapability);
  return (
    <ul className="flex flex-col gap-[var(--sidebar-item-gap)]">
      {items.map((item) => (
        <li key={item.href}>
          <NavLink
            item={item}
            active={isNavItemActive(pathname, searchParams, item)}
            onIntent={onIntent}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  );
}

export function SidebarNav({
  className,
  onNavigate,
}: Readonly<{ className?: string; onNavigate?: () => void }>) {
  const { hasCapability } = useEntitlement();
  const groups = resolveNavigationGroups(hasCapability);
  return (
    <nav
      aria-label="Primary"
      className={cn('flex flex-col gap-[var(--sidebar-group-gap)]', className)}
    >
      {groups.map((group) => {
        const showHeading = group.title !== 'Overview';
        return (
          <div key={group.title} className="flex flex-col gap-0">
            {showHeading ? (
              <p className={cn(eyebrowClasses, 'text-secondary px-2.5 pt-3.5 pb-1')}>
                {group.title}
              </p>
            ) : null}
            <StationLinks group={group} onNavigate={onNavigate} />
          </div>
        );
      })}
    </nav>
  );
}

function useRouteIntent() {
  const queryClient = useQueryClient();
  const { activeProject } = useProjectContext();
  return useCallback(
    (href: string) => prefetchRoute(queryClient, href, activeProject?.id ?? null),
    [activeProject?.id, queryClient],
  );
}
