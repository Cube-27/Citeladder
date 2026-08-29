'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { setActiveWorkspaceId } from '@/lib/api/client';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { Project } from '@/lib/api/types';
import {
  readStoredActiveProjectId,
  writeStoredActiveProjectId,
} from '@/lib/project/active-project-storage';

type ProjectContextValue = {
  /** All projects the active workspace owns (empty while loading / none yet). */
  projects: Project[];
  /** The currently-selected project, or `null` when none is resolved. */
  activeProject: Project | null;
  /** The active project id, or `null`. Persisted to localStorage. */
  activeProjectId: string | null;
  /** Select a project by id (persists + stamps the workspace header). */
  setActiveProjectId: (projectId: string) => void;
  /** True while the project list is loading. */
  isLoading: boolean;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * ProjectProvider (F5) — the active-project context consumed by every authed
 * screen (F6–F10).
 *
 * It loads the workspace's projects via F2's `projects.ts`, tracks the selected
 * project id (persisted to localStorage so a reload keeps the selection), and
 * — critically — mirrors the active project's `workspace_id` into the API
 * client as the `X-Workspace-Id` header (see `lib/api/client.ts`). That header
 * is how the backend's `require_active_workspace` scopes flat routes to the
 * workspace the user is looking at; without it the backend falls back to the
 * user's default workspace.
 *
 * Selection resolution: a persisted id that still exists wins; otherwise the
 * first project is auto-selected. When there are no projects the context is
 * empty (the shell shows the Getting-Started card / setup flow).
 */
export function ProjectProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: ({ signal }) => projectsApi.listProjects({ signal }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(() => readStoredActiveProjectId());
  // An explicit selection (onboarding's just-created project, the switcher) is
  // authoritative even before the list refetch catches up. Without this, a
  // selection whose project is not yet in `projects` fails the membership check
  // below and gets reset to `projects[0]` — the "I added a project and landed on
  // the first one" bug. Only a selection the user never made (a stale
  // localStorage id for a deleted project) may fall back.
  //
  // State rather than a ref because `activeProjectId` is derived from it during
  // render: clearing the pin has to re-run that memo. It is released purely by
  // derivation below (never by an effect) once the list catches up.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // The pin stops applying the moment the list actually contains it — from then
  // on the ordinary membership check governs, so a project deleted later still
  // falls back to the first one instead of stranding the context on a dead id.
  const pinApplies =
    pinnedId !== null && selectedId === pinnedId && !projects.some((p) => p.id === pinnedId);

  // Resolve the effective active id: keep a valid selection, else default to
  // the first project, else null.
  const activeProjectId = useMemo(() => {
    if (pinApplies) return selectedId;
    if (projects.length === 0) return null;
    if (selectedId && projects.some((project) => project.id === selectedId)) {
      return selectedId;
    }
    return projects[0].id;
  }, [projects, selectedId, pinApplies]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const setActiveProjectId = useCallback((projectId: string) => {
    setPinnedId(projectId);
    setSelectedId(projectId);
    writeStoredActiveProjectId(projectId);
  }, []);

  // Persist a resolved default (first project) so a reload is stable, and keep
  // the API client's workspace header in sync with the active project.
  useEffect(() => {
    if (activeProjectId && activeProjectId !== selectedId) {
      writeStoredActiveProjectId(activeProjectId);
      // One-time promotion of the resolved default into state so a reload is
      // stable; guarded above, so it cannot cascade.
      // oxlint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(activeProjectId);
    }
  }, [activeProjectId, selectedId]);

  useEffect(() => {
    // While a just-selected project is pinned it is not in `projects` yet, so
    // `activeProject` is momentarily null. Keep the current header rather than
    // clearing it: dropping it mid-flight would send the refetch to the user's
    // default workspace, which is the wrong one for a multi-workspace account.
    if (activeProject === null && pinApplies) return;
    setActiveWorkspaceId(activeProject?.workspace_id ?? null);
  }, [activeProject, pinApplies]);

  // Backfill missing brand logos. Onboarding kicks off a refresh for the project
  // it creates, but that is the ONLY trigger: a project created before logos
  // existed, or one whose crawl lost a race or failed transiently, would show
  // initials forever. Hydrating from the provider covers every project on every
  // authed screen instead of depending on how the project came to exist.
  //
  // Bounded and idempotent: one attempt per project per session (the ref), only
  // for projects with no `logo_url`, and the backend answers from its own
  // database cache — including a negative cache — so a domain with no findable
  // icon is not re-crawled on the next mount.
  const hydratedLogos = useRef(new Set<string>());
  useEffect(() => {
    const pending = projects.filter(
      (project) => !project.brand.logo_url && !hydratedLogos.current.has(project.id),
    );
    if (pending.length === 0) return;
    for (const project of pending) hydratedLogos.current.add(project.id);

    let cancelled = false;
    void Promise.allSettled(
      pending.map((project) => projectsApi.refreshProjectLogos(project.id)),
    ).then((results) => {
      // Only re-read the list if something actually attached, so a workspace
      // where every domain lacks an icon settles instead of refetching forever.
      const attached = results.some(
        (result) => result.status === 'fulfilled' && result.value.brand.logo_url,
      );
      if (!cancelled && attached) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projects, queryClient]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProject,
      activeProjectId,
      setActiveProjectId,
      isLoading,
    }),
    [projects, activeProject, activeProjectId, setActiveProjectId, isLoading],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

/** Access the active-project context. Throws if used outside `<ProjectProvider>`. */
export function useProjectContext(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a <ProjectProvider>.');
  }
  return context;
}

/** Convenience accessor for just the active project (or null). */
export function useActiveProject(): Project | null {
  return useProjectContext().activeProject;
}
