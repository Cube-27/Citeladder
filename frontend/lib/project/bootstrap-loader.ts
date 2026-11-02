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
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';
import { httpErrorStatus } from '@/lib/api/client';
import { policiesApi } from '@/lib/api/policies';
import { projectQueries, projectsApi } from '@/lib/api/projects';
import { workspacesApi } from '@/lib/api/workspaces';
import { getAppQueryClient } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import type { Project, Workspace } from '@/lib/api/types';
import { getBootstrapReadTimeoutMs } from '@/lib/config/operational';
import { projectDestination, workspaceDestination } from '@/lib/navigation/project-destination';
import { prefetchRoute } from '@/lib/navigation/route-prefetch';
import { routePath } from '@/lib/navigation/route-path';
import {
  readStoredActiveProjectId,
  readStoredActiveWorkspaceId,
} from '@/lib/project/active-project-storage';
import {
  isWorkspaceFreeRoute,
  isWorkspaceOnlyRoute,
  resolveAllowance,
  resolveGate,
} from '@/lib/project/bootstrap';
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
    if (httpErrorStatus(error) === 401)
      throw redirect(
        withAuthReturnPath(
          '/login',
          safeAuthReturnPath(window.location.pathname + window.location.search),
        ),
      );
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
 * Start the landing screen's primary read as soon as its project is known.
 *
 * A cache warm under the screen's own query key, never a render: the session,
 * access and Terms gates still decide whether anything mounts, the access gate
 * clears product queries for a workspace without access, and the backend
 * authorizes every read. Only an address naming nothing but its scope is
 * warmed — the prefetchers warm each screen's default view, and filters in the
 * address ask for a different key.
 */
function warmScreen(client: QueryClient, url: URL, project: Project) {
  const scopeOnly = [...url.searchParams.keys()].every(
    (key) => key === 'project' || key === 'workspace',
  );
  if (!scopeOnly) return;
  prefetchRoute(client, url.pathname, {
    projectId: project.id,
    workspaceId: project.workspace_id,
  });
}

/**
 * The explicitly requested project, in as few reads as possible.
 *
 * A returning reader's address names a project in the workspace they last
 * used, and that workspace's list is a read the shell needs anyway. Asked
 * first, it answers for the project too — the list's members are the same
 * authorized objects the detail read returns — so the separate detail read
 * runs only when the list cannot answer: no remembered workspace, a list the
 * backend refused, or a project that is not in it (another workspace's, or one
 * created after the list was read). The detail read still authorizes from the
 * path, so a stale or foreign remembered workspace can never hide a project.
 */
async function findRequestedProject(
  client: QueryClient,
  projectId: string,
  candidateWorkspaceId: string | null,
): Promise<Project | null> {
  if (candidateWorkspaceId) {
    const listed = await settle(client.ensureQueryData(projectQueries.list(candidateWorkspaceId)));
    const project = listed?.find((candidate) => candidate.id === projectId);
    if (project) return project;
  }
  return settle(client.ensureQueryData(projectQueries.detail(projectId)));
}

/**
 * Resolve the requested project and, once it names its workspace, start its
 * screen's reads beside the gate reads rather than after the shell mounts. A
 * project contradicting the address's workspace is rejected by the caller and
 * warms nothing.
 */
async function requestedProject(
  client: QueryClient,
  url: URL,
  projectId: string,
  urlWorkspaceId: string | null,
): Promise<Project | null> {
  const project = await findRequestedProject(
    client,
    projectId,
    urlWorkspaceId ?? readStoredActiveWorkspaceId(),
  );
  if (project && (!urlWorkspaceId || project.workspace_id === urlWorkspaceId))
    warmScreen(client, url, project);
  return project;
}

/**
 * Which workspace this address is in, and the project it named if it named one.
 *
 * The explicitly requested project is resolved alongside the membership list
 * because it authorizes itself and identifies its own workspace — waiting for
 * a workspace to be guessed first is what made a freshly created project look
 * like it belonged somewhere else.
 */
async function resolveScope(client: QueryClient, url: URL): Promise<Scope | null> {
  const requestedProjectId = url.searchParams.get('project') || null;
  const urlWorkspaceId = url.searchParams.get('workspace') || null;

  // A membership list needs only the session cookie and the project only its
  // id; neither depends on the other's answer. Sent together they cost one
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
    ? requestedProject(client, url, requestedProjectId, urlWorkspaceId)
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
  if (!workspaceId) {
    // Someone who belongs to no workspace yet creates their own first.
    if (workspaces.length === 0 && !isWorkspaceOnlyRoute(url.pathname))
      throw redirect('/onboarding');
    return null;
  }

  return { workspaceId, workspaces, resolvedProject, requestedProjectId };
}

/**
 * The workspace's projects, remaining allowance and access, asked together.
 *
 * The Terms status rides along only to warm the policy gate's cache: without
 * it the gate had nothing to answer from on a reload and held the page on a
 * loader for one more round trip. Its outcome decides nothing here.
 */
function readWorkspaceState(client: QueryClient, workspaceId: string, pathname: string) {
  void client.prefetchQuery({
    queryKey: queryKeys.policies.workspace(workspaceId),
    queryFn: ({ signal }) => policiesApi.status(workspaceId, signal),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return Promise.all([
    settle<Project[]>(client.ensureQueryData(projectQueries.list(workspaceId))),
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
    routePath(pathname) === '/invitations/accept'
      ? null
      : settle(
          client.ensureQueryData({
            queryKey: queryKeys.workspaces.access(workspaceId),
            queryFn: ({ signal }) =>
              workspacesApi.access(workspaceId, {
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
    noWorkspace: false,
    workspaceId,
    activeProjectId,
    hasResolvedProject: pickActiveProject(resolvedProject, projects, activeProjectId) !== null,
    listSettled: true,
  });
  return { activeProjectId, status };
}

/** A public pricing selection arriving on `/pricing` is captured, then the URL cleaned. */
async function capturePricingSelection(url: URL) {
  if (url.pathname !== '/pricing') return;
  const { capturePublicPricingSelection } = await import('@/lib/billing/public-pricing-selection');
  if (capturePublicPricingSelection(url)) throw redirect('/pricing');
}

export async function bootstrapPrivateRoutes({ request }: { request: Request }) {
  const client = getAppQueryClient();
  const url = new URL(request.url);
  await capturePricingSelection(url);

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

  // The chooser and workspace setup read nothing of the selected workspace.
  if (isWorkspaceFreeRoute(url.pathname, url.search)) return null;
  const { workspaceId, workspaces, requestedProjectId } = scope;
  const [listed, entitlement] = await readWorkspaceState(client, workspaceId, url.pathname);
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
