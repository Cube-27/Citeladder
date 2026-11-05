'use client';

import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { AgentPanelHost } from '@/components/agent/agent-panel-host';
import { AppShellFrame, SIDEBAR_LOGO_CLASSES, SidebarFrame } from '@/components/ui/app-shell';
import { CommandPalette, CommandPaletteTrigger } from '@/components/ui/command-palette';
import { LogoMark } from '@/components/ui/logo-mark';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AgentPanelProvider } from '@/lib/agent/panel-context';
import { projectDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

import { ModeSwitch } from './mode-switch';
import { PageTitleContext } from './page-title-context';
import { resolveTitle } from './page-titles';
import { ProjectSwitcher } from './project-switcher';
import { SidebarNav } from './sidebar-nav';
import { UserMenuTrigger } from './user-menu';
import { useRouteAnnouncement } from './use-route-announcement';

/**
 * AppShell — the authenticated application chrome: the system's AppSidebar
 * (logo, project switcher, Dashboard | Agent, destinations, account) beside
 * the page on `paper`. Below 1280px the sidebar is the 61px icon rail
 * (decision D3); there is no top bar.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const [titleOverride, setTitleOverride] = useState<string>();
  const pathname = useLocation().pathname ?? '/projects';
  const { activeProject } = useProjectContext();
  useRouteAnnouncement({
    title: titleOverride ?? resolveTitle(pathname),
    projectName: activeProject?.name ?? null,
  });

  return (
    <PageTitleContext.Provider value={setTitleOverride}>
      <AgentPanelProvider>
        <TooltipProvider>
          <AppShellFrame sidebar={<AppSidebar />}>{children}</AppShellFrame>
          <CommandPalette />
          <AgentPanelHost />
        </TooltipProvider>
      </AgentPanelProvider>
    </PageTitleContext.Provider>
  );
}

function AppSidebar() {
  const { activeProjectId } = useProjectContext();
  const overviewHref = activeProjectId
    ? projectDestination('/projects', null, activeProjectId)
    : '/projects';
  return (
    <SidebarFrame
      top={
        <>
          <Link to={overviewHref} className={SIDEBAR_LOGO_CLASSES} aria-label="CiteLadder home">
            <LogoMark variant="sidebar" className="shell:inline-flex hidden" />
            <LogoMark variant="sidebar" wordmark={false} className="shell:hidden" />
          </Link>
          <ProjectSwitcher />
          <ModeSwitch />
          {/* ⌘K opens the palette at every width; the field shows beside labels only. */}
          <CommandPaletteTrigger className="shell:flex hidden" />
        </>
      }
      nav={<SidebarNav />}
      foot={<UserMenuTrigger presenter="sidebar" />}
    />
  );
}
