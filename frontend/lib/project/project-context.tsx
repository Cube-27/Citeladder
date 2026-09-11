'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { httpErrorStatus, setActiveWorkspaceId } from '@/lib/api/client';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import { runsQueries } from '@/lib/api/runs';
import { siteHealthQueries } from '@/lib/api/site-health';
import type { Project } from '@/lib/api/types';
import {
  readStoredActiveProjectId,
  readStoredActiveWorkspaceId,
  writeStoredActiveProjectId,
  writeStoredActiveWorkspaceId,
} from '@/lib/project/active-project-storage';
import { ProjectSelectionProvider, type ProjectContextValue } from '@/lib/project/project-scope';
import {
  pickActiveProject,
  resolveFailed,
  resolveProjectId,
  resolveStatus,
  resolveWorkspaceId,
} from '@/lib/project/selection';

export {
  useActiveProject,
  useActiveWorkspaceId,
  useProjectContext,
  type ProjectContextValue,
} from '@/lib/project/project-scope';

const isMissing = (error: unknown) => httpErrorStatus(error) === 404;

/** The scope the URL is asking for, if any. */
function useRequestedScope() {
  const searchParams = useSearchParams();
  return {
    requestedProjectId: searchParams?.get('project') || null,
    urlWorkspaceId: searchParams?.get('workspace') || null,
  };
}

/** One workspace's projects, keyed by AND requested for that workspace. */
function useWorkspaceProjects(workspaceId: string | null, allowed: boolean) {
  return useQuery({
    queryKey: queryKeys.projects.list(workspaceId ?? 'unresolved'),
    queryFn: ({ signal }) => projectsApi.listProjects({ signal, workspaceId }),
    enabled: workspaceId !== null && allowed,
  });
}

/**
 * The authenticated shell's workspace + project context.
 *
 * Three properties matter, and each replaces something that was load-bearing
 * before:
 *
 * 1. **The workspace exists without a project.** It used to be derived in an
 *    effect from `activeProject?.workspace_id`, so a workspace with zero
 *    projects — a new account, or one mid-first-creation — had no identity at
 *    all, and every workspace-scoped read fell back to whatever workspace the
 *    backend picked by default.
 *
 * 2. **An explicit `?project=` is resolved directly**, through
 *    `GET /projects/{id}` (authorized from the path, so it needs no prior
 *    correct workspace header). A list that predates the project therefore
 *    cannot contradict it. This is what lets a just-created project be
 *    navigated to and be usable on arrival.
 *
 * 3. **Cache identity matches request identity.** Workspace-scoped reads are
 *    keyed by workspace AND carry that workspace on the request itself, so a
 *    retry or a late response cannot answer for a workspace the reader has
 *    since left.
 *
 * The previous storage-seeded "pin" and its list-generation bookkeeping are
 * gone: they existed only to smuggle a selection across the route-group
 * boundary between `(onboarding)` and `(app)`, and there is no longer a
 * boundary to cross (see `app/(authed)/layout.tsx`).
 */
