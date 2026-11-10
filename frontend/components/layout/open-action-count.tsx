'use client';

import type { ActionSurface } from '@citeladder/contracts/actions';
import { queueCount, useActionStatusCounts } from '@/lib/agent/use-action-status-counts';

/**
 * Open plus in-progress Actions of one screen (Actions or Content
 * optimization) for the active project, in that row's count slot.
 */
export function OpenActionCount({ surface }: Readonly<{ surface: ActionSurface }>) {
  const counts = useActionStatusCounts(surface);
  if (!counts) return null;
  const count = queueCount(counts);
  return (
    <>
      <span aria-hidden>{count}</span>
      <span className="sr-only">, {count} open</span>
    </>
  );
}
