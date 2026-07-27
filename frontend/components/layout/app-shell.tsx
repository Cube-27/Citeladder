'use client';

import type { ReactNode } from 'react';

import { CommandPalette } from '@/components/ui/command-palette';
import { LogoMark } from '@/components/ui/logo-mark';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { TooltipProvider } from '@/components/ui/tooltip';

import { PageHeader } from './page-header';
import { ProjectSwitcher } from './project-switcher';
import { SidebarNav } from './sidebar-nav';
import { UserMenu } from './user-menu';

/**
 * AppShell — the authed-area chrome in the ADS shell language.
 *
 * Geometry: a 240px left sidebar (`bg-sidebar`, `--sidebar-width`) stacked as
 * logo row → project switcher + command row → grouped nav → user card, each
 * band separated by a hairline; and a 48px top bar (`--topbar-height`) over
 * the content column carrying pure chrome (the theme toggle, right-aligned).
 *
 * The command row is the ⌘K palette (components/ui/command-palette.tsx), which
 * owns both the global key binding and its own sidebar trigger.
 *
 * The page header no longer lives in the top bar: `<PageHeader />` renders as
 * the first block of the content column (page-header.tsx), where it has room
 * for the 24/28 H-L title, a wrapping description, and an actions row. The
 * 48px bar is reduced to right-aligned utility chrome.
 *
 * The grouped Analyze/Improve nav is deliberately kept — the Figma flat nav is
 * not adopted (plan.md §10, resolved decision 4).
 *
 * Wrapped once in `<TooltipProvider>` so descendants' tooltips work. Session +
 * project context are provided one level up in `(app)/layout.tsx`, so this
 * component is pure chrome around `children`.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipProvider>
      <div className="bg-background flex h-dvh overflow-hidden">
        <aside className="border-border bg-sidebar flex w-[var(--sidebar-width)] shrink-0 flex-col border-r">
          {/* Logo row — matches the top bar's height so the two align across
              the sidebar hairline. */}
          <div className="border-border-subtle flex h-[var(--topbar-height)] shrink-0 items-center gap-2 border-b px-4">
            <LogoMark size={24} />
            <span className="text-foreground text-heading-sm">Searchify</span>
          </div>

          <div className="border-border-subtle flex flex-col gap-2 border-b p-2">
            <ProjectSwitcher />

            {/* Command row — owns both the ⌘K binding and its own trigger. */}
            <CommandPalette />
          </div>

          <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <SidebarNav />
          </div>

          <div className="border-border-subtle shrink-0 border-t p-2">
            <UserMenu />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top bar: pure chrome — just the right-aligned theme toggle. The
              page <h1> lives in the content column below (PageHeader). */}
          <header className="border-border bg-panel flex h-[var(--topbar-height)] shrink-0 items-center justify-end gap-2 border-b px-6">
            <ThemeToggle />
          </header>

          <main className="content-scroll min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid w-full max-w-[var(--content-max-width)] gap-[var(--card-gap)] p-[var(--content-gutter)]">
              <PageHeader />
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
