import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ShellFallback } from '@/components/layout/shell-fallback';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { policiesApi } from '@/lib/api/policies';
import { queryKeys } from '@/lib/api/query-keys';
import { humanizeApiError } from '@/lib/api/errors';
import { signOut } from '@/lib/auth/account-transition';
import { hasSignInTermsConsent } from '@/lib/auth/terms-consent';
import { WORKSPACE_CHOOSER_PATH, isWorkspaceFreeRoute } from '@/lib/project/bootstrap';
import { useProjectContext } from '@/lib/project/project-context';
import { websiteHref } from '@/lib/config/app-link';

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
 * Record the Terms decision for the resolved workspace.
 *
 * Someone accepts the Terms when they sign up and create their workspace, and
 * a decision made on the signup form in this tab is recorded here for a
 * workspace they joined. The review screen below appears only when this
 * workspace has no acceptance of the current revision: a new revision, or a
 * workspace joined without that decision.
 *
 * While the status is unknown the gate draws the shell's own loading frame,
 * never the review screen: an already-accepted reader refreshing the page
 * must not watch a consent form flash before their workspace.
 */
function WorkspacePolicy({
  workspaceId,
  children,
}: Readonly<{ workspaceId: string; children: ReactNode }>) {
  const cache = useQueryClient();
  const [checked, setChecked] = useState(false);
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
    onError: () => {
      setChecked(false);
      void query.refetch();
    },
  });

  const { mutate: record } = accept;
  const pendingRevision = query.data && !query.data.accepted_at ? query.data.terms_revision : null;
  const recordedFromSignIn = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingRevision || !hasSignInTermsConsent()) return;
    if (recordedFromSignIn.current === pendingRevision) return;
    // Once per revision: a refused record falls back to the explicit screen
    // rather than retrying in a loop.
    recordedFromSignIn.current = pendingRevision;
    record(pendingRevision);
  }, [record, pendingRevision]);

  if (query.data?.accepted_at) return children;
  const recordingSignInConsent =
    pendingRevision !== null && hasSignInTermsConsent() && !accept.isError;
  if (query.isPending || recordingSignInConsent) return <ShellFallback />;
  return (
    <ShellFallback>
      <main className="mx-auto grid w-full max-w-xl content-center gap-4 p-8">
        <h1 className="flow-title">Review the Terms of Service</h1>
        {query.isError ? (
          <Alert tone="danger">
            {humanizeApiError(query.error).message}
            <Button onClick={() => void query.refetch()}>Retry</Button>
          </Alert>
        ) : null}
        {query.data ? (
          <>
            <p className="flow-help">
              Read the{' '}
              <a href={websiteHref('/terms')} target="_blank" rel="noreferrer">
                Terms of Service
              </a>{' '}
              (revision {query.data.terms_revision}). Our{' '}
              <a href={websiteHref('/privacy')} target="_blank" rel="noreferrer">
                Privacy Policy
              </a>{' '}
              explains how we process data. Optional analytics is a separate choice.
            </p>
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
              label="I agree to the Terms of Service."
            />
            <Button
              className="w-fit"
              disabled={!checked || accept.isPending}
              onClick={() => accept.mutate(query.data.terms_revision)}
            >
              Accept and continue
            </Button>
          </>
        ) : null}
        {accept.isError ? (
          <Alert tone="danger">{humanizeApiError(accept.error).message}</Alert>
        ) : null}
        <PolicyExits />
      </main>
    </ShellFallback>
  );
}

/** The ways out of the review screen: another workspace, or signing out. */
function PolicyExits() {
  const cache = useQueryClient();
  const { workspaces } = useProjectContext();
  return (
    <div className="flex flex-wrap gap-2">
      {workspaces.length > 1 ? (
        <Button asChild variant="secondary" className="w-fit">
          <Link to={WORKSPACE_CHOOSER_PATH}>Switch workspace</Link>
        </Button>
      ) : null}
      <Button variant="ghost" className="w-fit" onClick={() => void signOut(cache)}>
        Sign out
      </Button>
    </div>
  );
}
