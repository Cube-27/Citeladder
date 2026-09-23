'use client';

import { Menu } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { CommandPalette, CommandPaletteTrigger } from '@/components/ui/command-palette';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { LogoMark } from '@/components/ui/logo-mark';
import { TooltipProvider } from '@/components/ui/tooltip';

import { AgentSheet, AgentSheetTrigger } from './agent-sheet';
import { CompactPageTitleContext } from './compact-page-title-context';
import { ProjectSwitcher } from './project-switcher';
import { SidebarNav } from './sidebar-nav';
import { UserMenuTrigger } from './user-menu';
import { resolveTitle } from './page-titles';
import { projectDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { OPEN_AGENT_EVENT, OPEN_COMMAND_PALETTE_EVENT } from '@/lib/navigation/shell-events';

/**
 * AppShell — the authenticated application chrome.
 *
 * The desktop sidebar remains available for the viewport while the document
 * scrolls. At compact widths, the same destinations move into the drawer.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [compactTitleOverride, setCompactTitleOverride] = useState<string>();
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingDrawerLaunch = useRef<
    { kind: 'palette'; trigger: HTMLElement } | { kind: 'agent' } | null
  >(null);
  const pathname = useLocation().pathname ?? '/projects';
  const { activeProjectId } = useProjectContext();
  const overviewHref = activeProjectId
    ? projectDestination('/projects', null, activeProjectId)
    : '/projects';
  const compactTitle = compactTitleOverride ?? resolveTitle(pathname);

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
      window.dispatchEvent(new Event(OPEN_AGENT_EVENT));
      return;
    }
    window.dispatchEvent(
      new CustomEvent(OPEN_COMMAND_PALETTE_EVENT, {
        detail: { trigger: launch.trigger },
      }),
    );
  }

  return (
    <CompactPageTitleContext.Provider value={setCompactTitleOverride}>
      <TooltipProvider>
        <div data-app-surface className="bg-shell relative flex min-h-dvh">
          <aside className="sticky top-0 z-1 hidden h-dvh w-[var(--sidebar-width)] shrink-0 flex-col min-[981px]:flex">
            {/* The project selector is the sidebar's first row, at the same
                  height as the header beside it. The rail reads project →
                  tools → destinations → brand: the switcher is the thing a
                  reader changes most, and it sat below a logo that never
                  changes. Identity moves to the foot of the rail, where the
                  account row used to be — the account now lives in the header,
                  so nothing is displaced. */}
            <div className="flex h-[var(--compact-topbar-height)] shrink-0 items-center px-[var(--sidebar-pad-x)]">
              <ProjectSwitcher />
            </div>

            {/* No offset below the switcher. The pane's second row is the band
                  that closes the identity band, which starts the moment the
                  56px switcher row ends — so anything added here would push the
                  search below the row it is meant to line up with. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-[var(--sidebar-pad-x)] pb-[var(--sidebar-pad-y)]">
              {/* Band-height rows, so the sidebar's second row and the pane's
                    second row are the same band at the same offset. */}
              <CommandPaletteTrigger className="h-[var(--tab-height)] w-full" />
              <AgentSheetTrigger className="h-[var(--tab-height)] w-full justify-start" />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <SidebarNav />
              </div>
            </div>

            <div className="border-border flex shrink-0 items-center justify-between gap-2 border-t p-[var(--sidebar-pad-x)]">
              <Link
                to={overviewHref}
                className="focus-ring flex items-center rounded-xs px-2.5 py-1 transition-opacity hover:opacity-90"
                aria-label="CiteLadder command center"
              >
                <LogoMark variant="sidebar" priority />
              </Link>
            </div>
          </aside>

          <div className="relative z-1 flex min-w-0 flex-1 flex-col">
            {/* Compact only, exactly as before. On desktop the account
                  trigger rides the route's own header row instead, so the shell
                  adds no second bar above the work. */}
            <header className="bg-shell sticky top-0 z-20 grid h-[var(--compact-topbar-height)] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-[var(--content-gutter)] min-[981px]:hidden">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  ref={navigationTriggerRef}
                  aria-label="Open navigation"
                  onClick={() => setNavigationOpen(true)}
                >
                  <Menu className="size-4" aria-hidden />
                </Button>
              </div>
              <div className="text-secondary min-w-0 truncate text-sm">{compactTitle}</div>
              <div className="flex items-center justify-end gap-2.5 justify-self-end">
                <AgentSheetTrigger />
                <UserMenuTrigger presenter="compact" />
              </div>
            </header>

            <main id="main" className="app-pane app-pane-workspace relative flex-1">
              {/* The account rides the route's own first row rather than a
                    bar of its own, so the shell adds no second row above the
                    work. It is positioned rather than placed in PageShell
                    because the account belongs to the shell: routes render
                    their bands on their own in tests and previews, and coupling
                    every one of them to the account controller would make the
                    page shell unmountable outside this provider.

                    Desktop only — the compact topbar already carries it. The
                    inline-size padding matches the pane's gutter so the glyph
                    lines up with the actions beneath it. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden h-[var(--page-band-identity)] min-[981px]:block">
                <div className="mx-auto flex h-full w-full max-w-[var(--content-max-width)] items-center justify-end px-[var(--content-gutter)]">
                  <div className="pointer-events-auto flex items-center gap-1">
                    <UserMenuTrigger presenter="header" />
                  </div>
                </div>
              </div>
              {/* No gutter here. The route's own bands carry it, so their rules
                  reach the paper's edges instead of stopping at the margin. */}
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0 pb-[var(--content-gutter)]">
                <div className="min-w-0">{children}</div>
              </div>
            </main>

            <CommandPalette />
            <AgentSheet />
            <Drawer
              open={navigationOpen}
              onOpenChange={setNavigationOpen}
              onAfterClose={launchAfterNavigationClose}
              title="Navigation"
              hideHeader
              closeLabel="Close navigation"
              side="left"
              className="w-[min(17rem,100vw)] max-w-none border-l-0"
            >
              <div className="grid gap-4">
                <Link
                  to={overviewHref}
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
                  <SidebarNav onNavigate={() => setNavigationOpen(false)} />
                </div>
              </div>
            </Drawer>
          </div>
        </div>
      </TooltipProvider>
    </CompactPageTitleContext.Provider>
  );
}
