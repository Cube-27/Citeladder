import { Link, useLocation } from 'react-router-dom';

import { SidebarModeSegment, SidebarModeTrack, SidebarRowTooltip } from '@/components/ui/sidebar';
import { ICONS, PanelsTopLeft, type IconGlyph } from '@/lib/icons';
import { MODE_HOMES, navigationMode, type NavigationMode } from '@/lib/navigation/app-routes';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

export const MODES: readonly { mode: NavigationMode; label: string; icon: IconGlyph }[] = [
  { mode: 'dashboard', label: 'Dashboard', icon: PanelsTopLeft },
  { mode: 'agent', label: 'Agent', icon: ICONS.agent },
];

export function ModeSwitch({ rail }: Readonly<{ rail: boolean }>) {
  const pathname = useLocation().pathname ?? '';
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const current = navigationMode(pathname);
  return (
    <SidebarModeTrack as="nav" rail={rail} aria-label="Mode" data-segmented-track="">
      {MODES.map(({ mode, label, icon: Icon }) => {
        const selected = mode === current;
        return (
          <SidebarRowTooltip key={mode} label={label}>
            <SidebarModeSegment asChild current={selected} rail={rail}>
              <Link
                to={scopedNavigationDestination(
                  MODE_HOMES[mode],
                  'project',
                  activeProjectId,
                  activeWorkspaceId,
                )}
                aria-current={selected ? 'true' : undefined}
              >
                {rail ? <Icon aria-hidden /> : null}
                <span data-sidebar-text="title" className={rail ? 'sr-only' : 'min-w-0 truncate'}>
                  {label}
                </span>
              </Link>
            </SidebarModeSegment>
          </SidebarRowTooltip>
        );
      })}
    </SidebarModeTrack>
  );
}
