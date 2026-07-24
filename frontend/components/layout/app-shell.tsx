'use client';

import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';

import { PageHeader } from './page-header';
import { ProjectSwitcher } from './project-switcher';
import { SidebarNav } from './sidebar-nav';
import { UserMenu } from './user-menu';

/**
 * AppShell (F5) — the authed-area chrome (docs/design.md §9.2).
 *
 * Flat/hairline language: a 236px left sidebar (`bg-sidebar`) holding a
 * workspace row → command row → project switcher → grouped nav, with the user
 * row pinned under a hairline at the bottom. There is no top bar: the page
 * title and its one-line summary live in the content column (see PageHeader),
 * so the content region starts at the top of the frame.
 *
 * Wrapped once in `<TooltipProvider>` so descendants' tooltips work.
 *
 * Session + project context are provided one level up in `(app)/layout.tsx`, so
 * this component is pure chrome around `children`.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipProvider>
      <div className="bg-background flex h-dvh overflow-hidden">
        <aside className="border-border bg-sidebar flex w-[236px] shrink-0 flex-col gap-2.5 border-r p-3">
          {/* Workspace row — the mark and the "by CUBE27" sub-tag moved out of
              the app chrome (they stay on the marketing nav and /login). */}
          <ProjectSwitcher />

          {/* Command row — non-functional for now; Phase 2 wires a real
              command palette behind it. Rendered as a button so it is
              focusable and announced, but marked disabled until then. */}
          <button
            type="button"
            disabled
            aria-label="Search or jump to (coming soon)"
            className="border-border bg-panel text-muted focus-ring flex h-8 w-full items-center gap-2 rounded-md border px-2 text-left disabled:cursor-default"
          >
            <Search className="size-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
            <span className="text-xs">Search or jump to…</span>
            <kbd className="text-subtle ms-auto font-mono text-[10px]">⌘K</kbd>
          </button>

          <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto">
            <SidebarNav />
          </div>

          <div className="border-border-subtle border-t pt-2">
            <UserMenu />
          </div>
        </aside>

        <main className="content-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-[1440px] gap-3 p-[var(--content-gutter)]">
            {/* The page's single <h1>. Rendered once here so every route has a
                title without each page repeating a header block. */}
            <PageHeader />
            {children}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
