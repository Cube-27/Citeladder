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
import { HOME_PATH } from '@/lib/navigation/app-routes';
import { useSelectWorkspace, workspaceDestination } from '@/lib/navigation/project-destination';
import { NoticeScreen } from '@/components/templates/notice-page';
import { Dialog } from '@/components/ui/dialog';
import { IslandUnavailable, LazyIsland } from '@/components/ui/lazy-island';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { SectionStack } from '@/components/ui/section';
import { TextLink } from '@/components/ui/text-link';

// Shown only once access has ended, so the plan checkout and account security
// load on demand instead of in the shell's first chunk.
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
    ...workspaceQueries.access(activeWorkspaceId ?? ''),
    enabled: Boolean(activeWorkspaceId) && !recovery,
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
    dropProductReads(client);
  }, [allowed, access.data, client, recovery]);
  // Hold rather than swap: a workspace switch keeps the shell mounted and its
  // reads alive, and `HeldContent` keeps product content out until access
  // answers. One shape for open and held, so neither remounts the tree.
  if (recovery || allowed || checking) {
    return <GateHold held={!recovery && !allowed}>{children}</GateHold>;
  }
  const retry = () => (activeWorkspaceId ? void access.refetch() : retryWorkspaces());
  // A read that failed says nothing about access: it is a retryable error,
  // never the "access ended" screen, which needs an answer that says so.
  const failure = failedRead({ access, activeWorkspaceId, workspaceFailed });
  if (failure) {
    return (
      <FirstFrame>
        <StateBlock
          kind="error"
          title="Couldn't load workspace access"
          error={failure.error}
          fallback="The request failed or timed out."
          onRetry={retry}
          pending={access.isFetching}
        />
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

/**
 * The failed read behind an unanswered gate: the access read of the selected
 * workspace, or workspace discovery when none is selected. Null when nothing failed.
 */
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
      >
        <p>Your data is retained.</p>
        {activeWorkspaceId && canRestore ? (
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
        ) : null}
        {workspaces
          .filter((workspace) => workspace.id !== activeWorkspaceId)
          .map((workspace) => (
            <TextLink key={workspace.id} asChild text="inherit">
              <Link
                to={workspaceDestination(HOME_PATH, null, workspace.id)}
                onClick={(event) => {
                  // A modified click opens the link's own URL in a new tab.
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
          <Notice tone="negative">
            Sign out failed. Your session is still active; please try again.
          </Notice>
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
