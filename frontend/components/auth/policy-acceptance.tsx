import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { ShellFallback } from '@/components/layout/shell-fallback';
import { QueryState } from '@/components/ui/query-state';
import { policiesApi } from '@/lib/api/policies';
import { queryKeys } from '@/lib/api/query-keys';
import { signOutForChangedTerms } from '@/lib/auth/account-transition';
import { revisionChanged, sessionLacksTerms } from '@/lib/auth/terms-consent';
import { isWorkspaceFreeRoute } from '@/lib/project/bootstrap';
import { useProjectContext } from '@/lib/project/project-context';

export function PolicyAcceptanceGate({ children }: Readonly<{ children: ReactNode }>) {
  const { activeWorkspaceId } = useProjectContext();
  const location = useLocation();
  if (!activeWorkspaceId || isWorkspaceFreeRoute(location.pathname, location.search))
    return children;
  return (
    <WorkspacePolicy key={activeWorkspaceId} workspaceId={activeWorkspaceId}>
      {children}
    </WorkspacePolicy>
  );
}

/**
 * Record the person's Terms acceptance for the workspace they open. There is
 * no consent screen here: the decision is the required box on the sign-in or
 * sign-up form, which the server recorded with their account. A workspace
 * without an acceptance of the current revision (one they joined, say) gets
 * it recorded from that decision, which the server checks, behind the shell's
 * loading frame. A session older than the published revision carries no
 * decision on it, so it ends and the person signs in again, agreeing as they do.
 *
 * While the status is unknown or being recorded the gate draws the shell's own
 * loading frame; product content never renders without the acceptance.
 */
function WorkspacePolicy({
  workspaceId,
  children,
}: Readonly<{ workspaceId: string; children: ReactNode }>) {
  const cache = useQueryClient();
  const queryKey = queryKeys.policies.workspace(workspaceId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => policiesApi.status(workspaceId, signal),
    // Acceptance only changes through this gate, which writes the cache itself.
    staleTime: Number.POSITIVE_INFINITY,
  });
  const accept = useMutation({
    mutationFn: (revision: string) => policiesApi.accept(workspaceId, revision),
    onSuccess: (data) => cache.setQueryData(queryKey, data),
    // Republished between the read and the record: read the new revision,
    // which records it (or ends the session if it predates it).
    onError: (error) => {
      if (revisionChanged(error)) void query.refetch();
    },
  });
  const leave = useMutation({ mutationFn: () => signOutForChangedTerms(cache) });

  const { mutate: record } = accept;
  const pendingRevision = query.data && !query.data.accepted_at ? query.data.terms_revision : null;
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    // Once per revision: a refusal stops here rather than retrying in a loop.
    if (!pendingRevision || recorded.current === pendingRevision) return;
    recorded.current = pendingRevision;
    record(pendingRevision);
  }, [record, pendingRevision]);

  const sessionPredatesTerms = sessionLacksTerms(accept.error);
  const { mutate: signOut } = leave;
  // Once: leaving clears the cache, and the re-read must not sign out again.
  const leaving = useRef(false);
  useEffect(() => {
    if (!sessionPredatesTerms || leaving.current) return;
    leaving.current = true;
    signOut();
  }, [signOut, sessionPredatesTerms]);

  if (query.data?.accepted_at) return children;
  // Leaving, or re-reading a republished revision, is still loading.
  const settling = sessionPredatesTerms || revisionChanged(accept.error);
  const failure = query.error ?? leave.error ?? (settling ? null : accept.error);
  if (!failure) return <ShellFallback />;
  const retry = () => {
    if (query.error) void query.refetch();
    else if (leave.error) signOut();
    else if (pendingRevision) record(pendingRevision);
  };
  return (
    <ShellFallback>
      <QueryState
        kind="error"
        error={failure}
        fallback="We could not open this workspace."
        onRetry={retry}
        pending={query.isFetching || accept.isPending || leave.isPending}
      />
    </ShellFallback>
  );
}
