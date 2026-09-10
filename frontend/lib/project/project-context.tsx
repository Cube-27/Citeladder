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
import { runsQueries } from '@/lib/api/runs';
import { siteHealthQueries } from '@/lib/api/site-health';
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
  /**
   * A selection is committed but the list has not confirmed it yet — the
   * workspace is still resolving, and an empty `projects` here is not evidence
   * that the account has none. `OnboardingGate` reads this.
   */
  hasPendingSelection: boolean;
  /** True while the project list is loading. */
  isLoading: boolean;
  /** True when project ownership could not be resolved. */
  isError: boolean;
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
  const {
    data: projects = [],
    isLoading,
    isError,
    dataUpdatedAt,
  } = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: ({ signal }) => projectsApi.listProjects({ signal }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(() => readStoredActiveProjectId());
  // An explicit selection (onboarding's just-created project, the switcher) is
  // authoritative even before the list refetch catches up. Without this, a
  // selection whose project is not yet in `projects` fails the membership check
  // below and gets reset to `projects[0]` — the "I added a project and landed on
  // the first one" bug.
  //
  // The pin is SEEDED FROM STORAGE, which is what carries a selection across a
  // route-group boundary. Onboarding lives in `(onboarding)` and the workspace
  // in `(app)`; each layout mounts its own provider, so the pin that onboarding
  // set dies with its provider and this one starts over from the stored id
  // alone. Seeding only `selectedId` from storage was not enough: an id absent
  // from a not-yet-refetched list fails the membership check, resolves to
  // `projects[0]`, and the promotion effect below then WRITES that wrong id to
  // storage — so the miss is permanent, not a flicker. (This is what the
  // `?project=` hand-off in the URL was papering over, one effect-tick too
  // late and only on `/projects`.)
  //
  // State rather than a ref because `activeProjectId` is derived from it during
  // render: clearing the pin has to re-run that memo. It is released purely by
  // derivation below (never by an effect).
  const [pin, setPin] = useState<{ id: string; asOf: number } | null>(() => {
    const stored = readStoredActiveProjectId();
    // `dataUpdatedAt` here is the list generation this provider STARTED from —
    // 0 with a cold cache, the cached timestamp when it inherits one from the
    // provider it is replacing. Captured in the lazy initializer so it is the
    // mount-time value, not whatever the current render sees.
    return stored === null ? null : { id: stored, asOf: dataUpdatedAt };
  });
  // `asOf` is the list's `dataUpdatedAt` when the pin was set, and the pin holds
  // only until a list fetched AFTER that comes back. That bound is what keeps a
  // stale localStorage id for a DELETED project from stranding the context on a
  // dead id forever: one authoritative list without it releases the pin and the
  // ordinary membership check takes over. It also releases the moment the list
  // does contain it, which is the common case.
  const pinApplies =
    pin !== null &&
    selectedId === pin.id &&
    !projects.some((project) => project.id === pin.id) &&
    dataUpdatedAt <= pin.asOf;

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

  const setActiveProjectId = useCallback(
    (projectId: string) => {
      // The generation is read from the cache rather than closed over, so this
      // callback stays referentially stable — every consumer holds it across
      // renders — while still stamping the pin with the list the selection was
      // actually made against.
      const listGeneration =
        queryClient.getQueryState(queryKeys.projects.list())?.dataUpdatedAt ?? 0;
      setPin({ id: projectId, asOf: listGeneration });
      setSelectedId(projectId);
      writeStoredActiveProjectId(projectId);
    },
    [queryClient],
  );

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
    if (activeProject) {
      // Warm the shared run list and latest-crawl dashboard only after the
      // workspace header is installed. Visibility/Runs and Website/Issues then
      // reuse these exact cache entries instead of starting cold per route.
      void Promise.all([
        queryClient.prefetchQuery(runsQueries.list(activeProject.id)),
        queryClient.prefetchQuery(siteHealthQueries.dashboard(activeProject.id)),
      ]);
    }
  }, [activeProject, pinApplies, queryClient]);

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
      hasPendingSelection: pinApplies,
      isLoading,
      isError,
    }),
    [projects, activeProject, activeProjectId, setActiveProjectId, pinApplies, isLoading, isError],
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
