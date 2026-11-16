import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { AgentNav, AgentRail } from '@/components/agent/agent-nav';
import { AgentPanelHost, AgentPanelTrigger } from '@/components/agent/agent-panel-host';
import { AppShellFrame, NavDrawer } from '@/components/ui/app-shell';
import {
  CommandPaletteHost,
  CommandPaletteTrigger,
} from '@/components/ui/command-palette-launcher';
import { SidebarCollapseToggle, SidebarFrame, SidebarRailList } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AgentPanelProvider } from '@/lib/agent/panel-context';
import { navigationMode, resolveTitle } from '@/lib/navigation/app-routes';
import { useProjectContext } from '@/lib/project/project-context';
import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar-width';

import { ModeSwitch, useModeMemory } from './mode-switch';
import { resolveCommandGroups } from './nav-items';
import { PageTitleContext } from './page-title-context';
import { ProjectSwitcher } from './project-switcher';
import { ShellContext } from './shell-context';
import { DashboardNav, DashboardRail, SidebarFootNav, useDestinationMemory } from './sidebar-nav';
import { UserMenuTrigger } from './user-menu';
import { useRouteAnnouncement } from './use-route-announcement';

/**
 * AppShell — the signed-in application chrome: the sidebar (the project
 * switcher, the Dashboard | Agent switch, the mode's list, Integrations and
 * the account at its foot) beside the page. Below 900px the masthead's menu button opens the same sidebar in a left
 * drawer that closes when the route changes. The masthead's search, "Ask
 * agent" and menu button come from here through `ShellContext`.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const [titleOverride, setTitleOverride] = useState<string>();
  const location = useLocation();
  const pathname = location.pathname ?? '/projects';
  const { activeProject } = useProjectContext();
  useRouteAnnouncement({
    title: titleOverride ?? resolveTitle(pathname),
    projectName: activeProject?.name ?? null,
  });
  useDestinationMemory();
  useModeMemory();
  useCollapseShortcut();
  // The drawer is open for the location it was opened on, so any navigation
  // (a destination, the project switcher) closes it.
  const [drawerLocation, setDrawerLocation] = useState<string | null>(null);
  const drawerOpen = drawerLocation === location.key;
  const shell = useMemo(
    () => ({
      navDrawer: { open: drawerOpen, onOpen: () => setDrawerLocation(location.key) },
      searchTrigger: <CommandPaletteTrigger />,
      agentTrigger: <AgentPanelTrigger />,
      sidebarToggle: <SidebarCollapseToggle />,
    }),
    [drawerOpen, location.key],
  );

  return (
    <PageTitleContext.Provider value={setTitleOverride}>
      <ShellContext.Provider value={shell}>
        <AgentPanelProvider>
          <TooltipProvider>
            <AppShellFrame sidebar={<AppSidebar />}>{children}</AppShellFrame>
            <NavDrawer
              open={drawerOpen}
              onOpenChange={(open) => setDrawerLocation(open ? location.key : null)}
            >
              <AppSidebar inDrawer />
            </NavDrawer>
            <CommandPaletteHost destinations={resolveCommandGroups} />
            <AgentPanelHost />
          </TooltipProvider>
        </AgentPanelProvider>
      </ShellContext.Provider>
    </PageTitleContext.Provider>
  );
}

/**
 * The sidebar: the project switcher, the Dashboard | Agent switch, the
 * mode's list (the route decides the mode), then Integrations and the
 * account (the collapse toggle is in the masthead). Collapsed (never in the drawer) it is the 56px
 * rail: one button per group, flyouts for the groups, and nothing scrolls.
 */
function AppSidebar({ inDrawer = false }: Readonly<{ inDrawer?: boolean }>) {
  const collapsed = useSidebarCollapsed();
  const rail = collapsed && !inDrawer;
  const mode = navigationMode(useLocation().pathname ?? '');
  let nav = mode === 'agent' ? <AgentNav /> : <DashboardNav />;
  if (rail)
    nav = (
      <SidebarRailList label={mode === 'agent' ? 'Agent' : 'Dashboard'}>
        {mode === 'agent' ? <AgentRail /> : <DashboardRail />}
      </SidebarRailList>
    );
  return (
    <SidebarFrame
      ident={<ProjectSwitcher />}
      mode={<ModeSwitch rail={rail} />}
      nav={nav}
      foot={
        <>
          <SidebarFootNav rail={rail} />
          <div className="labelled:items-stretch flex min-w-0 flex-col items-center">
            <UserMenuTrigger presenter={inDrawer ? 'drawer' : 'sidebar'} />
          </div>
        </>
      }
    />
  );
}

/** ⌘ or Ctrl with backslash collapses the sidebar to its rail, or opens it again. */
function useCollapseShortcut() {
  const collapsed = useSidebarCollapsed();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== '\\') return;
      event.preventDefault();
      setSidebarCollapsed(!collapsed);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapsed]);
}
