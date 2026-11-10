import { useQuery } from '@tanstack/react-query';

import type { ActionSurface } from '@citeladder/contracts/action-surface';
import { actionsQueries, type ActionsParams } from '@/lib/api/actions';
import { useProjectContext } from '@/lib/project/project-context';

type StatusCounts = Partial<Record<string, number>>;

/** The work queue: Actions that are open or in progress. */
export function queueCount(counts: StatusCounts): number {
  return (counts.open ?? 0) + (counts.in_progress ?? 0);
}

/** The active project's first page of Actions with these filters, once a project is active. */
function useActionsFirstPage(params?: ActionsParams) {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  return useQuery({
    ...actionsQueries.list(
      { workspaceId: activeWorkspaceId, projectId: activeProjectId ?? '' },
      params,
    ),
    enabled: Boolean(activeWorkspaceId && activeProjectId),
  });
}

/**
 * One screen's project-wide Action counts by status, from the unfiltered
 * first page of that surface that its status filter and its table's default
 * view share. Undefined until loaded.
 */
export function useActionStatusCounts(surface: ActionSurface): StatusCounts | undefined {
  return useActionsFirstPage({ surface }).data?.status_counts;
}

/**
 * Open plus in-progress Actions of one surface, from the unfiltered first
 * page the shell reads once for every badge (and the Agent's top Actions
 * share). Undefined until loaded.
 */
export function useSurfaceOpenCount(surface: ActionSurface): number | undefined {
  return useActionsFirstPage().data?.surface_open_counts[surface];
}
