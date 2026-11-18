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
 * find their answers already there. A reload of an address the device
 * recognises asks for the session, the workspace's gates, the shell's reads
 * and the screen's in one round; only reads that need another read's answer
 * wait for it.
 */
import type { Query, QueryClient } from '@tanstack/react-query';
import { redirect } from 'react-router-dom';

import { billingQueries } from '@/lib/api/billing';
import { authQueries } from '@/lib/api/auth';
import { safeAuthReturnPath, withAuthReturnPath } from '@/lib/auth/auth-return-path';
import { httpErrorStatus } from '@/lib/api/client';
import { policyQueries } from '@/lib/api/policies';
import { projectQueries } from '@/lib/api/projects';
import { workspaceQueries } from '@/lib/api/workspaces';
import { getAppQueryClient, warmQuery } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import type { Project, ProjectSummary, Workspace } from '@citeladder/contracts';
import { projectDestination, workspaceDestination } from '@/lib/navigation/project-destination';
import {
  preloadRouteReads,
  prefetchProjectShell,
  prefetchRoute,
  type ProjectScope,
} from '@/lib/navigation/route-prefetch';
import { isWorkspaceOnlyRoute } from '@/lib/navigation/app-routes';
import { routePath } from '@/lib/navigation/route-path';
import {
  readStoredActiveProjectId,
  readStoredActiveWorkspaceId,
} from '@/lib/project/active-project-storage';
import {
  isWorkspaceFreeRoute,
  resolveAllowance,
  resolveGate,
  chooserShortcut,
} from '@/lib/project/bootstrap';
import { resolveProjectId, resolveStatus, resolveWorkspaceId } from '@/lib/project/selection';

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
    await client.ensureQueryData(authQueries.me());
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
 * The workspace, and the project in it, that the loader started reading
 * before confirming them, and when the project's reads had all been issued.
 */
type Guess = Readonly<{
  workspaceId: string;
  project: Readonly<{ id: string; issued: Promise<unknown> }> | null;
}>;

/**
 * Start a project's reads: the landing screen's and the shell's own.
 *
 * Cache warms under each consumer's own query key, never a render: the
 * session, access and Terms gates still decide whether anything mounts, the
 * access gate clears product queries for a workspace without access, and the
 * backend authorizes every read. The screen is warmed only for an address
 * naming nothing but its scope — the prefetchers warm each screen's default
 * view, and filters in the address ask for a different key.
 */
function warmProject(client: QueryClient, url: URL, scope: ProjectScope) {
  const scopeOnly = [...url.searchParams.keys()].every(
    (key) => key === 'project' || key === 'workspace',
  );
  return Promise.all([
    prefetchProjectShell(client, scope),
    scopeOnly ? prefetchRoute(client, url.pathname, scope) : null,
  ]);
}

/**
 * Start, beside `me`, every read the address lets the loader predict.
 *
 * A returning reader's workspace is the one the address names or the device
 * remembers, and their project the one the address names or the device
 * remembers. Waiting for the membership list to confirm either before asking
 * for the workspace's gates and the screen's reads cost a full round trip per
 * wait on every hard refresh, though none of those reads needs the list's
 * answer: the backend authorizes each one, and the gates still decide what
 * renders. A guess the loader later finds wrong is withdrawn by `settleGuess`.
 */
function guessScope(client: QueryClient, url: URL): Guess | null {
  if (isWorkspaceFreeRoute(url.pathname, url.search)) return null;
  const urlWorkspaceId = url.searchParams.get('workspace') || null;
  const workspaceId = urlWorkspaceId ?? readStoredActiveWorkspaceId();
  if (!workspaceId) return null;
  warmWorkspaceState(client, workspaceId, url.pathname);
  // A remembered project belongs to the remembered workspace, not to one the
  // address names.
  const projectId =
    url.searchParams.get('project') || (urlWorkspaceId ? null : readStoredActiveProjectId());
  if (!projectId || isWorkspaceOnlyRoute(url.pathname)) return { workspaceId, project: null };
  // The shell renders the project's full view, which the summary list does
  // not carry: its detail read goes out in this same round.
  void client.prefetchQuery(projectQueries.detail(projectId));
  const issued = warmProject(client, url, { projectId, workspaceId });
  return { workspaceId, project: { id: projectId, issued } };
}

