'use client';

import type { ReactNode } from 'react';

import { CommandPalette } from '@/components/ui/command-palette';
import { LogoMark } from '@/components/ui/logo-mark';
import { TooltipProvider } from '@/components/ui/tooltip';

import { PageHeader } from './page-header';
import { ProjectSwitcher } from './project-switcher';
import { SidebarNav } from './sidebar-nav';
import { UserMenu } from './user-menu';

/**
 * AppShell — the authed-area chrome in the v2 Figma shell language
 * (docs/design.md §9.2).
 *
 * Geometry: a 220px left sidebar (`bg-sidebar`) stacked as logo row → project
 * switcher + command row → grouped nav → user card, each band separated by a
 * hairline; and a 52px top bar over the content column carrying the page title
 * and a header slot.
 *
 * The command row is the ⌘K palette (components/ui/command-palette.tsx), which
 * owns both the global key binding and its own sidebar trigger.
 *
 * The top bar is back. The flat/hairline phase had retired it and moved the
 * title into the content column; the Figma shell puts it in its own band again,
 * so PageHeader renders there and the content region starts below it.
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
        <aside className="border-border bg-sidebar flex w-[220px] shrink-0 flex-col border-r">
          {/* Logo row — matches the top bar's 52px so the two align across the
              sidebar hairline. The mark returns to the app chrome here; it had
              been marketing/auth-only during the flat phase. */}
          <div className="border-border-subtle flex h-[52px] shrink-0 items-center gap-2.5 border-b px-5">
            <LogoMark size={26} />
            <span className="text-foreground text-lg font-semibold tracking-tight">Searchify</span>
          </div>

          <div className="border-border-subtle flex flex-col gap-2 border-b p-3">
            <ProjectSwitcher />

            {/* Command row — owns both the ⌘K binding and its own trigger. */}
            <CommandPalette />
          </div>

          <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto p-2">
            <SidebarNav />
          </div>

          <div className="border-border-subtle shrink-0 border-t p-2.5">
            <UserMenu />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* 52px top bar: the page's single <h1> plus PageHeader's actions
              slot, on the panel surface so it reads as chrome over the page. */}
          <header className="border-border bg-panel flex h-[52px] shrink-0 items-center gap-4 border-b px-6">
            <PageHeader />
          </header>

          <main className="content-scroll min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid w-full max-w-[1440px] gap-3 p-[var(--content-gutter)]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
