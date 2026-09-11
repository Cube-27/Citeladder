'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { useProjectContext } from '@/lib/project/project-context';

const PROJECT_PARAM = 'project';
const WORKSPACE_PARAM = 'workspace';

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
  return `${pathname}?${params.toString()}`;
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
