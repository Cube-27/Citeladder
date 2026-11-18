import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { FirstFrame, GateHold } from '@/components/layout/first-frame';
import { policyMutations, policyQueries } from '@/lib/api/policies';
import { revisionChanged, sessionLacksTerms } from '@/lib/auth/terms-consent';
import { useSignOutForChangedTerms } from '@/lib/auth/use-sign-out-for-changed-terms';
import { isWorkspaceFreeRoute } from '@/lib/project/bootstrap';
import { useProjectContext } from '@/lib/project/project-context';
import { StateBlock } from '@/components/ui/state-block';

/**
 * Record the person's Terms acceptance for the workspace they open. There is
 * no consent screen here: the decision is the required box on the sign-in or
 * sign-up form, which the server recorded with their account. A workspace
 * without an acceptance of the current revision (one they joined, say) gets
 * it recorded from that decision, which the server checks, behind the content
 * slot's loading frame. A session older than the published revision carries no
 * decision on it, so it ends and the person signs in again, agreeing as they do.
 *
 * While the status is unknown or being recorded the gate holds (`GateHold`):
 * product content never renders without the acceptance, and the tree above
 * the content slot stays mounted, so switching workspace never rebuilds the
 * shell. The tree's shape is the same in every open or held state.
 */
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
  const accept = useMutation(policyMutations.accept());
  const { refetch } = query;
  const { mutate } = accept;
  const record = useCallback(
    (id: string, revision: string) =>
      mutate(
        { workspaceId: id, revision },
        {
          // Republished between the read and the record: read the new revision,
          // which records it (or ends the session if it predates it).
          onError: (error) => {
            if (revisionChanged(error)) void refetch();
          },
        },
      ),
    [mutate, refetch],
  );
  const pendingRevision = query.data && !query.data.accepted_at ? query.data.terms_revision : null;
  // Once per workspace and revision: a refusal stops here rather than retrying in a loop.
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceId || !pendingRevision) return;
    const attempt = `${workspaceId}:${pendingRevision}`;
    if (recorded.current === attempt) return;
    recorded.current = attempt;
    record(workspaceId, pendingRevision);
  }, [record, workspaceId, pendingRevision]);

  // The last attempt may be another workspace's, from before a switch.
  const acceptError = accept.variables?.workspaceId === workspaceId ? accept.error : null;
  const sessionPredatesTerms = sessionLacksTerms(acceptError);
  const leave = useSignOutForChangedTerms(sessionPredatesTerms);

  if (workspaceId === null || query.data?.accepted_at) return { kind: 'open' };
  // Leaving, or re-reading a republished revision, is still loading.
  const settling = sessionPredatesTerms || revisionChanged(acceptError);
  const failure = query.error ?? leave.error ?? (settling ? null : acceptError);
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
