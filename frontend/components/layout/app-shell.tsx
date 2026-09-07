'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { CommandPalette } from '@/components/ui/command-palette';
import { LogoMark } from '@/components/ui/logo-mark';
import { TooltipProvider } from '@/components/ui/tooltip';

import { AgentSheet } from './agent-sheet';
import { PageHeader } from './page-header';
import { ProjectSwitcher } from './project-switcher';
import { MobilePrimaryNavigation, MobileStationNavigation, SidebarNav } from './sidebar-nav';
import { UserMenu } from './user-menu';

/**
 * AppShell — the authenticated application chrome.
 *
 * Geometry: one ground, two papers. The sidebar, the top bar and the gutter
 * around the content are regions of a single grained sheet — none of them
 * paints itself and none of them draws a rule — and the content sits on white
 * paper inset in that sheet. The tonal step between the two planes plus the
 * pane's radius is the separation; the hairlines that used to do that job made
 * the chrome read as three boxes bolted together.
 *
 * The pane owns the scroll, so its top edge stays where it is while the
 * workspace moves. It meets the sidebar on the left and the viewport on the
 * right and bottom — the work gets the room, and the top edge alone carries the
 * seam between the two planes.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipProvider>
      <div className="bg-shell band-grain grain-soft relative flex h-dvh overflow-hidden">
        <aside className="relative z-1 hidden w-[var(--sidebar-width)] shrink-0 flex-col transition-[width] md:flex">
          {/* Logo row — matches topbar height */}
          <div className="flex h-[var(--topbar-height)] shrink-0 items-center px-[var(--sidebar-pad-x)]">
            <Link
              href="/projects"
              className="focus-ring flex items-center rounded-xs px-2.5 transition-opacity hover:opacity-90"
              aria-label="CiteLadder command center"
            >
              <LogoMark variant="sidebar" priority />
            </Link>
          </div>

          <div className="px-[var(--sidebar-pad-x)] py-[var(--sidebar-pad-y)]">
            <ProjectSwitcher />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-[var(--sidebar-pad-x)] py-[var(--sidebar-pad-y)]">
            <SidebarNav />
          </div>

          <div className="shrink-0 p-[var(--sidebar-pad-x)]">
            <UserMenu />
          </div>
        </aside>

        <div className="relative z-1 flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 grid h-[var(--topbar-height)] shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-[var(--content-gutter)] sm:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)_minmax(0,1fr)]">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href="/projects"
                className="flex shrink-0 items-center gap-2 md:hidden"
                aria-label="CiteLadder command center"
              >
                <LogoMark variant="compact" priority />
              </Link>
              <PageHeader className="min-w-0 flex-1 [&_h1]:truncate" />
            </div>
            <div className="w-auto justify-self-center sm:w-full">
              <CommandPalette />
            </div>
            <div className="flex items-center justify-end gap-2.5 justify-self-end">
              <AgentSheet />
              <UserMenu compact className="md:hidden" />
            </div>
          </header>

          <main
            id="main"
            className="app-pane app-pane-workspace safe-bottom min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0"
          >
            <MobileStationNavigation />
            <div className="mx-auto grid w-full max-w-[var(--content-max-width)] grid-cols-[minmax(0,1fr)] gap-0 p-[var(--content-gutter)]">
              <div>{children}</div>
            </div>
          </main>

          <MobilePrimaryNavigation />
        </div>
      </div>
    </TooltipProvider>
  );
}
