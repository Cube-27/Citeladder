import { PageLoading } from '@/components/layout/page-loading';

/**
 * The placeholder shown while the SESSION is still resolving — before the app
 * knows whether this visitor is signed in at all, so before any chrome can be
 * drawn.
 *
 * It is deliberately just the loader on an empty canvas. Drawing a sidebar
 * silhouette here looked like a half-built app: the reader watched an empty
 * rail appear, then fill with navigation. Once the session settles the shell
 * mounts once and stays mounted for the rest of the visit — the project wait
 * and every screen's first load happen INSIDE it.
 */
export function ShellFallback() {
  return (
    <div className="bg-shell grid min-h-dvh place-items-center">
      <PageLoading label="Loading your workspace…" />
    </div>
  );
}
