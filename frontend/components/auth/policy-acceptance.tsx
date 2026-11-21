import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { FirstFrame, GateHold } from '@/components/layout/first-frame';
import { policyMutations, policyQueries } from '@/lib/api/policies';
import { revisionChanged, sessionLacksTerms } from '@/lib/auth/terms-consent';
import { useSignOutForChangedTerms } from '@/lib/auth/use-sign-out-for-changed-terms';
import { isWorkspaceFreeRoute } from '@/lib/project/bootstrap';
import { useProjectContext } from '@/lib/project/project-context';
import { StateBlock } from '@/components/ui/state-block';

export function PolicyAcceptanceGate({ children }: Readonly<{ children: ReactNode }>) {
  const { activeWorkspaceId } = useProjectContext();
  const location = useLocation();
  const workspaceId =
    activeWorkspaceId && !isWorkspaceFreeRoute(location.pathname, location.search)
      ? activeWorkspaceId
      : null;
  const policy = useWorkspacePolicy(workspaceId);
  if (policy.kind === 'failed') {
    return (
      <FirstFrame>
        <StateBlock
          kind="error"
          error={policy.error}
          title="Couldn't open this workspace"
          fallback="We could not open this workspace."
          onRetry={policy.retry}
          pending={policy.retrying}
        />
      </FirstFrame>
    );
  }
  return <GateHold held={policy.kind === 'pending'}>{children}</GateHold>;
}

type PolicyState =
  | { kind: 'open' }
  | { kind: 'pending' }
  | { kind: 'failed'; error: unknown; retry: () => void; retrying: boolean };

function useWorkspacePolicy(workspaceId: string | null): PolicyState {
  const query = useQuery({
    ...policyQueries.workspace(workspaceId ?? ''),
    enabled: workspaceId !== null,
  });
  const pendingRevision = query.data && !query.data.accepted_at ? query.data.terms_revision : null;
  const { accept, record } = useRecordAcceptance(workspaceId, pendingRevision);

  const acceptError = accept.variables?.workspaceId === workspaceId ? accept.error : null;
  const sessionPredatesTerms = sessionLacksTerms(acceptError);
  const leave = useSignOutForChangedTerms(sessionPredatesTerms);

  if (workspaceId === null || query.data?.accepted_at) return { kind: 'open' };
  const failure = blockingFailure({
    readError: query.error,
    leaveError: leave.error,
    acceptError,
    sessionPredatesTerms,
  });
  if (!failure) return { kind: 'pending' };
  return {
    kind: 'failed',
    error: failure,
    retry: () => {
      if (query.error) void query.refetch();
      else if (leave.error) leave.mutate();
      else if (pendingRevision) record(workspaceId, pendingRevision);
    },
    retrying: query.isFetching || accept.isPending || leave.isPending,
  };
}

function blockingFailure({
  readError,
  leaveError,
  acceptError,
  sessionPredatesTerms,
}: Readonly<{
  readError: unknown;
  leaveError: unknown;
  acceptError: unknown;
  sessionPredatesTerms: boolean;
}>): unknown {
  const settling = sessionPredatesTerms || revisionChanged(acceptError);
  return readError ?? leaveError ?? (settling ? null : acceptError);
}

function useRecordAcceptance(workspaceId: string | null, pendingRevision: string | null) {
  const client = useQueryClient();
  const accept = useMutation(policyMutations.accept());
  const { mutate } = accept;
  const record = useCallback(
    (id: string, revision: string) =>
      mutate(
        { workspaceId: id, revision },
        {
          onError: (error) => {
            if (!revisionChanged(error)) return;
            void client.invalidateQueries({
              queryKey: policyQueries.workspace(id).queryKey,
              exact: true,
            });
          },
        },
      ),
    [client, mutate],
  );
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceId || !pendingRevision) return;
    const attempt = `${workspaceId}:${pendingRevision}`;
    if (recorded.current === attempt) return;
    recorded.current = attempt;
    record(workspaceId, pendingRevision);
  }, [record, workspaceId, pendingRevision]);
  return { accept, record };
}
