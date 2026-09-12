'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

import { useOptionalProjectContext, useProjectContext } from '@/lib/project/project-context';

const PROJECT_PARAM = 'project';
const WORKSPACE_PARAM = 'workspace';
/** The single-use invitation token. Never propagated to another URL. */
const INVITATION_TOKEN_PARAM = 'token';

/**
 * Build a destination that carries an explicit project.
 *
 * `?project=` is the shell's selection hand-off: the arriving provider
 * resolves that exact id through the project-detail read instead of guessing
 * from a list that may predate it. Existing parameters are preserved (a
 * filter, a tab, a fragment on the caller's side) and the workspace parameter
 * is dropped — a verified project id already names its workspace, and keeping
 * both invites the contradictory pair the provider has to reject.
 */
export function projectDestination(
  pathname: string,
  search: URLSearchParams | null,
  projectId: string,
): string {
  const params = new URLSearchParams(search?.toString() ?? '');
  params.set(PROJECT_PARAM, projectId);
  params.delete(WORKSPACE_PARAM);
  return `${pathname}?${params.toString()}`;
}

/**
 * Build a destination for a workspace-only route (onboarding, workspace
 * settings), which has no project to identify itself with.
 */
export function workspaceDestination(
  pathname: string,
  search: URLSearchParams | null,
  workspaceId: string,
): string {
  const params = new URLSearchParams(search?.toString() ?? '');
  params.set(WORKSPACE_PARAM, workspaceId);
  params.delete(PROJECT_PARAM);
  // A one-time invitation token is a credential, not a destination parameter.
  // Carrying it forward would write it into the next URL and into browser
  // history, where it long outlives the single use it was minted for.
  params.delete(INVITATION_TOKEN_PARAM);
  return `${pathname}?${params.toString()}`;
}

/** The one workspace-bound destination for every additional-project entry point. */
export function newProjectDestination(workspaceId: string | null): string {
  const params = new URLSearchParams({ new: '1' });
  return workspaceId
    ? workspaceDestination('/onboarding', params, workspaceId)
    : `/onboarding?${params.toString()}`;
}

/** Scope a registered shell destination before it is rendered or invoked. */
export function scopedNavigationDestination(
  href: string,
  scope: 'project' | 'workspace',
  projectId: string | null,
  workspaceId: string | null,
): string {
  const target = new URL(href, 'https://citeladder.local');
  if (scope === 'workspace') {
    return workspaceId
      ? workspaceDestination(target.pathname, target.searchParams, workspaceId)
      : href;
  }
  return projectId ? projectDestination(target.pathname, target.searchParams, projectId) : href;
}

/** Return the canonical destination builder for links owned by the active project. */
export function useProjectHref() {
  const activeProjectId = useOptionalProjectContext()?.activeProjectId ?? null;
  return useCallback(
    (href: string) => scopedNavigationDestination(href, 'project', activeProjectId, null),
    [activeProjectId],
  );
}

/**
 * Give a resolved project route one URL identity without remounting its shell.
 *
 * Bare app URLs may bootstrap from device selection, but once that selection
 * is authorized the address is replaced with the explicit project destination.
 * Replacement is bookkeeping, so it creates no duplicate Back entry.
 */
export function useCanonicalProjectUrl(enabled: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeProjectId } = useProjectContext();

  useEffect(() => {
    if (!enabled || !pathname || !activeProjectId || searchParams?.has(PROJECT_PARAM)) return;
    router.replace(projectDestination(pathname, searchParams, activeProjectId), { scroll: false });
  }, [activeProjectId, enabled, pathname, router, searchParams]);
}

export type SelectProjectOptions = {
  /** Navigate to another route instead of the current one. */
  destination?: string;
  /**
   * Replace the current history entry rather than pushing.
   *
   * For a selection whose predecessor is GONE — the project was just deleted —
   * so Back must not return to a URL naming a project that no longer exists.
   */
  replace?: boolean;
};

/**
 * The one way the shell changes its project selection.
 *
 * Every entry point — the switcher, the command palette, the mobile shell, a
 * successful creation — goes through this so the context state, the device
 * storage and the URL can never disagree about what is selected.
 *
 * History follows intent, not mechanism:
 *
 * - choosing a DIFFERENT project is a navigation the reader took, so it
 *   pushes one entry and Back returns to the previous project;
 * - filling in an absent parameter for the selection already on screen is
 *   bookkeeping, so it replaces — otherwise Back would land on the same page
 *   minus a query string and look like it did nothing;
 * - choosing the project already in the URL does nothing at all.
 */
export function useSelectProject() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeProjectId, setActiveProjectId } = useProjectContext();

  return useCallback(
    (projectId: string, options: SelectProjectOptions = {}) => {
      const { destination, replace = false } = options;
      setActiveProjectId(projectId);
      const target = projectDestination(destination ?? pathname, searchParams, projectId);
      const urlAlreadyNamesIt = searchParams?.get(PROJECT_PARAM) === projectId;
      const samePage = destination === undefined || destination === pathname;
      if (urlAlreadyNamesIt && samePage && !replace) return;
      // Replacing is correct when nothing the reader can usefully go BACK to is
      // being left behind: the same project with the parameter simply absent,
      // or an entry the caller knows is now dead (a deleted project).
      if (replace || (samePage && projectId === activeProjectId)) {
        router.replace(target, { scroll: false });
      } else {
        router.push(target);
      }
    },
    [activeProjectId, pathname, router, searchParams, setActiveProjectId],
  );
}

/**
 * The one way the shell changes its WORKSPACE selection (plan §2.4).
 *
 * Selecting a workspace is an explicit act, never inferred from a project, so
 * this is deliberately separate from `useSelectProject`. The destination names
 * the workspace and drops any project parameter: the previous workspace's
 * project does not exist in the new one, and carrying it over would produce
 * exactly the contradictory pair the provider has to reject.
 *
 * A deliberate switch to a DIFFERENT workspace pushes one history entry;
 * selecting the one already active does nothing.
 */
export function useSelectWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeWorkspaceId, setActiveWorkspaceId } = useProjectContext();

  return useCallback(
    (workspaceId: string, destination?: string) => {
      const samePage = destination === undefined || destination === pathname;
      if (workspaceId === activeWorkspaceId && samePage) return;
      setActiveWorkspaceId(workspaceId);
      router.push(workspaceDestination(destination ?? pathname, searchParams, workspaceId));
    },
    [activeWorkspaceId, pathname, router, searchParams, setActiveWorkspaceId],
  );
}
