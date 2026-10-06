import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, Link } from 'react-router-dom';
import { z } from 'zod';
import { workspacesApi } from '@/lib/api/workspaces';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/query-keys';
import { workspaceAccessSchema as accessSchema } from '@citeladder/contracts/auth';
import { authApi } from '@/lib/api/auth';
import { useProjectContext } from '@/lib/project/project-context';
import { contactSalesHref } from '@/lib/config/contact';
import { websiteHref } from '@/lib/config/app-link';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ShellFallback } from '@/components/layout/shell-fallback';

function accessAllowed(access: z.infer<typeof accessSchema> | undefined, deadline: number | null) {
  return Boolean(
    access &&
    ['active', 'trial_active'].includes(access.status) &&
    (deadline === null || Date.now() < deadline),
  );
}

function accessTitle(access: z.infer<typeof accessSchema> | undefined, deadline: number | null) {
  return access?.status === 'trial_expired' || (deadline !== null && Date.now() >= deadline)
    ? 'Your trial has ended'
    : 'Workspace access';
}

function recoveryQuery(key: readonly unknown[]) {
  return (
    key[0] === 'auth' || (key[0] === 'workspaces' && ['list', 'access'].includes(String(key[1])))
  );
}

function useAccessLoss(workspaceId: string | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    const denied = (error: unknown) => {
      if (
        !(error instanceof ApiError) ||
        !['trial_expired', 'access_unresolved'].includes(error.code ?? '')
      )
        return;
      client.setQueryData(queryKeys.workspaces.access(workspaceId), {
        status: error.code,
        expires_at: null,
      });
    };
    const queries = client.getQueryCache().subscribe((event) => denied(event.query.state.error));
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
  const { activeWorkspaceId, workspaces } = useProjectContext();
  const location = useLocation();
  const client = useQueryClient();
  const [, tick] = useState(0);
  useAccessLoss(activeWorkspaceId);
  const recovery =
    location.pathname === '/invitations/accept' || location.pathname === '/account-security';
  const access = useQuery({
    queryKey: queryKeys.workspaces.access(activeWorkspaceId ?? ''),
    enabled: Boolean(activeWorkspaceId) && !recovery,
    queryFn: ({ signal }) => workspacesApi.access(String(activeWorkspaceId), { signal }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const deadline = access.data?.expires_at ? Date.parse(access.data.expires_at) : null;
  const { refetch } = access;
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setTimeout(
      () => {
        tick((value) => value + 1);
        void refetch();
      },
      Math.max(0, deadline - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [deadline, refetch]);
  const allowed = accessAllowed(access.data, deadline);
  useEffect(() => {
    if (!access.data || allowed || recovery) return;
    void client.cancelQueries({
      predicate: (query) => !recoveryQuery(query.queryKey),
    });
    client.removeQueries({
      predicate: (query) => !recoveryQuery(query.queryKey),
    });
  }, [allowed, access.data, client, recovery]);
  if (recovery || allowed) return children;
  return (
    <ShellFallback>
      <div className="grid gap-4">
        <h1>{accessTitle(access.data, deadline)}</h1>
        <Alert tone="info">
          {access.isPending
            ? 'Checking your access…'
            : 'Your data is retained. Contact support to restore access, or switch to another workspace.'}
        </Alert>
        {!access.isPending && (
          <a href={contactSalesHref(undefined, websiteHref('/contact'))}>Contact support</a>
        )}
        {access.isError && <Button onClick={() => void access.refetch()}>Retry</Button>}
        {workspaces
          .filter((workspace) => workspace.id !== activeWorkspaceId)
          .map((workspace) => (
            <Link key={workspace.id} reloadDocument to={`/projects?workspace=${workspace.id}`}>
              {workspace.name}
            </Link>
          ))}
        <Link to="/account-security">Account security</Link>
        <Button
          variant="secondary"
          onClick={async () => {
            await authApi.logout();
            client.clear();
            hardNavigate('/login');
          }}
        >
          Sign out
        </Button>
      </div>
    </ShellFallback>
  );
}
