import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { AgentPanelHost, AgentPanelTrigger } from '@/components/agent/agent-panel-host';
import { AppShellFrame, NavDrawer } from '@/components/ui/app-shell';
import {
  CommandPaletteHost,
  CommandPaletteTrigger,
} from '@/components/ui/command-palette-launcher';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AgentPanelProvider } from '@/lib/agent/panel-context';
import { resolveTitle } from '@/lib/navigation/app-routes';
import { useProjectContext } from '@/lib/project/project-context';
import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar-width';

import { AppSidebar } from './app-sidebar';
import { resolveCommandGroups } from './nav-items';
import { PageTitleContext } from './page-title-context';
import { ShellContext } from './shell-context';
import { useRouteAnnouncement } from './use-route-announcement';

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const [titleOverride, setTitleOverride] = useState<string>();
  const location = useLocation();
  const pathname = location.pathname ?? '/projects';
  const { activeProject } = useProjectContext();
  useRouteAnnouncement({
    title: titleOverride ?? resolveTitle(pathname),
    projectName: activeProject?.name ?? null,
  });
  useCollapseShortcut();
  const [drawerLocation, setDrawerLocation] = useState<string | null>(null);
  const drawerOpen = drawerLocation === location.key;
  const shell = useMemo(
    () => ({
      navDrawer: { open: drawerOpen, onOpen: () => setDrawerLocation(location.key) },
      searchTrigger: <CommandPaletteTrigger />,
      agentTrigger: <AgentPanelTrigger />,
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
