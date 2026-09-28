import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ShellFallback } from '@/components/layout/shell-fallback';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { policiesApi } from '@/lib/api/policies';
import { queryKeys } from '@/lib/api/query-keys';
import { humanizeApiError } from '@/lib/api/errors';
import { hasSignInTermsConsent } from '@/lib/auth/terms-consent';
import { useProjectContext } from '@/lib/project/project-context';
import { websiteHref } from '@/lib/config/app-link';

export function PolicyAcceptanceGate({ children }: Readonly<{ children: ReactNode }>) {
  const { activeWorkspaceId } = useProjectContext();
  if (!activeWorkspaceId) return children;
  return (
    <WorkspacePolicy key={activeWorkspaceId} workspaceId={activeWorkspaceId}>
      {children}
    </WorkspacePolicy>
  );
}

/**
 * Record the Terms decision for the resolved workspace.
 *
 * The decision is normally made on the sign-in screen; this records it for
 * the workspace once the server names the current revision. The review
 * screen below is only the fallback for a session that reached the app
 * without that decision — a session restored in a new tab, or a Terms
 * revision published since sign-in.
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
      </main>
    </ShellFallback>
  );
}
