import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { AgentPanelHost, AgentPanelTrigger } from '@/components/agent/agent-panel-host';
import { AppShellFrame, NavDrawer } from '@/components/ui/app-shell';
import {
  CommandPaletteHost,
  CommandPaletteTrigger,
} from '@/components/ui/command-palette-launcher';
import { SidebarCollapseToggle, SidebarFrame } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AgentPanelProvider } from '@/lib/agent/panel-context';
import { resolveTitle } from '@/lib/navigation/app-routes';
import { useProjectContext } from '@/lib/project/project-context';
import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar-width';

import { resolveCommandGroups } from './nav-items';
import { PageTitleContext } from './page-title-context';
import { ProjectSwitcher } from './project-switcher';
import { ShellContext } from './shell-context';
import { SidebarFootNav, SidebarNav, useDestinationMemory } from './sidebar-nav';
import { UserMenuTrigger } from './user-menu';
import { useRouteAnnouncement } from './use-route-announcement';

/**
 * AppShell — the signed-in application chrome: one
 * sidebar (the project switcher, the destinations in the order of the
 * product loop, Integrations and the account at its foot) beside the page.
 * Below 900px the masthead's menu button opens the same sidebar in a left
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

const COLLAPSE_SHORTCUT = 'Ctrl \\';

function AppSidebar({ inDrawer = false }: Readonly<{ inDrawer?: boolean }>) {
  const collapsed = useSidebarCollapsed();
  return (
    <SidebarFrame
      ident={<ProjectSwitcher />}
      nav={<SidebarNav />}
      foot={
        <>
          <SidebarFootNav />
          <div className="labelled:flex-row flex flex-col items-center gap-1">
            <div className="min-w-0 flex-1 self-stretch">
              <UserMenuTrigger presenter={inDrawer ? 'drawer' : 'sidebar'} />
            </div>
            <SidebarCollapseToggle
              collapsed={collapsed}
              onToggle={() => setSidebarCollapsed(!collapsed)}
              shortcut={COLLAPSE_SHORTCUT}
            />
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
