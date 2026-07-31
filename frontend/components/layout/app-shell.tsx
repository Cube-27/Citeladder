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
 * logo row → project switcher → grouped nav → user card, each
 * band separated by a hairline; and a 48px top bar (`--topbar-height`) over
 * the content column carrying the centered command palette and theme toggle.
 *
 * The top-bar search is the ⌘K palette (components/ui/command-palette.tsx),
 * which owns both the global key binding and its pointer trigger.
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
        <aside className="border-border-subtle bg-sidebar flex w-[var(--sidebar-width)] shrink-0 flex-col border-r transition-[width]">
          {/* Logo row — matches topbar height */}
          <div className="border-border-subtle flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b px-4">
            <LogoMark size={24} />
            <span className="text-foreground font-display text-heading-sm font-semibold">
              Searchify
            </span>
          </div>

          <div className="border-border-subtle border-b p-1">
            <ProjectSwitcher />
          </div>

          <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <SidebarNav />
          </div>

          <div className="border-border-subtle shrink-0 border-t p-2">
            <UserMenu />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top bar with opaque utility chrome. */}
          <header className="border-border-subtle bg-panel sticky top-0 z-20 grid h-[var(--topbar-height)] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,420px)_minmax(0,1fr)] items-center border-b px-6">
            <div aria-hidden />
            <div className="w-full max-w-[420px] min-w-0 justify-self-center">
              <CommandPalette />
            </div>
            <div className="justify-self-end">
              <ThemeToggle />
            </div>
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
