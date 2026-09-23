/**
 * Resolve the authenticated shell BEFORE anything mounts.
 *
 * The decision this makes — send an empty workspace to project creation, or
 * put the project back in the address — used to live in two `useEffect`s. An
 * effect cannot run until a render has already committed, so a cold load on an
 * account with no projects painted the bare shell, then the full application
 * chrome, then a loader, then another loader, and only then onboarding. The
 * sidebar and project switcher appeared and were thrown away for a flow that
 * has neither.
 *
 * A route loader runs before the route element renders at all, so the same
 * decision costs one paint instead of four. React Router shows the route's
 * `hydrateFallbackElement` while this runs.
 *
 * Everything it warms lands in the query cache under the keys the providers
 * below already read, so nothing downstream changes shape — the providers just
 * find their answers already there.
 */
import type { QueryClient } from '@tanstack/react-query';
import { redirect } from 'react-router-dom';

import { billingApi } from '@/lib/api/billing';
import { authApi } from '@/lib/api/auth';
import { httpErrorStatus } from '@/lib/api/client';
import { projectsApi } from '@/lib/api/projects';
import { getAppQueryClient } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import type { Project, Workspace } from '@/lib/api/types';
import { getBootstrapReadTimeoutMs } from '@/lib/config/operational';
import { projectDestination, workspaceDestination } from '@/lib/navigation/project-destination';
import {
  readStoredActiveProjectId,
  readStoredActiveWorkspaceId,
} from '@/lib/project/active-project-storage';
import { isWorkspaceOnlyRoute, resolveAllowance, resolveGate } from '@/lib/project/bootstrap';
import {
  pickActiveProject,
  resolveProjectId,
  resolveStatus,
  resolveWorkspaceId,
} from '@/lib/project/selection';

/**
 * Ask for something the decision needs, and treat any failure as "unknown".
 *
 * A read that fails must not become a redirect or an error boundary: the gate
 * below still renders, and it owns the retry notices that distinguish a failed
 * workspace read from a failed allowance read. Throwing here would replace
 * those with a generic route error and lose the distinction entirely.
 */
async function settle<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch {
    return null;
  }
}

/**
 * Confirm the session, or hand the visitor to sign-in.
 *
 * Only a 401 is an answer. Anything else is a transport problem, and
 * `SessionGuard` reports those properly with a retry, so the loader steps
 * aside rather than turning a network blip into a sign-out.
 */
async function requireSession(client: QueryClient): Promise<boolean> {
  try {
    await client.ensureQueryData({
      queryKey: queryKeys.auth.me(),
      queryFn: ({ signal }) => authApi.me({ signal, timeoutMs: getBootstrapReadTimeoutMs() }),
    });
    return true;
  } catch (error) {
    if (httpErrorStatus(error) === 401) throw redirect('/login');
    return false;
  }
}

type Scope = {
  workspaceId: string;
  workspaces: Workspace[];
  resolvedProject: Project | null;
  requestedProjectId: string | null;
};

/**
 * Which workspace this address is in, and the project it named if it named one.
 *
 * The explicitly requested project is fetched alongside the membership list
 * because it authorizes itself and identifies its own workspace — waiting for
 * a workspace to be guessed first is what made a freshly created project look
 * like it belonged somewhere else.
 */
async function resolveScope(client: QueryClient, url: URL): Promise<Scope | null> {
  const requestedProjectId = url.searchParams.get('project') || null;
  const urlWorkspaceId = url.searchParams.get('workspace') || null;

  // A membership list needs only the session cookie and a project detail only
  // its id; neither depends on the other's answer. Sent together they cost one
  // round trip instead of two — and one place to stall instead of two.
  const workspacesPending = settle<Workspace[]>(
    client.ensureQueryData({
      queryKey: queryKeys.workspaces.list(),
      queryFn: ({ signal }) =>
        projectsApi.listWorkspaces({
          signal,
          workspaceId: null,
          timeoutMs: getBootstrapReadTimeoutMs(),
        }),
    }),
  );
  const projectPending = requestedProjectId
    ? settle<Project>(
        client.ensureQueryData({
          queryKey: queryKeys.projects.detail(requestedProjectId),
          queryFn: ({ signal }) =>
            projectsApi.getProject(requestedProjectId, {
              signal,
              workspaceId: null,
              timeoutMs: getBootstrapReadTimeoutMs(),
            }),
        }),
      )
    : null;
  const workspaces = await workspacesPending;
  if (!workspaces) return null;
  const resolvedProject = await projectPending;

  // A URL naming both a workspace and a project from a DIFFERENT workspace is
  // rejected rather than reconciled, and the gate says so.
  if (urlWorkspaceId && resolvedProject && resolvedProject.workspace_id !== urlWorkspaceId) {
    return null;
  }

  const workspaceId = resolveWorkspaceId({
    projectWorkspaceId: resolvedProject?.workspace_id ?? null,
    urlWorkspaceId,
    selectedWorkspaceId: readStoredActiveWorkspaceId(),
    workspaces,
  });
  if (!workspaceId) return null;

  return { workspaceId, workspaces, resolvedProject, requestedProjectId };
}

