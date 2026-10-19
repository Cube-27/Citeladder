import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ShellFallback } from '@/components/layout/shell-fallback';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Inline, Stack } from '@/components/ui/layout';
import { policiesApi } from '@/lib/api/policies';
import { queryKeys } from '@/lib/api/query-keys';
import { humanizeApiError } from '@/lib/api/errors';
import { signOut } from '@/lib/auth/account-transition';
import { hasSignupTermsConsent } from '@/lib/auth/terms-consent';
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
    onError: () => void query.refetch(),
  });

  const { mutate: record } = accept;
  const pendingRevision = query.data && !query.data.accepted_at ? query.data.terms_revision : null;
  const recordedFromSignIn = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingRevision || !hasSignupTermsConsent()) return;
    if (recordedFromSignIn.current === pendingRevision) return;
    // Once per revision: a refused record falls back to the explicit screen
    // rather than retrying in a loop.
    recordedFromSignIn.current = pendingRevision;
    record(pendingRevision);
  }, [record, pendingRevision]);

  if (query.data?.accepted_at) return children;
  const recordingSignInConsent =
    pendingRevision !== null && hasSignupTermsConsent() && !accept.isError;
  if (query.isPending || recordingSignInConsent) return <ShellFallback />;
  return (
    <ShellFallback>
      <Stack as="main" gap="workspace" className="mx-auto w-full max-w-xl content-center p-8">
        <TermsReview
          revision={query.data?.terms_revision}
          readError={query.error}
          onRetry={() => void query.refetch()}
          accepting={accept.isPending}
          acceptError={accept.error}
          onAccept={(revision) => accept.mutate(revision)}
        />
        <PolicyExits />
      </Stack>
    </ShellFallback>
  );
}

/**
 * The explicit Terms review: the current revision, an unticked box and one
 * action. The workspace gate shows it for a new revision or a workspace joined
 * without a decision; workspace setup shows it to a person with no decision.
 */
export function TermsReview({
  revision,
  readError,
  onRetry,
  accepting,
  acceptError,
  onAccept,
}: Readonly<{
  revision: string | undefined;
  readError: unknown;
  onRetry: () => void;
  accepting: boolean;
  acceptError: unknown;
  onAccept: (revision: string) => void;
}>) {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <h1 className="flow-title">Review the Terms of Service</h1>
      {readError ? (
        <Alert tone="danger">
          {humanizeApiError(readError).message}
          <Button onClick={onRetry}>Retry</Button>
        </Alert>
      ) : null}
      {revision ? (
        <>
          <p className="flow-help">
            Read the{' '}
            <a href={websiteHref('/terms')} target="_blank" rel="noreferrer">
              Terms of Service
            </a>{' '}
            (revision {revision}). Our{' '}
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
            disabled={!checked || accepting}
            onClick={() => onAccept(revision)}
          >
            Accept and continue
          </Button>
        </>
      ) : null}
      {acceptError ? <Alert tone="danger">{humanizeApiError(acceptError).message}</Alert> : null}
    </>
  );
}

/** The ways out of the review screen: another workspace, or signing out. */
function PolicyExits() {
  const cache = useQueryClient();
  const { workspaces } = useProjectContext();
  return (
    <Inline className="flex-wrap">
      {workspaces.length > 1 ? (
        <Button asChild variant="secondary" className="w-fit">
          <Link to={WORKSPACE_CHOOSER_PATH}>Switch workspace</Link>
        </Button>
      ) : null}
      <Button variant="ghost" className="w-fit" onClick={() => void signOut(cache)}>
        Sign out
      </Button>
    </Inline>
  );
}
