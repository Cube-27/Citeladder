'use client';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { PageLoading } from '@/components/layout/page-loading';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { textRole } from '@/components/ui/typography';
import type { WorkspaceEntitlement } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { capabilityRemaining, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { useCanonicalProjectUrl, workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import type { FailureScope, SelectionStatus } from '@/lib/project/selection';

/**
 * Routes that manage the WORKSPACE rather than work inside a project.
 *
 * A workspace with no projects is a perfectly valid workspace: its owner may
 * still need to reach billing, members and settings, and an invitee arriving
 * at an acceptance link has not joined anything yet. Redirecting these to
 * project creation answered a question nobody asked and made an empty
 * workspace unmanageable.
 */
const WORKSPACE_ONLY_PREFIXES = ['/onboarding', '/settings', '/invitations'] as const;

function isWorkspaceOnlyRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return WORKSPACE_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * What the workspace's project allowance currently says.
 *
 * `unknown` covers a FAILED read as well as an unresolved one, even when a
 * stale positive value is still in the cache: sending someone into creation on
 * the strength of a number the server just refused to confirm is how a
 * transient failure turns into a rejected second attempt.
 */
type Allowance = 'unknown' | 'spent' | 'spare';

function resolveAllowance(entitlement: WorkspaceEntitlement | null): Allowance {
  const remaining = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);
  if (remaining === undefined) return 'unknown';
  return remaining > 0 ? 'spare' : 'spent';
}

/** Which standing notice, if any, this state owes the reader. */
type NoticeKind = 'failed' | 'missing-project' | 'no-projects';
type GateState = NoticeKind | 'ready' | 'loading' | 'redirecting';

type GateInputs = {
  projectRequired: boolean;
  mayCreate: boolean;
  allowance: Allowance;
  entitlementLoading: boolean;
};

/** Resolve routing, loading and recovery together so their precedence cannot drift. */
function resolveGate(
  status: SelectionStatus,
  { projectRequired, mayCreate, allowance, entitlementLoading }: GateInputs,
): GateState {
  if (status === 'error') return 'failed';
  if (status === 'unavailable') return 'missing-project';
  if (!projectRequired) return 'ready';
  if (status === 'resolving') return 'loading';
  if (status !== 'empty') return 'ready';
  if (mayCreate && allowance === 'spare') return 'redirecting';
  if (entitlementLoading) return 'loading';
  // An unread allowance cannot justify claiming that the workspace is full.
  return allowance === 'unknown' ? 'failed' : 'no-projects';
}

/**
 * The project-route gate.
 *
 * It answers exactly one question: **does this authorized workspace need
 * project onboarding on this project-required route?** It deliberately does
 * not answer whether the signed-in user has projects anywhere, which is what
 * the old length-of-a-list check was really measuring.
 *
 * Every wait is one state. An unresolved context shows the loader and
 * redirects nowhere; a failed read offers Retry instead of looking like an
 * empty account; a project that is confirmed missing says so and offers a way
 * out. Only a workspace whose project list came back successfully EMPTY, with
 * no project resolved and creation permitted by role and allowance, sends the
 * reader to onboarding.
 */
export function OnboardingGate({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = useLocation().pathname;
  const {
    status,
    errorScope,
    activeWorkspaceId,
    activeWorkspace,
    retry: retryContext,
  } = useProjectContext();
  const queryClient = useQueryClient();
  /**
   * Re-ask BOTH halves of the precondition.
   *
   * The notice can be standing because the allowance never resolved, and the
   * project context does not own that read — retrying only the context left
   * the entitlement exactly as unresolved as before, so the button did
   * nothing the reader could see.
   */
  const retry = () => {
    retryContext();
    void queryClient.refetchQueries({ queryKey: queryKeys.billing.all });
  };
  // Only an empty workspace needs an allowance decision before routing.
  // Existing projects can start their reads while entitlement resolves;
  // capability-specific controls own their pending and denied states.
  const { isLoading: entitlementLoading, entitlement } = useEntitlement();

  // A role that may not create a project is not offered the affordance. This
  // reads the effective capability the backend published, not a role name, and
  // the backend still enforces the denial itself.
  const mayCreate = activeWorkspace?.capabilities.includes('write') ?? false;
  // The remaining allowance comes from the MEMBER-SAFE workspace projection,
  // so a Member sees the same "workspace is full" state an Owner does without
  // reading the workspace's private finances.
  const allowance = resolveAllowance(entitlement);
  const projectRequired = !isWorkspaceOnlyRoute(pathname);
  const state = resolveGate(status, {
    projectRequired,
    mayCreate,
    allowance,
    entitlementLoading,
  });

  useOnboardingRedirect(state === 'redirecting', activeWorkspaceId);
  useCanonicalProjectUrl(status === 'ready' && projectRequired);

  if (state === 'redirecting') return <PageLoading label="Opening project setup…" />;
  if (state === 'loading') return <PageLoading label="Loading your workspace…" />;
  if (state !== 'ready') {
    return (
      <GateNotice
        kind={state}
        mayCreate={mayCreate}
        workspaceId={activeWorkspaceId}
        // An allowance failure is a projects-side failure: the workspace
        // resolved, its remaining capacity did not.
        errorScope={errorScope ?? 'projects'}
        onRetry={retry}
      />
    );
  }

  return <>{children}</>;
}

/**
 * Send an empty workspace to project creation, CARRYING the workspace.
 *
 * Refreshing the creation route, or reaching it in an account with more than
 * one membership, must not silently change which workspace the project ends
 * up in.
 */
function useOnboardingRedirect(redirecting: boolean, workspaceId: string | null) {
  const router = useNavigate();
  useEffect(() => {
    if (!redirecting || !workspaceId) return;
    router(workspaceDestination('/onboarding', null, workspaceId), { replace: true });
  }, [redirecting, workspaceId, router]);
}

function GateNotice({
  kind,
  mayCreate,
  workspaceId,
  errorScope,
  onRetry,
}: Readonly<{
  kind: NoticeKind;
  mayCreate: boolean;
  workspaceId: string | null;
  errorScope: FailureScope;
  onRetry: () => void;
}>) {
  if (kind === 'failed') return <FailureNotice errorScope={errorScope} onRetry={onRetry} />;
  if (kind === 'missing-project') {
    return (
      <NoticeShell title="That project is unavailable">
        <p>
          It may have been deleted, or it belongs to a workspace you do not have access to. Choose
          another project to continue.
        </p>
        <NoticeLink href={noticeHref('/projects', workspaceId)}>Go to your projects</NoticeLink>
      </NoticeShell>
    );
  }
  return (
    <NoticeShell title="This workspace has no projects">
      <p>
        {mayCreate
          ? 'Your current access does not include another project.'
          : 'You have read-only access to this workspace.'}
      </p>
      <NoticeLink href={noticeHref('/settings', workspaceId)}>Open workspace settings</NoticeLink>
    </NoticeShell>
  );
}

/**
 * Say which read failed.
 *
 * Reporting a workspace failure when only the project list 403'd sent readers
 * looking for an access problem that was not there — the workspace had
 * resolved perfectly well.
 */
function FailureNotice({
  errorScope,
  onRetry,
}: Readonly<{ errorScope: FailureScope; onRetry: () => void }>) {
  const workspaceFailed = errorScope === 'workspace';
  return (
    <NoticeShell
      title={
        workspaceFailed ? 'Your workspace could not be loaded' : 'Projects could not be loaded'
      }
    >
      <p>
        Your session is active. Retry to load your{' '}
        {workspaceFailed ? 'workspace and its projects' : 'projects and allowance'}.
      </p>
      <Button variant="secondary" className="w-fit" onClick={onRetry}>
        Retry
      </Button>
    </NoticeShell>
  );
}

/**
 * Carry the workspace out of a notice.
 *
 * These links are the reader's only way forward from a dead end, and the
 * workspace they are in is not necessarily the one that resolves by default.
 * Naming it keeps the destination in the same workspace even when device
 * storage is unavailable.
 */
function noticeHref(pathname: string, workspaceId: string | null): string {
  return workspaceId ? workspaceDestination(pathname, null, workspaceId) : pathname;
}

function NoticeLink({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <Button asChild variant="secondary" className="w-fit">
      <Link to={href}>{children}</Link>
    </Button>
  );
}

function NoticeShell({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="grid min-h-[60vh] place-items-center py-[var(--page-section-gap)]">
      <Alert tone="warning" className="max-w-lg">
        <div className="grid gap-4">
          <h1 className={textRole('sectionTitle')}>{title}</h1>
          {children}
        </div>
      </Alert>
    </section>
  );
}
