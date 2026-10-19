import { useEffect, useReducer, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, Link } from 'react-router-dom';
import { z } from 'zod';
import { workspacesApi } from '@/lib/api/workspaces';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/query-keys';
import { workspaceAccessSchema as accessSchema } from '@citeladder/contracts/auth';
import { useProjectContext } from '@/lib/project/project-context';
import { isWorkspaceFreeRoute } from '@/lib/project/bootstrap';
import { routePath } from '@/lib/navigation/route-path';
import { contactSalesHref } from '@/lib/config/contact';
import { websiteHref } from '@/lib/config/app-link';
import { getBootstrapReadTimeoutMs } from '@/lib/config/operational';
import { signOut } from '@/lib/auth/account-transition';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Stack } from '@/components/ui/layout';
import { ShellFallback } from '@/components/layout/shell-fallback';
import { Dialog } from '@/components/ui/dialog';
import AccountSecurity from '@/components/settings/account-security';
import { SettingsSections } from '@/components/settings/settings-section';
import { RestorePlan } from '@/components/billing/restore-plan';

function accessAllowed(access: z.infer<typeof accessSchema> | undefined, deadline: number | null) {
  return Boolean(
    access &&
    ['active', 'trial_active'].includes(access.status) &&
    (deadline === null || Date.now() < deadline),
  );
}

function accessTitle(access: z.infer<typeof accessSchema> | undefined, deadline: number | null) {
  if (access?.status === 'subscription_lapsed') return 'Your plan has ended';
  return access?.status === 'trial_expired' ||
    (access?.status === 'trial_active' && deadline !== null && Date.now() >= deadline)
    ? 'Your trial has ended'
    : 'Workspace access';
}

/** Reads that serve recovery: identity, workspaces, and any query marked `accessRecovery`. */
function recoveryQuery(query: { queryKey: readonly unknown[]; meta?: Record<string, unknown> }) {
  const key = query.queryKey;
  return (
    key[0] === 'auth' ||
    (key[0] === 'workspaces' && ['list', 'access'].includes(String(key[1]))) ||
    query.meta?.accessRecovery === true
  );
}

/** A trial or plan that ended can be restored by buying a plan; anything else cannot. */
function restorable(access: z.infer<typeof accessSchema> | undefined, deadline: number | null) {
  return (
    access?.status === 'trial_expired' ||
    access?.status === 'subscription_lapsed' ||
    (access?.status === 'trial_active' && deadline !== null && Date.now() >= deadline)
  );
}

function useAccessLoss(workspaceId: string | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    const denied = (error: unknown) => {
      if (
        !(error instanceof ApiError) ||
        !['trial_expired', 'subscription_lapsed', 'access_unresolved'].includes(error.code ?? '')
      )
        return;
      // The response may belong to a workspace the user just left. Re-resolve
      // the current authority rather than copying that denial to another scope.
      void client.resetQueries({ queryKey: queryKeys.workspaces.access(workspaceId), exact: true });
    };
    const queries = client.getQueryCache().subscribe((event) => {
      if (!recoveryQuery(event.query)) denied(event.query.state.error);
    });
    const mutations = client
      .getMutationCache()
      .subscribe((event) => denied(event.mutation?.state.error));
    return () => {
      queries();
      mutations();
    };
  }, [client, workspaceId]);
}

