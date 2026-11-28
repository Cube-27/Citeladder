import { lazy, useEffect, useReducer, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useLocation, Link } from 'react-router-dom';
import { z } from 'zod';
import {
  dropProductReads,
  isAccessRecoveryQuery,
  resetWorkspaceAccess,
  workspaceQueries,
} from '@/lib/api/workspaces';
import { ApiError } from '@/lib/api/errors';
import { workspaceAccessSchema as accessSchema } from '@citeladder/contracts/auth';
import { useProjectContext } from '@/lib/project/project-context';
import { isWorkspaceFreeRoute } from '@/lib/project/bootstrap';
import { routePath } from '@/lib/navigation/route-path';
import { contactSalesHref } from '@/lib/config/contact-sales';
import { websiteHref } from '@/lib/config/app-link';
import { signOut } from '@/lib/auth/account-transition';
import { Button } from '@/components/ui/button';
import { FirstFrame, GateHold } from '@/components/layout/first-frame';
import { PageFrame } from '@/components/templates/page-frame';
import { HOME_PATH } from '@/lib/navigation/app-routes';
import { useSelectWorkspace, workspaceDestination } from '@/lib/navigation/project-destination';
import { NoticeScreen } from '@/components/templates/notice-page';
import { Dialog } from '@/components/ui/dialog';
import { IslandUnavailable, LazyIsland } from '@/components/ui/lazy-island';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { SectionStack } from '@/components/ui/section';
import { TextLink } from '@/components/ui/text-link';

const AccountSecurity = lazy(() => import('@/components/settings/account-security'));
const RestorePlan = lazy(() =>
  import('@/components/billing/restore-plan').then(({ RestorePlan }) => ({ default: RestorePlan })),
);

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
      void resetWorkspaceAccess(client, workspaceId);
    };
    const queries = client.getQueryCache().subscribe((event) => {
      if (!isAccessRecoveryQuery(event.query)) denied(event.query.state.error);
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
    isError: workspaceFailed,
    retry: retryWorkspaces,
  } = useProjectContext();
  const location = useLocation();
  const client = useQueryClient();
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useAccessLoss(activeWorkspaceId);
  const recovery =
    routePath(location.pathname) === '/invitations/accept' ||
    isWorkspaceFreeRoute(location.pathname, location.search) ||
    status === 'no_workspace';
  const access = useQuery({
    ...workspaceQueries.access(activeWorkspaceId ?? ''),
    enabled: Boolean(activeWorkspaceId) && !recovery,
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
    dropProductReads(client);
  }, [allowed, access.data, client, recovery]);
  if (recovery || allowed || checking) {
    return <GateHold held={!recovery && !allowed}>{children}</GateHold>;
  }
  const retry = () => (activeWorkspaceId ? void access.refetch() : retryWorkspaces());
  const failure = failedRead({ access, activeWorkspaceId, workspaceFailed });
  if (failure) {
    return (
      <FirstFrame>
        <PageFrame>
          <StateBlock
            kind="error"
            title="Couldn't load workspace access"
            error={failure.error}
            fallback="The request failed or timed out."
            onRetry={retry}
            pending={access.isFetching}
          />
        </PageFrame>
      </FirstFrame>
    );
  }
  return (
    <AccessEnded
      title={accessTitle(access.data, deadline)}
      restorable={restorable(access.data, deadline)}
      activeWorkspaceId={activeWorkspaceId}
      workspaces={workspaces}
      onRetry={retry}
    />
  );
}

function failedRead({
  access,
  activeWorkspaceId,
  workspaceFailed,
}: Readonly<{
  access: Pick<UseQueryResult<unknown>, 'isError' | 'data' | 'error'>;
  activeWorkspaceId: string | null;
  workspaceFailed: boolean;
}>): Readonly<{ error: unknown }> | null {
  if (!activeWorkspaceId) return workspaceFailed ? { error: null } : null;
  return access.isError && !access.data ? { error: access.error } : null;
}

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
  const selectWorkspace = useSelectWorkspace();
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  const leave = useMutation({ mutationFn: () => signOut(client) });
  return (
    <FirstFrame>
      <NoticeScreen
        tone="warning"
        heading={title}
        actions={
          <>
            <Button variant="primary" onClick={onRetry}>
              Retry
            </Button>
            <Button asChild variant="secondary">
              <a href={contactSalesHref(undefined, websiteHref('/contact'))}>Contact support</a>
            </Button>
            <Button variant="secondary" onClick={() => setSecurityOpen(true)}>
              Account security
            </Button>
            <Button
              variant="secondary"
              onClick={() => leave.mutate()}
              pending={leave.isPending}
              pendingLabel="Signing out…"
            >
              Sign out
            </Button>
          </>
        }
        panels={
          activeWorkspaceId && canRestore ? (
            <LazyIsland
              loading={<StateBlock kind="loading" shape={{ kind: 'list' }} />}
              failed={
                <IslandUnavailable message="Couldn't load plans. Reload the page to try again." />
              }
              label="restore-plan"
              defects="surface"
            >
              <RestorePlan workspaceId={activeWorkspaceId} />
            </LazyIsland>
          ) : null
        }
      >
        {workspaces
          .filter((workspace) => workspace.id !== activeWorkspaceId)
          .map((workspace) => (
            <TextLink key={workspace.id} asChild text="inherit">
              <Link
                to={workspaceDestination(HOME_PATH, null, workspace.id)}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.altKey ||
                    event.ctrlKey ||
                    event.shiftKey
                  )
                    return;
                  event.preventDefault();
                  selectWorkspace(workspace.id, HOME_PATH);
                }}
              >
                {workspace.name}
              </Link>
            </TextLink>
          ))}
        {leave.isError ? (
          <Notice tone="negative">Sign out failed. Your session is still active. Try again.</Notice>
        ) : null}
      </NoticeScreen>
      <Dialog open={securityOpen} onOpenChange={setSecurityOpen} title="Account security">
        <SectionStack>
          <LazyIsland
            loading={<StateBlock kind="loading" shape={{ kind: 'facts', rows: 2 }} />}
            failed={
              <IslandUnavailable message="Couldn't load account security. Reload the page to try again." />
            }
            label="account-security"
            defects="surface"
          >
            <AccountSecurity />
          </LazyIsland>
        </SectionStack>
      </Dialog>
    </FirstFrame>
  );
}
