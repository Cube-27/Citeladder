'use client';

import type { ActionSurface } from '@citeladder/contracts/action-surface';
import { useSurfaceOpenCount } from '@/lib/agent/use-action-status-counts';

/**
 * Open plus in-progress Actions of one screen (Actions or Content
 * optimization) for the active project, in that row's count slot. Every
 * badge reads the shell's one unfiltered Actions read.
 */
export function OpenActionCount({ surface }: Readonly<{ surface: ActionSurface }>) {
  const count = useSurfaceOpenCount(surface);
  if (count === undefined) return null;
  return (
    <>
      <span aria-hidden>{count}</span>
      <span className="sr-only">, {count} open</span>
    </>
  );
}