export function WorkspaceAccessGate({ children }: Readonly<{ children: ReactNode }>) {
  const {
    activeWorkspaceId,
    workspaces,
    status,
    isLoading: workspaceLoading,
    retry: retryWorkspaces,
  } = useProjectContext();
  const location = useLocation();
  const client = useQueryClient();
  // Re-renders once the access deadline passes, so the expired grant is
  // re-evaluated against the clock.
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useAccessLoss(activeWorkspaceId);
  // Accepting an invitation, choosing a workspace and setting up your own never
  // wait on the selected workspace's access; someone with no workspace has none.
  const recovery =
    routePath(location.pathname) === '/invitations/accept' ||
    isWorkspaceFreeRoute(location.pathname, location.search) ||
    status === 'no_workspace';
  const access = useQuery({
    queryKey: queryKeys.workspaces.access(activeWorkspaceId ?? ''),
    enabled: Boolean(activeWorkspaceId) && !recovery,
    queryFn: ({ signal }) =>
      workspacesApi.access(String(activeWorkspaceId), {
        signal,
        timeoutMs: getBootstrapReadTimeoutMs(),
      }),
    // The bootstrap loader has just fetched this answer; reuse it rather than
    // asking again on mount. Expiry, product 403s and focus still recheck.
    refetchOnWindowFocus: 'always',
  });
  const deadline = access.data?.expires_at ? Date.parse(access.data.expires_at) : null;
  const { refetch } = access;
  useEffect(() => {
    if (deadline === null) return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (Date.now() < deadline) {
            schedule();
            return;
          }
          tick();
          void refetch();
        },
        Math.max(0, Math.min(2_147_483_647, deadline - Date.now())),
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [deadline, refetch]);
  const allowed = accessAllowed(access.data, deadline);
  const checking = activeWorkspaceId ? access.isPending : workspaceLoading;
  useEffect(() => {
    if (!access.data || allowed || recovery) return;
    void client.cancelQueries({
      predicate: (query) => !recoveryQuery(query),
    });
    client.removeQueries({
      predicate: (query) => !recoveryQuery(query),
    });
  }, [allowed, access.data, client, recovery]);
  if (recovery || allowed) return children;
  if (checking) return <ShellFallback />;
  return (
    <AccessEnded
      title={accessTitle(access.data, deadline)}
      restorable={restorable(access.data, deadline)}
      activeWorkspaceId={activeWorkspaceId}
      workspaces={workspaces}
      onRetry={() => (activeWorkspaceId ? void access.refetch() : retryWorkspaces())}
    />
  );
}

/** Where a workspace without access lands: buy a plan, ask support, switch, or leave. */
function AccessEnded({
  title,
  restorable: canRestore,
  activeWorkspaceId,
  workspaces,
  onRetry,
}: Readonly<{
  title: string;
  restorable: boolean;
  activeWorkspaceId: string | null;
  workspaces: readonly { id: string; name: string }[];
  onRetry: () => void;
}>) {
  const client = useQueryClient();
  const [securityOpen, setSecurityOpen] = useState(false);
  return (
    <ShellFallback>
      <Stack as="main" gap="workspace" className="mx-auto w-full max-w-xl content-center p-8">
        <h1>{title}</h1>
        <Alert tone="info">
          {canRestore
            ? 'Your data is retained. Choose a plan to continue, contact support, or switch to another workspace.'
            : 'Your data is retained. Contact support to restore access, or switch to another workspace.'}
        </Alert>
        {activeWorkspaceId && canRestore ? <RestorePlan workspaceId={activeWorkspaceId} /> : null}
        <a href={contactSalesHref(undefined, websiteHref('/contact'))}>Contact support</a>
        <Button className="w-fit" onClick={onRetry}>
          Retry
        </Button>
        {workspaces
          .filter((workspace) => workspace.id !== activeWorkspaceId)
          .map((workspace) => (
            <Link key={workspace.id} reloadDocument to={`/projects?workspace=${workspace.id}`}>
              {workspace.name}
            </Link>
          ))}
        <Button className="w-fit" variant="secondary" onClick={() => setSecurityOpen(true)}>
          Account security
        </Button>
        <Dialog open={securityOpen} onOpenChange={setSecurityOpen} title="Account security">
          <SettingsSections>
            <AccountSecurity />
          </SettingsSections>
        </Dialog>
        <Button className="w-fit" variant="secondary" onClick={() => void signOut(client)}>
          Sign out
        </Button>
      </Stack>
    </ShellFallback>
  );
}
