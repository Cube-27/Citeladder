import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelsTopLeft, type LucideIcon } from 'lucide-react';

import {
  SidebarRowTooltip,
  sidebarModeSegmentClasses,
  sidebarModeTrackClasses,
} from '@/components/ui/sidebar';
import { ICONS } from '@/lib/icons';
import { MODE_HOMES, navigationMode, type NavigationMode } from '@/lib/navigation/app-routes';
import {
  rememberDestinationRoute,
  rememberedDestinationRoute,
  routeToRemember,
} from '@/lib/navigation/destination-memory';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

/** The two segments; Dashboard's glyph is its own, not Overview's. */
export const MODES: readonly { mode: NavigationMode; label: string; icon: LucideIcon }[] = [
  { mode: 'dashboard', label: 'Dashboard', icon: PanelsTopLeft },
  { mode: 'agent', label: 'Agent', icon: ICONS.agent },
];

/** The mode's slot in the per-project route memory the sidebar rows also use. */
const modeSlot = (mode: NavigationMode) => `mode:${mode}`;

/**
 * Remembers the route in use in the current mode, so its segment can return
 * there. The shell mounts it once.
 */
export function useModeMemory() {
  const { pathname = '', search = '' } = useLocation();
  const { activeProjectId } = useProjectContext();
  useEffect(() => {
    if (!activeProjectId) return;
    rememberDestinationRoute(
      modeSlot(navigationMode(pathname)),
      activeProjectId,
      routeToRemember(pathname, search),
    );
  }, [activeProjectId, pathname, search]);
}

/**
 * Dashboard | Agent. The mode comes from the route, so deep links and Back
 * stay right; each segment returns to the last route used in that mode for
 * this project, or to the mode's home.
 */
export function ModeSwitch({ rail }: Readonly<{ rail: boolean }>) {
  const pathname = useLocation().pathname ?? '';
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const current = navigationMode(pathname);
  return (
    <nav aria-label="Mode" data-segmented-track="" className={sidebarModeTrackClasses(rail)}>
      {MODES.map(({ mode, label, icon: Icon }) => {
        const selected = mode === current;
        const target =
          rememberedDestinationRoute(modeSlot(mode), activeProjectId) ?? MODE_HOMES[mode];
        return (
          <SidebarRowTooltip key={mode} label={label}>
            <Link
              to={scopedNavigationDestination(
                target,
                'project',
                activeProjectId,
                activeWorkspaceId,
              )}
              aria-current={selected ? 'true' : undefined}
              className={sidebarModeSegmentClasses(selected, rail)}
            >
              <Icon aria-hidden />
              <span data-sidebar-text="title" className="labelled:not-sr-only sr-only truncate">
                {label}
              </span>
            </Link>
          </SidebarRowTooltip>
        );
      })}
    </nav>
  );
}