/** The workspace's projects and its remaining allowance, asked together. */
function readWorkspaceState(client: QueryClient, workspaceId: string) {
  return Promise.all([
    settle<Project[]>(
      client.ensureQueryData({
        queryKey: queryKeys.projects.list(workspaceId),
        queryFn: ({ signal }) =>
          projectsApi.listProjects({
            signal,
            workspaceId,
            timeoutMs: getBootstrapReadTimeoutMs(),
          }),
      }),
    ),
    settle(
      client.ensureQueryData({
        queryKey: queryKeys.billing.workspaceEntitlement(workspaceId),
        queryFn: ({ signal }) =>
          billingApi.workspaceEntitlement(workspaceId, {
            signal,
            timeoutMs: getBootstrapReadTimeoutMs(),
          }),
      }),
    ),
  ]);
}

/**
 * Which project is active, and how far the shell has got towards knowing.
 *
 * Every input here is settled — the loader does not return until the reads
 * have — so the pending flags the provider needs at render time are all false.
 * The algebra itself is `lib/project/selection.ts`, shared with the provider so
 * the loader cannot answer differently from the tree it is seeding.
 */
function resolveSelection(scope: Scope, listed: Project[]) {
  const { workspaceId, resolvedProject, requestedProjectId } = scope;
  // Include an authorized detail the list may predate.
  const known = listed.some((project) => project.id === resolvedProject?.id);
  const projects = resolvedProject && !known ? [...listed, resolvedProject] : listed;
  const activeProjectId = resolveProjectId({
    requestedProjectId,
    selectedProjectId: readStoredActiveProjectId(),
    projects,
    listSettled: true,
  });
  const status = resolveStatus({
    contradictoryRequest: false,
    requestedProjectPending: false,
    requestedProjectMissing: requestedProjectId !== null && resolvedProject === null,
    failed: false,
    workspaceId,
    activeProjectId,
    hasResolvedProject: pickActiveProject(resolvedProject, projects, activeProjectId) !== null,
    listSettled: true,
  });
  return { activeProjectId, status };
}

export async function bootstrapPrivateRoutes({ request }: { request: Request }) {
  const client = getAppQueryClient();
  const url = new URL(request.url);

  // `me` and the membership list need only the session cookie — the tree's own
  // providers already issue them in parallel, and the loader pays for every
  // round trip it serializes. A 401 still rejects first: Promise.all settles
  // on the earliest rejection, so the sign-in redirect is not held up by the
  // reads it makes moot.
  const [sessionResolved, scope] = await Promise.all([
    requireSession(client),
    resolveScope(client, url),
  ]);
  if (!sessionResolved || !scope) return null;

  const { workspaceId, workspaces, requestedProjectId } = scope;
  const [listed, entitlement] = await readWorkspaceState(client, workspaceId);
  if (!listed) return null;

  const { activeProjectId, status } = resolveSelection(scope, listed);
  const projectRequired = !isWorkspaceOnlyRoute(url.pathname);
  const decision = resolveGate(status, {
    projectRequired,
    mayCreate: workspaces.some(
      (workspace) => workspace.id === workspaceId && workspace.capabilities.includes('write'),
    ),
    allowance: resolveAllowance(entitlement ?? null),
    entitlementLoading: false,
  });

  // Only a workspace whose list came back successfully EMPTY, with creation
  // permitted by role and allowance, is sent to setup. Every other state —
  // a failed read, an unresolved allowance, a project that is merely missing —
  // falls through and is answered by `OnboardingGate`, which owns those
  // notices and their retries.
  if (decision === 'redirecting') {
    throw redirect(workspaceDestination('/onboarding', null, workspaceId));
  }

  // The address gains the project it is already showing. This was an effect
  // that fired a frame after landing, so the URL visibly rewrote itself.
  if (decision === 'ready' && projectRequired && activeProjectId && !requestedProjectId) {
    throw redirect(
      `${projectDestination(url.pathname, url.searchParams, activeProjectId)}${url.hash}`,
    );
  }

  return null;
}
