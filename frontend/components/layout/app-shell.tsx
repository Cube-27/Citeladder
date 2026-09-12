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
import { CompactPageTitleContext } from './compact-page-title-context';
import { ProjectSwitcher } from './project-switcher';
import { SidebarNav } from './sidebar-nav';
import { UserMenuController, UserMenuTrigger } from './user-menu';
import { resolveTitle } from './page-titles';
import { projectDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

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
  const pathname = usePathname() ?? '/projects';
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
      window.dispatchEvent(new Event('citeladder:open-agent'));
      return;
    }
    window.dispatchEvent(
      new CustomEvent('citeladder:open-command-palette', { detail: { trigger: launch.trigger } }),
    );
  }

  return (
    <CompactPageTitleContext.Provider value={setCompactTitleOverride}>
      <UserMenuController>
        <TooltipProvider>
          <div className="bg-shell relative flex min-h-dvh">
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

              {/* The first row below the switcher is offset by the same
                  workspace gap the content pane puts between its header and
                  its first section, so both second rows start at one line. */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-[var(--sidebar-pad-x)] pt-[var(--workspace-gap)] pb-[var(--sidebar-pad-y)]">
                {/* Tab-height rows, so the sidebar's second row and the
                    content's second row are the same band at the same offset. */}
                <CommandPaletteTrigger className="h-[var(--tab-height)] w-full" />
                <AgentSheetTrigger className="h-[var(--tab-height)] w-full justify-start" />
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <SidebarNav />
                </div>
              </div>

              <div className="border-border-subtle shrink-0 border-t p-[var(--sidebar-pad-x)]">
                <Link
                  href={overviewHref}
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
                    work. It is positioned rather than placed in PageHeader
                    because the account belongs to the shell: routes render
                    their header on its own in tests and previews, and coupling
                    every one of them to the account controller would make the
                    header unmountable outside this provider.

                    Desktop only — the compact topbar already carries it. The
                    inline-size padding matches the pane's gutter so the glyph
                    lines up with the actions beneath it. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden h-[var(--compact-topbar-height)] items-center justify-end px-[var(--content-gutter)] min-[981px]:flex">
                  <div className="pointer-events-auto">
                    <UserMenuTrigger presenter="header" />
                  </div>
                </div>
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
                hideHeader
                closeLabel="Close navigation"
                side="left"
                className="w-[min(17rem,100vw)] max-w-none border-l-0"
              >
                <div className="grid gap-4">
                  <Link
                    href={overviewHref}
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
      </UserMenuController>
    </CompactPageTitleContext.Provider>
  );
}
