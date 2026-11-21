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

import { RouteLoadingScreen } from './page-shell';

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
  const retry = () => {
    retryContext();
    void refetchBilling(queryClient);
  };
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

  if (state === 'redirecting')
    return <NoticePage tone="loading" heading="Opening project setup…" />;
  if (state === 'loading') return <RouteLoadingScreen />;
  if (state !== 'ready') {
    return (
      <GateNotice
        kind={state}
        mayCreate={mayCreate}
        workspaceId={activeWorkspaceId}
        errorScope={errorScope ?? 'projects'}
        onRetry={retry}
      />
    );
  }

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

function useOnboardingRedirect(redirecting: boolean, workspaceId: string | null) {
  const router = useNavigate();
  useEffect(() => {
    if (!redirecting) return;
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