/** An unanswered read of one project, other than the detail read that resolves the project itself. */
function unansweredProjectRead(projectId: string) {
  return (query: Query) =>
    query.state.data === undefined &&
    query.queryKey.includes(projectId) &&
    !queryKeys.projects.isDetail(query.queryKey);
}

/**
 * Withdraw what a wrong guess started, before the right reads begin.
 *
 * A read the backend scopes by workspace answers a project from another
 * workspace with `Project not found`, filed under the project's own key. Left
 * in flight, the screen's real read would join that request and render its
 * failure, so every unanswered read of the guessed project is cancelled and
 * dropped — once they have all been issued, since a read whose code was still
 * loading would otherwise start after the withdrawal. The guessed workspace's
 * own reads are keyed by that workspace and stay out of the way by themselves.
 */
async function settleGuess(client: QueryClient, guess: Guess | null, actual: ProjectScope | null) {
  if (!guess?.project) return;
  const { id, issued } = guess.project;
  if (actual?.projectId === id && actual.workspaceId === guess.workspaceId) return;
  await issued;
  const predicate = unansweredProjectRead(id);
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}

/**
 * Settle the guess against the project a bare address selected. An address
 * naming its project settled the guess when that project resolved.
 */
function settleSelectedGuess(
  client: QueryClient,
  guess: Guess | null,
  { requestedProjectId, workspaceId }: Scope,
  activeProjectId: string | null,
) {
  if (requestedProjectId) return Promise.resolve();
  return settleGuess(
    client,
    guess,
    activeProjectId ? { projectId: activeProjectId, workspaceId } : null,
  );
}

/**
 * Resolve the requested project from its detail read (the workspace's list
 * carries summaries only); the read authorizes from the path, so a stale or
 * foreign remembered workspace can never hide a project. Once the project
 * names its workspace, settle the
 * guess and make sure its reads are running. A guess that named the project's
 * own workspace already started them, and repeating the warm joins those
 * requests. A project contradicting the address's workspace is rejected by
 * the caller and warms nothing.
 */
async function requestedProject(
  client: QueryClient,
  url: URL,
  {
    projectId,
    urlWorkspaceId,
    guess,
  }: Readonly<{
    projectId: string;
    urlWorkspaceId: string | null;
    guess: Guess | null;
  }>,
): Promise<Project | null> {
  const project = await settle(client.ensureQueryData(projectQueries.detail(projectId)));
  const scope =
    project && (!urlWorkspaceId || project.workspace_id === urlWorkspaceId)
      ? { projectId: project.id, workspaceId: project.workspace_id }
      : null;
  await settleGuess(client, guess, scope);
  if (scope) void warmProject(client, url, scope);
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
async function resolveScope(
  client: QueryClient,
  url: URL,
  guess: Guess | null,
): Promise<Scope | null> {
  const requestedProjectId = url.searchParams.get('project') || null;
  const urlWorkspaceId = url.searchParams.get('workspace') || null;

  // A membership list needs only the session cookie and the project only its
  // id; neither depends on the other's answer. Sent together they cost one
  // round trip instead of two — and one place to stall instead of two.
  const workspacesPending = settle(client.ensureQueryData(workspaceQueries.list()));
  const projectPending = requestedProjectId
    ? requestedProject(client, url, { projectId: requestedProjectId, urlWorkspaceId, guess })
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
 * The workspace's gate reads: its projects, remaining allowance and access,
 * and its Terms status. Accepting an invitation never waits on the selected
 * workspace's access, so that route does not ask for it.
 */
function workspaceStateQueries(workspaceId: string, pathname: string) {
  return {
    projects: projectQueries.list(workspaceId),
    entitlement: billingQueries.workspaceEntitlement(workspaceId),
    access:
      routePath(pathname) === '/invitations/accept' ? null : workspaceQueries.access(workspaceId),
    policies: policyQueries.workspace(workspaceId),
  };
}

/** Start a workspace's gate reads without waiting for any of them. */
function warmWorkspaceState(client: QueryClient, workspaceId: string, pathname: string) {
  const queries = workspaceStateQueries(workspaceId, pathname);
  void client.prefetchQuery(queries.projects);
  void client.prefetchQuery(queries.entitlement);
  if (queries.access) void client.prefetchQuery(queries.access);
  void client.prefetchQuery(queries.policies);
}

/**
 * The workspace's projects, remaining allowance and access, asked together —
 * or, for a workspace the loader guessed right, joined where they already are.
 *
 * The Terms status rides along only to warm the policy gate's cache: without
 * it the gate had nothing to answer from on a reload and held the page on a
 * loader for one more round trip. Its outcome decides nothing here.
 */
function readWorkspaceState(client: QueryClient, workspaceId: string, pathname: string) {
  const queries = workspaceStateQueries(workspaceId, pathname);
  void client.prefetchQuery(queries.policies);
  return Promise.all([
    settle<ProjectSummary[]>(client.ensureQueryData(queries.projects)),
    settle(client.ensureQueryData(queries.entitlement)),
    queries.access ? settle(client.ensureQueryData(queries.access)) : null,
  ]);
}

/**
 * The owner-private usage the shell shows, asked as soon as the membership
 * list says the reader may see it. A Member or Viewer would get a guaranteed
 * 403, so it waits for the role rather than being guessed.
 */
function warmUsage(client: QueryClient, workspaceId: string, workspaces: readonly Workspace[]) {
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  if (workspace?.capabilities.includes('manage_billing'))
    warmQuery(client, billingQueries.usage(workspaceId));
}

/**
 * Which project is active, and how far the shell has got towards knowing.
 *
 * Every input here is settled — the loader does not return until the reads
 * have — so the pending flags the provider needs at render time are all false.
 * The algebra itself is `lib/project/selection.ts`, shared with the provider so
 * the loader cannot answer differently from the tree it is seeding.
 */
function resolveSelection(scope: Scope, listed: ProjectSummary[]) {
  const { workspaceId, resolvedProject, requestedProjectId } = scope;
  // Include an authorized detail the list may predate.
  const known = listed.some((project) => project.id === resolvedProject?.id);
  const projects: ProjectSummary[] =
    resolvedProject && !known ? [...listed, resolvedProject] : listed;
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
    // A listed project is authorized; the provider reads its view before any
    // screen renders against it.
    hasResolvedProject: projects.some((project) => project.id === activeProjectId),
    listSettled: true,
  });
  return { activeProjectId, status };
}

