import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { NoticePage } from '@/components/templates/notice-page';
import { refetchBilling } from '@/lib/api/billing';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { isWorkspaceOnlyRoute } from '@/lib/navigation/app-routes';
import { useCanonicalProjectUrl, workspaceDestination } from '@/lib/navigation/project-destination';
import {
  resolveAllowance,
  resolveGate,
  WORKSPACE_SETUP_PATH,
  type NoticeKind,
} from '@/lib/project/bootstrap';
import { ActiveProjectScopeProvider } from '@/lib/project/active-project-scope';
import { useProjectContext } from '@/lib/project/project-context';
import type { FailureScope } from '@/lib/project/selection';

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
    activeProject,
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
    void refetchBilling(queryClient);
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

  // The route's masthead over the loading notice, so the shell never shows a bare page.
  if (state === 'redirecting')
    return <NoticePage tone="loading" heading="Opening project setup…" />;
  if (state === 'loading') return <NoticePage tone="loading" heading="Loading your workspace…" />;
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

  // A ready project-required route always has its project resolved; the
  // screen receives it non-null instead of re-checking the selection. Keyed by
  // the project, so a switch remounts the route: no draft, filter or mutation
  // outcome of one project carries into the next, while view state held in the
  // URL still does.
  if (projectRequired && activeProject) {
    return (
      <ActiveProjectScopeProvider
        key={`${activeProject.workspace_id}:${activeProject.id}`}
        project={activeProject}
      >
        {children}
      </ActiveProjectScopeProvider>
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
    if (!redirecting) return;
    // Someone with no workspace yet sets up their own before any project.
    router(
      workspaceId ? workspaceDestination('/onboarding', null, workspaceId) : WORKSPACE_SETUP_PATH,
      { replace: true },
    );
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
      <NoticePage
        tone="warning"
        heading="That project is unavailable"
        actions={
          <NoticeLink href={noticeHref('/projects', workspaceId)}>Go to your projects</NoticeLink>
        }
      >
        It may have been deleted, or it belongs to a workspace you do not have access to. Choose
        another project to continue.
      </NoticePage>
    );
  }
  return (
    <NoticePage
      tone="info"
      heading="This workspace has no projects"
      actions={
        <NoticeLink href={noticeHref('/settings', workspaceId)}>Open workspace settings</NoticeLink>
      }
    >
      {mayCreate
        ? 'Your current access does not include another project.'
        : 'You have read-only access to this workspace.'}
    </NoticePage>
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
    <NoticePage
      tone="negative"
      heading={
        workspaceFailed ? 'Your workspace could not be loaded' : 'Projects could not be loaded'
      }
      actions={
        <Button variant="primary" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      Your session is active. Retry to load your{' '}
      {workspaceFailed ? 'workspace and its projects' : 'projects and allowance'}.
    </NoticePage>
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
    <Button asChild variant="primary">
      <Link to={href}>{children}</Link>
    </Button>
  );
}
