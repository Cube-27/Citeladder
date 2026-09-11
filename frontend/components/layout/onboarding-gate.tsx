'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { ShellFallback } from '@/components/layout/shell-fallback';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { textRole } from '@/components/ui/typography';
import { capabilityRemaining, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import type { SelectionStatus } from '@/lib/project/selection';

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

/** Which standing notice, if any, this state owes the reader. */
type NoticeKind = 'failed' | 'missing-project' | 'no-projects' | null;

function noticeFor(
  status: SelectionStatus,
  { projectRequired, redirecting }: { projectRequired: boolean; redirecting: boolean },
): NoticeKind {
  if (status === 'error') return 'failed';
  if (status === 'unavailable') return 'missing-project';
  // An empty workspace that is NOT being redirected has nowhere else to go:
  // say so once rather than bouncing off a creation screen that would refuse.
  if (status === 'empty' && projectRequired && !redirecting) return 'no-projects';
  return null;
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
  const { status, activeWorkspaceId, activeWorkspace, retry } = useProjectContext();
  // Entitlement decides which controls the shell HAS — the Growth Agent
  // trigger, the capability-gated navigation rows — so waiting for it here is
  // what lets the shell paint complete instead of growing a button and a link
  // a round trip later. It resolves to a settled answer either way.
  const { isLoading: entitlementLoading, usage, usageIsLoading } = useEntitlement();

  // A Viewer reads what exists; it never starts the creation flow.
  const mayCreate = activeWorkspace?.role !== 'viewer';
  const remaining = capabilityRemaining(usage, PROJECT_SLOTS_CAPABILITY);
  const hasAllowance = !usageIsLoading && remaining !== undefined && remaining > 0;
  const projectRequired = !isWorkspaceOnlyRoute(pathname);
  const redirecting = status === 'empty' && projectRequired && mayCreate && hasAllowance;

  useOnboardingRedirect(redirecting, activeWorkspaceId);

  const notice = noticeFor(status, { projectRequired, redirecting });
  if (notice) return <GateNotice kind={notice} mayCreate={mayCreate} onRetry={retry} />;

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
  onRetry,
}: Readonly<{ kind: Exclude<NoticeKind, null>; mayCreate: boolean; onRetry: () => void }>) {
  if (kind === 'failed') {
    return (
      <NoticeShell title="Your workspace could not be loaded">
        <p>Your session is active. Retry to load your workspace and projects.</p>
        <Button variant="secondary" className="w-fit" onClick={onRetry}>
          Retry
        </Button>
      </NoticeShell>
    );
  }
  if (kind === 'missing-project') {
    return (
      <NoticeShell title="That project is unavailable">
        <p>
          It may have been deleted, or it belongs to a workspace you do not have access to. Choose
          another project to continue.
        </p>
        <NoticeLink href="/projects">Go to your projects</NoticeLink>
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
      <NoticeLink href="/settings">Open workspace settings</NoticeLink>
    </NoticeShell>
  );
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
