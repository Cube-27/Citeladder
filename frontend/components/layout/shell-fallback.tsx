import { PageLoading } from '@/components/layout/page-loading';

/**
 * The placeholder shown while the SESSION is still resolving — before the app
 * knows whether this visitor is signed in at all, so before any chrome can be
 * drawn.
 *
 * It intentionally contains geometry only: before session identity resolves,
 * navigation, project names, account controls, and capability claims would all
 * be private or misleading. Once the session settles, the authenticated shell
 * mounts and project waits happen inside its content pane.
 */
export function ShellFallback() {
  return (
    <div className="bg-shell flex min-h-dvh" aria-busy="true">
      <div className="border-border-subtle hidden w-[var(--sidebar-width)] border-r min-[981px]:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border-subtle h-[var(--compact-topbar-height)] border-b min-[981px]:hidden" />
        <PageLoading label="Loading your workspace…" />
      </div>
    </div>
  );
}
