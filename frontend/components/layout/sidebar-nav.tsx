import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { SidebarNavGroup, SidebarNavList } from '@/components/ui/sidebar';
import {
  rememberDestinationRoute,
  rememberedDestinationRoute,
} from '@/lib/navigation/destination-memory';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { useRouteIntent } from '@/lib/navigation/use-route-intent';
import { useProjectContext } from '@/lib/project/project-context';

import { NavLink } from './nav-link';
import { FOOT_NAV_ITEMS, isNavItemActive, NAV_GROUPS, type NavItem } from './nav-items';

const EVERY_ITEM = [...NAV_GROUPS.flatMap((group) => group.items), ...FOOT_NAV_ITEMS];

/**
 * Remembers the screen in use under the current destination, so its row can
 * return there later (owner, 2026-11-15). The shell mounts it once.
 */
export function useDestinationMemory() {
  const { pathname = '', search = '' } = useLocation();
  const searchParams = useSearchParams()[0];
  const { activeProjectId } = useProjectContext();
  useEffect(() => {
    if (!activeProjectId) return;
    const current = EVERY_ITEM.find((item) => isNavItemActive(pathname, searchParams, item));
    // A screen's own `project` and `workspace` scope is added back when the link is built.
    const params = new URLSearchParams(search);
    params.delete('project');
    params.delete('workspace');
    const query = params.toString();
    if (current)
      rememberDestinationRoute(
        current.href,
        activeProjectId,
        query ? `${pathname}?${query}` : pathname,
      );
  }, [activeProjectId, pathname, search, searchParams]);
}

/**
 * One group's rows, scoped to the active project or workspace. A row that is
 * not current returns to the last screen used under it for this project (the
 * Agent row reopens the last chat); the current row goes to the destination's
 * front door.
 */
function DestinationRows({ items }: Readonly<{ items: readonly NavItem[] }>) {
  const pathname = useLocation().pathname ?? '';
  const searchParams = useSearchParams()[0];
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const onIntent = useRouteIntent();
  return items.map((item) => {
    const active = isNavItemActive(pathname, searchParams, item);
    const target =
      (!active && item.scope === 'project'
        ? rememberedDestinationRoute(item.href, activeProjectId)
        : null) ?? item.href;
    return (
      <li key={item.href}>
        <NavLink
          item={{
            ...item,
            href: scopedNavigationDestination(
              target,
              item.scope,
              activeProjectId,
              activeWorkspaceId,
            ),
          }}
          active={active}
          onIntent={onIntent}
        />
      </li>
    );
  });
}

/** The sidebar's one list of destinations, in the order of the product loop. */
export function SidebarNav() {
  return (
    <SidebarNavList label="Primary">
      {NAV_GROUPS.map((group) => (
        <SidebarNavGroup key={group.group} title={group.title}>
          <DestinationRows items={group.items} />
        </SidebarNavGroup>
      ))}
    </SidebarNavList>
  );
}

/** The foot's destinations (Integrations), above the account button. */
export function SidebarFootNav() {
  return (
    <nav aria-label="Workspace">
      <ul className="flex flex-col">
        <DestinationRows items={FOOT_NAV_ITEMS} />
      </ul>
    </nav>
  );
}