function skipChooser(client: QueryClient, url: URL) {
  const memberships = client.getQueryData(workspaceQueries.list().queryKey);
  const shortcut = chooserShortcut(url.pathname, memberships);
  if (shortcut) throw redirect(shortcut);
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
  // The screen's read modules download beside the session round, whatever
  // the loader goes on to learn, so no read waits a module download after it.
  preloadRouteReads(url.pathname);
  await capturePricingSelection(url);

  // `me` and the membership list need only the session cookie — the tree's own
  // providers already issue them in parallel, and the loader pays for every
  // round trip it serializes. The guessed workspace's gate reads and the
  // guessed project's reads go out in the same round. A 401 still rejects
  // first: Promise.all settles on the earliest rejection, so the sign-in
  // redirect is not held up by the reads it makes moot.
  const guess = guessScope(client, url);
  const [sessionResolved, scope] = await Promise.all([
    requireSession(client),
    resolveScope(client, url, guess),
  ]);
  if (sessionResolved) skipChooser(client, url);
  if (!sessionResolved || !scope) return null;

  // The chooser and workspace setup read nothing of the selected workspace.
  if (isWorkspaceFreeRoute(url.pathname, url.search)) return null;
  const { workspaceId, workspaces, requestedProjectId } = scope;
  warmUsage(client, workspaceId, workspaces);
  const [listed, entitlement] = await readWorkspaceState(client, workspaceId, url.pathname);
  if (!listed) return null;

  const { activeProjectId, status } = resolveSelection(scope, listed);
  await settleSelectedGuess(client, guess, scope, activeProjectId);
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
    // The selected project is listed, so authorized: its full view and the
    // screen's reads start now, in the list's next round, and the redirected
    // load joins them. After sign-in nothing is remembered to guess from, and
    // waiting for the redirect put its full view a round before any screen read.
    void client.prefetchQuery(projectQueries.detail(activeProjectId));
    void warmProject(client, url, { projectId: activeProjectId, workspaceId });
    throw redirect(
      `${projectDestination(url.pathname, url.searchParams, activeProjectId)}${url.hash}`,
    );
  }

  return null;
}
