import type { ReactNode } from 'react';

import { PageLoading } from '@/components/layout/page-loading';

/**
 * The placeholder shown while the SESSION and the shell's opening decision are
 * still resolving — before the app knows whether this visitor is signed in at
 * all, so before any chrome can be drawn.
 *
 * It intentionally contains geometry only: before session identity resolves,
 * navigation, project names, account controls, and capability claims would all
 * be private or misleading.
 *
 * The geometry it does draw is the shell's own, down to the paper. This is the
 * ONE frame a cold load now shows before its destination, so anything it gets
 * wrong is a visible jump rather than a detail: the sidebar column reserves the
 * same width `AppShell` gives it, and the content column is a real `.app-pane`,
 * so the ground/paper split does not appear a paint later than the layout does.
 */
export function ShellFallback({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <div
      className="bg-shell flex min-h-dvh"
      aria-busy={children === undefined ? 'true' : undefined}
    >
      {/* No border: the pane's own left hairline falls on this seam, exactly
          as it does once the shell mounts. Drawing both put two rules a pixel
          apart for the length of the wait. */}
      <div className="hidden w-[var(--sidebar-width)] shrink-0 min-[981px]:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-[var(--compact-topbar-height)] shrink-0 min-[981px]:hidden" />
        <div className="app-pane app-pane-workspace flex min-w-0 flex-1 flex-col">
          {children === undefined ? <PageLoading label="Loading your workspace…" /> : children}
        </div>
      </div>
    </div>
  );
}