export function ProjectProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const { requestedProjectId, urlWorkspaceId } = useRequestedScope();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() =>
    readStoredActiveProjectId(),
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() =>
    readStoredActiveWorkspaceId(),
  );

  // The membership authority. Needs only the session cookie, so it loads
  // alongside `me` rather than after it, and it is deliberately NOT scoped by
  // a workspace header — it is what decides which workspaces exist.
  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces.list(),
    queryFn: ({ signal }) => projectsApi.listWorkspaces({ signal, workspaceId: null }),
  });

  // The narrow resolution read for an explicit id. Authorized from the path,
  // so it answers before any workspace is known and its `workspace_id` is
  // what establishes the workspace for everything that follows.
  const detailQuery = useQuery({
    queryKey: queryKeys.projects.detail(requestedProjectId ?? 'none'),
    queryFn: ({ signal }) =>
      projectsApi.getProject(String(requestedProjectId), { signal, workspaceId: null }),
    enabled: requestedProjectId !== null,
  });

  const resolvedProject = requestedProjectId === null ? null : (detailQuery.data ?? null);
  // A URL naming both a workspace and a project from a DIFFERENT workspace is
  // rejected rather than reconciled: combining one project's id with another
  // workspace's limits is how a request ends up authorized against one
  // tenancy and budgeted against another.
  const contradictoryRequest = Boolean(
    urlWorkspaceId && resolvedProject && resolvedProject.workspace_id !== urlWorkspaceId,
  );

  const workspaces = workspacesQuery.data;
  const activeWorkspaceId = useMemo(
    () =>
      resolveWorkspaceId({
        projectWorkspaceId: resolvedProject?.workspace_id ?? null,
        urlWorkspaceId,
        selectedWorkspaceId,
        workspaces,
      }),
    [resolvedProject, urlWorkspaceId, selectedWorkspaceId, workspaces],
  );

  const projectsQuery = useWorkspaceProjects(activeWorkspaceId, !contradictoryRequest);
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const listSettled = projectsQuery.isSuccess;

  const activeProjectId = useMemo(
    () =>
      resolveProjectId({
        requestedProjectId,
        selectedProjectId,
        projects,
        listSettled,
      }),
    [requestedProjectId, selectedProjectId, projects, listSettled],
  );

  const activeProject = useMemo(
    () => pickActiveProject(resolvedProject, projects, activeProjectId),
    [resolvedProject, projects, activeProjectId],
  );

  const requestedProjectMissing = isMissing(detailQuery.error);
  const failed = resolveFailed({
    detailFailed: detailQuery.isError && !requestedProjectMissing,
    membershipFailed: workspacesQuery.isError,
    listFailedWithNothingUsable: projectsQuery.isError && activeProject === null,
  });

  const status = resolveStatus({
    contradictoryRequest,
    requestedProjectPending:
      requestedProjectId !== null && activeProject === null && !requestedProjectMissing,
    requestedProjectMissing,
    failed,
    workspaceId: activeWorkspaceId,
    activeProjectId,
    hasResolvedProject: activeProject !== null,
    listSettled,
  });

  const setActiveProjectId = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      writeStoredActiveProjectId(projectId);
    },
    [setSelectedProjectId],
  );

  const selectWorkspace = useCallback(
    (workspaceId: string) => {
      setSelectedWorkspaceId(workspaceId);
      writeStoredActiveWorkspaceId(workspaceId);
      // A different workspace owns a different project set, so the previous
      // workspace's selection must not survive the switch and be resolved
      // against the new list.
      setSelectedProjectId(null);
      writeStoredActiveProjectId(null);
    },
    [setSelectedProjectId, setSelectedWorkspaceId],
  );

  const retry = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: queryKeys.workspaces.list() });
    void queryClient.refetchQueries({ queryKey: queryKeys.projects.all });
  }, [queryClient]);

  // Keep the ambient header in step with the RESOLVED workspace (not with a
  // project, which may not exist yet). Converted callers pass the workspace
  // explicitly; this remains for the ones that have not been converted, and
  // it is no longer the correctness mechanism for any of them.
  useEffect(() => {
    setActiveWorkspaceId(activeWorkspaceId);
    writeStoredActiveWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (activeProjectId) writeStoredActiveProjectId(activeProjectId);
  }, [activeProjectId]);

  useProjectWarmup(activeProject, activeWorkspaceId);
  useBrandLogoHydration(projects, activeWorkspaceId);

  const value = useMemo<ProjectContextValue>(
    () => ({
      workspaces: workspaces ?? [],
      activeWorkspaceId,
      activeWorkspace: workspaces?.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
      setActiveWorkspaceId: selectWorkspace,
      projects,
      activeProject,
      activeProjectId,
      setActiveProjectId,
      status,
      retry,
      isLoading: status === 'resolving',
      isError: status === 'error',
    }),
    [
      workspaces,
      activeWorkspaceId,
      selectWorkspace,
      projects,
      activeProject,
      activeProjectId,
      setActiveProjectId,
      status,
      retry,
    ],
  );

  return <ProjectSelectionProvider value={value}>{children}</ProjectSelectionProvider>;
}

/**
 * Warm the shared run list and latest-crawl dashboard for the active project.
 *
 * Visibility/Runs and Website/Issues then reuse these exact cache entries
 * instead of starting cold per route.
 */
function useProjectWarmup(activeProject: Project | null, workspaceId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!activeProject || !workspaceId) return;
    void Promise.all([
      queryClient.prefetchQuery(runsQueries.list(activeProject.id)),
      queryClient.prefetchQuery(siteHealthQueries.dashboard(activeProject.id)),
    ]);
  }, [activeProject, workspaceId, queryClient]);
}

/**
 * Backfill missing brand logos.
 *
 * Onboarding kicks off a refresh for the project it creates, but that is the
 * ONLY trigger: a project created before logos existed, or one whose crawl
 * lost a race or failed transiently, would show initials forever. Hydrating
 * from the provider covers every project on every authed screen instead of
 * depending on how the project came to exist.
 *
 * Bounded and idempotent: one attempt per project per session, only for
 * projects with no `logo_url`, and the backend answers from its own database
 * cache — including a negative cache — so a domain with no findable icon is
 * not re-crawled on the next mount.
 */
function useBrandLogoHydration(projects: readonly Project[], workspaceId: string | null) {
  const queryClient = useQueryClient();
  const hydrated = useRef(new Set<string>());
  useEffect(() => {
    if (!workspaceId) return;
    const pending = projects.filter(
      (project) => !project.brand.logo_url && !hydrated.current.has(project.id),
    );
    if (pending.length === 0) return;
    for (const project of pending) hydrated.current.add(project.id);

    let cancelled = false;
    void Promise.allSettled(
      pending.map((project) => projectsApi.refreshProjectLogos(project.id, { workspaceId })),
    ).then((results) => {
      // Only re-read the list if something actually attached, so a workspace
      // where every domain lacks an icon settles instead of refetching forever.
      const attached = results.some(
        (result) => result.status === 'fulfilled' && result.value.brand.logo_url,
      );
      if (!cancelled && attached) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(workspaceId) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projects, workspaceId, queryClient]);
}
