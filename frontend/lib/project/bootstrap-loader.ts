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

async function settle<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch {
    return null;
  }
}

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

type Guess = Readonly<{
  workspaceId: string;
  project: Readonly<{ id: string; issued: Promise<unknown> }> | null;
}>;

const WARM_KEYS = new Set(['project', 'workspace', 'tab']);

function warmProject(client: QueryClient, url: URL, scope: ProjectScope) {
  const scopeOnly = [...url.searchParams.keys()].every((key) => WARM_KEYS.has(key));
  return Promise.all([
    prefetchProjectShell(client, scope),
    scopeOnly ? prefetchRoute(client, url.pathname + url.search, scope) : null,
  ]);
}

function guessScope(client: QueryClient, url: URL): Guess | null {
  if (isWorkspaceFreeRoute(url.pathname, url.search)) return null;
  const urlWorkspaceId = url.searchParams.get('workspace') || null;
  const workspaceId = urlWorkspaceId ?? readStoredActiveWorkspaceId();
  if (!workspaceId) return null;
  warmWorkspaceState(client, workspaceId, url.pathname);
  const projectId =
    url.searchParams.get('project') || (urlWorkspaceId ? null : readStoredActiveProjectId());
  if (!projectId || isWorkspaceOnlyRoute(url.pathname)) return { workspaceId, project: null };
  void client.prefetchQuery(projectQueries.detail(projectId));
  const issued = warmProject(client, url, { projectId, workspaceId });
  return { workspaceId, project: { id: projectId, issued } };
}

function unansweredProjectRead(projectId: string) {
  return (query: Query) =>
    query.state.data === undefined &&
    query.queryKey.includes(projectId) &&
    !queryKeys.projects.isDetail(query.queryKey);
}

async function settleGuess(client: QueryClient, guess: Guess | null, actual: ProjectScope | null) {
  if (!guess?.project) return;
  const { id, issued } = guess.project;
  if (actual?.projectId === id && actual.workspaceId === guess.workspaceId) return;
  await issued;
  const predicate = unansweredProjectRead(id);
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}

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

async function resolveScope(
  client: QueryClient,
  url: URL,
  guess: Guess | null,
): Promise<Scope | null> {
  const requestedProjectId = url.searchParams.get('project') || null;
  const urlWorkspaceId = url.searchParams.get('workspace') || null;

  const workspacesPending = settle(client.ensureQueryData(workspaceQueries.list()));
  const projectPending = requestedProjectId
    ? requestedProject(client, url, { projectId: requestedProjectId, urlWorkspaceId, guess })
    : null;
  const workspaces = await workspacesPending;
  if (!workspaces) return null;
  const resolvedProject = await projectPending;

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
    if (workspaces.length === 0 && !isWorkspaceOnlyRoute(url.pathname))
      throw redirect('/onboarding');
    return null;
  }

  return { workspaceId, workspaces, resolvedProject, requestedProjectId };
}

function workspaceStateQueries(workspaceId: string, pathname: string) {
  return {
    projects: projectQueries.list(workspaceId),
    entitlement: billingQueries.workspaceEntitlement(workspaceId),
    access:
      routePath(pathname) === '/invitations/accept' ? null : workspaceQueries.access(workspaceId),
    policies: policyQueries.workspace(workspaceId),
  };
}

function warmWorkspaceState(client: QueryClient, workspaceId: string, pathname: string) {
  const queries = workspaceStateQueries(workspaceId, pathname);
  void client.prefetchQuery(queries.projects);
  void client.prefetchQuery(queries.entitlement);
  if (queries.access) void client.prefetchQuery(queries.access);
  void client.prefetchQuery(queries.policies);
}

function readWorkspaceState(client: QueryClient, workspaceId: string, pathname: string) {
  const queries = workspaceStateQueries(workspaceId, pathname);
  void client.prefetchQuery(queries.policies);
  return Promise.all([
    settle<ProjectSummary[]>(client.ensureQueryData(queries.projects)),
    settle(client.ensureQueryData(queries.entitlement)),
    queries.access ? settle(client.ensureQueryData(queries.access)) : null,
  ]);
}

function warmUsage(client: QueryClient, workspaceId: string, workspaces: readonly Workspace[]) {
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  if (workspace?.capabilities.includes('manage_billing'))
    warmQuery(client, billingQueries.usage(workspaceId));
}

function resolveSelection(scope: Scope, listed: ProjectSummary[]) {
  const { workspaceId, resolvedProject, requestedProjectId } = scope;
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

async function capturePricingSelection(url: URL) {
  if (url.pathname !== '/pricing') return;
  const { capturePublicPricingSelection } = await import('@/lib/billing/public-pricing-selection');
  if (capturePublicPricingSelection(url)) throw redirect('/pricing');
}

export async function bootstrapPrivateRoutes({ request }: { request: Request }) {
  const client = getAppQueryClient();
  const url = new URL(request.url);
  preloadRouteReads(url.pathname);
  await capturePricingSelection(url);

  const guess = guessScope(client, url);
  const [sessionResolved, scope] = await Promise.all([
    requireSession(client),
    resolveScope(client, url, guess),
  ]);
  if (sessionResolved) skipChooser(client, url);
  if (!sessionResolved || !scope) return null;

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

  if (decision === 'redirecting') {
    throw redirect(workspaceDestination('/onboarding', null, workspaceId));
  }

  if (decision === 'ready' && projectRequired && activeProjectId && !requestedProjectId) {
    void client.prefetchQuery(projectQueries.detail(activeProjectId));
    void warmProject(client, url, { projectId: activeProjectId, workspaceId });
    throw redirect(
      `${projectDestination(url.pathname, url.searchParams, activeProjectId)}${url.hash}`,
    );
  }

  return null;
}
