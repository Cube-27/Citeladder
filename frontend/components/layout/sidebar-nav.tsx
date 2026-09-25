'use client';

import { useLocation, useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';
import { useRouteIntent } from '@/lib/navigation/use-route-intent';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { useEntitlement } from '@/lib/billing/entitlement-context';

import { ModeSwitch } from './mode-switch';
import { NavLink } from './nav-link';
import {
  isNavItemActive,
  navigationMode,
  resolveNavigationGroups,
  resolveNavigationItems,
  type NavGroup,
} from './nav-items';

// Agent mode reads chats and Actions; its API modules stay out of the chunk
// the shell needs before it can paint.
const AgentNav = lazy(() => import('./agent-nav').then(({ AgentNav }) => ({ default: AgentNav })));

function StationLinks({
  group,
  onNavigate,
}: Readonly<{ group: NavGroup; onNavigate?: () => void }>) {
  const pathname = useLocation().pathname ?? '';
  const searchParams = useSearchParams()[0];
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const onIntent = useRouteIntent();
  const { hasCapability } = useEntitlement();
  const items = resolveNavigationItems(group.items, hasCapability);
  return (
    <ul className="flex flex-col gap-[var(--sidebar-item-gap)]">
      {items.map((item) => {
        const href = scopedNavigationDestination(
          item.href,
          item.scope ?? 'project',
          activeProjectId,
          activeWorkspaceId,
        );
        return (
          <li key={item.href}>
            <NavLink
              item={{ ...item, href }}
              active={isNavItemActive(pathname, searchParams, item)}
              onIntent={onIntent}
              onNavigate={onNavigate}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function SidebarNav({
  className,
  onNavigate,
}: Readonly<{ className?: string; onNavigate?: () => void }>) {
  const pathname = useLocation().pathname ?? '';
  const agentMode = navigationMode(pathname) === 'agent';
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ModeSwitch onNavigate={onNavigate} />
      {agentMode ? (
        <Suspense fallback={null}>
          <AgentNav onNavigate={onNavigate} />
        </Suspense>
      ) : (
        <DashboardNav onNavigate={onNavigate} />
      )}
    </div>
  );
}

function DashboardNav({ onNavigate }: Readonly<{ onNavigate?: () => void }>) {
  const { hasCapability } = useEntitlement();
  const groups = resolveNavigationGroups(hasCapability);
  return (
    <nav aria-label="Primary" className="flex flex-col gap-[var(--sidebar-group-gap)]">
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
