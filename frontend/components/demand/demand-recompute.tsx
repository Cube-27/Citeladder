import type { UseMutationResult } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MutationNotice } from '@/components/ui/mutation-notice';
import type { demandApi } from '@/lib/api/demand';
import type { DemandRecomputeRequest } from '@citeladder/contracts/demand';
import { isTransientMutationError, mutationNoticeForError } from '@/lib/api/mutation-notice';

type RecomputeMutation = UseMutationResult<
  Awaited<ReturnType<typeof demandApi.recompute>>,
  Error,
  DemandRecomputeRequest
>;

/**
 * The header's one recompute button, which becomes the next step in place:
 * once queued it checks for the new snapshot; after a transient failure it
 * retries. The button keeps its slot, so the page never moves.
 */
export function RecomputeAction({
  mutation,
  onRecompute,
  onCheck,
}: Readonly<{ mutation: RecomputeMutation; onRecompute: () => void; onCheck: () => void }>) {
  if (mutation.isSuccess)
    return (
      <Button variant="secondary" onClick={onCheck}>
        <Icon icon={RefreshCw} />
        Check for new snapshot
      </Button>
    );
  const retry = mutation.isError && isTransientMutationError(mutation.error);
  return (
    <Button
      variant="secondary"
      onClick={onRecompute}
      pending={mutation.isPending}
      pendingLabel="Queueing…"
    >
      <Icon icon={RefreshCw} />
      {retry ? 'Try again' : 'Recompute signals'}
    </Button>
  );
}

/** Recompute's outcome as one more fact on the summary line. */
export function RecomputeStatus({ mutation }: Readonly<{ mutation: RecomputeMutation }>) {
  if (mutation.isSuccess)
    return (
      <span className="type-caption text-info">
        {mutation.data.status === 'already_queued'
          ? 'A recompute for this window is already queued.'
          : 'Recompute queued. Signals refresh once the job finishes.'}
      </span>
    );
  return null;
}

/** A failed recompute as the shared notice; the header button is its retry. */
export function RecomputeFailure({ mutation }: Readonly<{ mutation: RecomputeMutation }>) {
  if (!mutation.isError) return null;
  return (
    <MutationNotice
      notice={mutationNoticeForError(mutation.error, {
        action: 'queue the search demand recompute',
      })}
    />
  );
}
