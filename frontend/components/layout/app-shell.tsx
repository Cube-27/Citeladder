'use client';

import { Menu } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { CommandPalette, CommandPaletteTrigger } from '@/components/ui/command-palette';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { LogoMark } from '@/components/ui/logo-mark';
import { TooltipProvider } from '@/components/ui/tooltip';

import { AgentSheet, AgentSheetTrigger } from './agent-sheet';
import { ProjectSwitcher } from './project-switcher';
import { SidebarNav } from './sidebar-nav';
import { UserMenuController, UserMenuTrigger } from './user-menu';
import { resolveTitle } from './page-titles';

/**
 * AppShell — the authenticated application chrome.
 *
 * The desktop sidebar remains available for the viewport while the document
 * scrolls. At compact widths, the same destinations move into the drawer.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingDrawerLaunch = useRef<
    { kind: 'palette'; trigger: HTMLElement } | { kind: 'agent' } | null
  >(null);
  const pathname = usePathname() ?? '/projects';
  const compactTitle = resolveTitle(pathname);

  function openPaletteFromDrawer(trigger: HTMLElement) {
    pendingDrawerLaunch.current = {
      kind: 'palette',
      trigger: navigationTriggerRef.current ?? trigger,
    };
    setNavigationOpen(false);
  }

  function openAgentFromDrawer() {
    pendingDrawerLaunch.current = { kind: 'agent' };
    setNavigationOpen(false);
  }

  function launchAfterNavigationClose() {
    const launch = pendingDrawerLaunch.current;
    pendingDrawerLaunch.current = null;
    if (!launch) return;
    if (launch.kind === 'agent') {
      window.dispatchEvent(new Event('citeladder:open-agent'));
      return;
    }
    window.dispatchEvent(
      new CustomEvent('citeladder:open-command-palette', { detail: { trigger: launch.trigger } }),
    );
  }

  return (
    <UserMenuController>
      <TooltipProvider>
        <div className="bg-shell relative flex min-h-dvh">
          <aside className="sticky top-0 z-1 hidden h-dvh w-[var(--sidebar-width)] shrink-0 flex-col min-[981px]:flex">
            {/* Logo row — matches topbar height */}
            <div className="flex h-[var(--compact-topbar-height)] shrink-0 items-center px-[var(--sidebar-pad-x)]">
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

            <div className="grid min-w-0 gap-2 px-[var(--sidebar-pad-x)] py-[var(--sidebar-pad-y)]">
              <CommandPaletteTrigger className="w-full" />
              <AgentSheetTrigger className="w-full justify-start" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-[var(--sidebar-pad-x)] py-[var(--sidebar-pad-y)]">
              <SidebarNav />
            </div>

            <div className="shrink-0 p-[var(--sidebar-pad-x)]">
              <UserMenuTrigger presenter="sidebar" />
            </div>
          </aside>

          <div className="relative z-1 flex min-w-0 flex-1 flex-col">
            <header className="bg-shell sticky top-0 z-20 grid h-[var(--compact-topbar-height)] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-[var(--content-gutter)] min-[981px]:hidden">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  ref={navigationTriggerRef}
                  aria-label="Open navigation"
                  onClick={() => setNavigationOpen(true)}
                >
                  <Menu className="size-4" aria-hidden />
                </Button>
                <Link
                  href="/projects"
                  className="flex shrink-0 items-center gap-2"
                  aria-label="CiteLadder command center"
                >
                  <LogoMark variant="compact" wordmark={false} priority />
                </Link>
              </div>
              <div className="text-secondary min-w-0 truncate text-sm">{compactTitle}</div>
              <div className="w-auto justify-self-end">
                <CommandPaletteTrigger />
              </div>
              <div className="flex items-center justify-end gap-2.5 justify-self-end">
                <AgentSheetTrigger />
                <UserMenuTrigger presenter="compact" />
              </div>
            </header>

            <main id="main" className="app-pane app-pane-workspace flex-1">
              <div className="mx-auto grid w-full max-w-[var(--content-max-width)] grid-cols-[minmax(0,1fr)] gap-0 px-[var(--content-gutter)] pb-[var(--content-gutter)]">
                <div>{children}</div>
              </div>
            </main>

            <CommandPalette />
            <AgentSheet />
            <Drawer
              open={navigationOpen}
              onOpenChange={setNavigationOpen}
              onAfterClose={launchAfterNavigationClose}
              title="Navigation"
              closeLabel="Close navigation"
              side="left"
              className="w-[min(17rem,100vw)] max-w-none border-l-0"
            >
              <div className="grid gap-4">
                <Link
                  href="/projects"
                  className="focus-ring flex items-center rounded-[var(--radius-control)] px-2 py-1"
                  onClick={() => setNavigationOpen(false)}
                  aria-label="CiteLadder command center"
                >
                  <LogoMark variant="sidebar" priority />
                </Link>
                <ProjectSwitcher />
                <div className="grid gap-2">
                  <CommandPaletteTrigger className="w-full" onOpen={openPaletteFromDrawer} />
                  <AgentSheetTrigger
                    className="w-full justify-start"
                    onOpen={openAgentFromDrawer}
                  />
                </div>
                <SidebarNav onNavigate={() => setNavigationOpen(false)} />
              </div>
            </Drawer>
          </div>
        </div>
      </TooltipProvider>
    </UserMenuController>
  );
}
