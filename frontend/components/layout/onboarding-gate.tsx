'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { ShellFallback } from '@/components/layout/shell-fallback';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { textRole } from '@/components/ui/typography';
import type { BillingUsage } from '@/lib/api/billing';
import { capabilityRemaining, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import type { FailureScope, SelectionStatus } from '@/lib/project/selection';

/**
 * Routes that manage the WORKSPACE rather than work inside a project.
 *
 * A workspace with no projects is a perfectly valid workspace: its owner may
 * still need to reach billing, members and settings. Redirecting these to
 * project creation answered a question nobody asked and made an empty
 * workspace unmanageable.
 */
const WORKSPACE_ONLY_PREFIXES = ['/settings'] as const;

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

function resolveAllowance({
  usage,
  usageIsLoading,
  usageIsError,
}: {
  usage: BillingUsage | null;
  usageIsLoading: boolean;
  usageIsError: boolean;
}): Allowance {
  if (usageIsLoading || usageIsError) return 'unknown';
  const remaining = capabilityRemaining(usage, PROJECT_SLOTS_CAPABILITY);
  if (remaining === undefined) return 'unknown';
  return remaining > 0 ? 'spare' : 'spent';
}

/** Which standing notice, if any, this state owes the reader. */
type NoticeKind = 'failed' | 'missing-project' | 'no-projects' | null;

type NoticeInputs = {
  projectRequired: boolean;
  redirecting: boolean;
  /** The allowance read failed, so no statement about capacity is truthful. */
  allowanceFailed: boolean;
};

function noticeFor(
  status: SelectionStatus,
  { projectRequired, redirecting, allowanceFailed }: NoticeInputs,
): NoticeKind {
  if (status === 'error') return 'failed';
  if (status === 'unavailable') return 'missing-project';
  if (status !== 'empty' || !projectRequired || redirecting) return null;
  // "Your access does not include another project" is a claim about the
  // allowance. With the allowance read failed it is not a claim we can make,
  // so offer the retry instead of asserting a limit that may not exist.
  return allowanceFailed ? 'failed' : 'no-projects';
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
  const pathname = usePathname();
  const { status, errorScope, activeWorkspaceId, activeWorkspace, retry } = useProjectContext();
  // Entitlement decides which controls the shell HAS — the Growth Agent
  // trigger, the capability-gated navigation rows — so waiting for it here is
  // what lets the shell paint complete instead of growing a button and a link
  // a round trip later. It resolves to a settled answer either way.
  const { isLoading: entitlementLoading, usage, usageIsLoading, usageIsError } = useEntitlement();

  // A Viewer reads what exists; it never starts the creation flow.
  const mayCreate = activeWorkspace?.role !== 'viewer';
  const allowance = resolveAllowance({ usage, usageIsLoading, usageIsError });
  const projectRequired = !isWorkspaceOnlyRoute(pathname);
  const redirecting = status === 'empty' && projectRequired && mayCreate && allowance === 'spare';

  useOnboardingRedirect(redirecting, activeWorkspaceId);

  const notice = noticeFor(status, {
    projectRequired,
    redirecting,
    allowanceFailed: allowance === 'unknown',
  });
  if (notice) {
    return (
      <GateNotice
        kind={notice}
        mayCreate={mayCreate}
        workspaceId={activeWorkspaceId}
        // An allowance failure is a projects-side failure: the workspace
        // resolved, its remaining capacity did not.
        errorScope={errorScope ?? 'projects'}
        onRetry={retry}
      />
    );
  }

  // Ahead of the shell, and deliberately the SAME loader the session wait
  // showed: one uninterrupted state covers both round trips, and the chrome
  // that follows it is already complete. `redirecting` holds here too — the
  // redirect is already in flight, and drawing a workspace the visitor is
  // about to be taken out of would only be a flash of the wrong app.
  if (status === 'resolving' || entitlementLoading || redirecting) return <ShellFallback />;

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
  const router = useRouter();
  useEffect(() => {
    if (!redirecting || !workspaceId) return;
    router.replace(workspaceDestination('/onboarding', null, workspaceId));
  }, [redirecting, workspaceId, router]);
}

function GateNotice({
  kind,
  mayCreate,
  workspaceId,
  errorScope,
  onRetry,
}: Readonly<{
  kind: Exclude<NoticeKind, null>;
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
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function NoticeShell({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <main
      id="main"
      className="bg-shell grid min-h-dvh place-items-center p-[var(--page-section-gap)]"
    >
      <Alert tone="warning" className="max-w-lg">
        <div className="grid gap-4">
          <h1 className={textRole('sectionTitle')}>{title}</h1>
          {children}
        </div>
      </Alert>
    </main>
  );
}
