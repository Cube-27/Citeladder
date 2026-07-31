import { OpportunityStatusBadge } from '@/components/opportunities/opportunity-status-badge';
import { useUpdateOpportunityStatus } from '@/components/opportunities/use-opportunity-status';
import { Button } from '@/components/ui/button';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import type { OpportunityDetail, OpportunityStatus } from '@/lib/api/types';

export function OpportunityStatusFooter({
  detail,
  projectId,
}: Readonly<{ detail: OpportunityDetail; projectId: string }>) {
  const updateStatus = useUpdateOpportunityStatus(projectId, detail.id);
  const change = (status: OpportunityStatus) => {
    updateStatus.mutate({ opportunityId: detail.id, status });
  };

  return (
    <footer className="border-border-subtle grid gap-2 border-t px-4 py-3">
      {updateStatus.isError ? (
        // A4: a 4xx (e.g. the opportunity was superseded by a newer recompute)
        // renders the backend message verbatim; transient failures offer retry.
        <MutationNotice
          notice={mutationNoticeForError(updateStatus.error, { action: 'update the status' })}
          onRetry={() => {
            // Re-attempt the exact failed transition, never a guessed one.
            if (updateStatus.variables) updateStatus.mutate(updateStatus.variables);
          }}
        />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xs text-muted">Status</span>
          <OpportunityStatusBadge status={detail.status} />
        </div>
        <div className="flex items-center gap-2">
          {detail.status === 'open' ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => change('dismissed')}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => change('in_progress')}
              >
                Mark in progress
              </Button>
            </>
          ) : null}
          {detail.status === 'in_progress' ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => change('dismissed')}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => change('resolved')}
              >
                Mark resolved
              </Button>
            </>
          ) : null}
          {detail.status === 'dismissed' || detail.status === 'resolved' ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={updateStatus.isPending}
              onClick={() => change('open')}
            >
              Reopen
            </Button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
