'use client';

import { Component, Suspense, type ReactNode } from 'react';

import { textRole } from '@/components/ui/typography';
import { isChunkLoadError, reportClientError } from '@/lib/client-errors';

type BoundaryProps = Readonly<{ failed: ReactNode; label: string; children: ReactNode }>;

/**
 * Catches a lazy piece that cannot load (a chunk that failed to download,
 * typically after a deploy replaced it) so the failure stays inside the space
 * the piece was given. Without it the rejection travels to the screen's
 * error boundary and a missing navigation count or chart replaces the whole
 * screen. It does not retry: React keeps a failed lazy import failed, and a
 * reload is the honest way back.
 *
 * Any other error is a defect in the piece itself, such as a chart handed
 * data of the wrong shape, and goes on to the screen's error boundary rather
 * than hiding behind the quiet fallback. Both are reported.
 */
class IslandBoundary extends Component<BoundaryProps, { error: { thrown: unknown } | null }> {
  override state: { error: { thrown: unknown } | null } = { error: null };

  static getDerivedStateFromError(thrown: unknown): { error: { thrown: unknown } } {
    return { error: { thrown } };
  }

  override componentDidCatch(error: unknown) {
    const chunk = isChunkLoadError(error);
    reportClientError({
      kind: chunk ? 'chunk_load' : 'render',
      error,
      component: this.props.label,
    });
    if (chunk) return;
    // An update that throws hands the original error to the nearest boundary above.
    this.setState(() => {
      throw error;
    });
  }

  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    // A defect renders nothing for the moment before it is handed upward.
    return isChunkLoadError(error.thrown) ? this.props.failed : null;
  }
}

/**
 * A lazily loaded piece inside space its parent already holds: `loading`
 * while its code downloads, `failed` in the same place if it cannot load.
 * `label` names the piece in error reports.
 */
export function LazyIsland({
  loading = null,
  failed,
  label,
  children,
}: Readonly<{ loading?: ReactNode; failed: ReactNode; label: string; children: ReactNode }>) {
  return (
    <IslandBoundary failed={failed} label={label}>
      <Suspense fallback={loading}>{children}</Suspense>
    </IslandBoundary>
  );
}

/** The quiet stand-in for a piece that could not load, centred in its box. */
export function IslandUnavailable({ message }: Readonly<{ message: string }>) {
  return (
    <div className="grid h-full place-items-center">
      <p className={textRole('caption', 'text-muted')}>{message}</p>
    </div>
  );
}
