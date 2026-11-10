import { useQuery } from '@tanstack/react-query';

import type { ActionSurface } from '@citeladder/contracts/actions';
import { actionsQueries } from '@/lib/api/actions';
import { useProjectContext } from '@/lib/project/project-context';

type StatusCounts = Partial<Record<string, number>>;

/** The work queue: Actions that are open or in progress. */
export function queueCount(counts: StatusCounts): number {
  return (counts.open ?? 0) + (counts.in_progress ?? 0);
}

/**
 * One screen's project-wide Action counts by status, from the unfiltered
 * first page of that surface that its navigation badge, its status filter and
 * its table's default view share. Undefined until loaded.
 */
export function useActionStatusCounts(surface: ActionSurface): StatusCounts | undefined {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  return useQuery({
    ...actionsQueries.list(
      { workspaceId: activeWorkspaceId, projectId: activeProjectId ?? '' },
      { surface },
    ),
    enabled: Boolean(activeWorkspaceId && activeProjectId),
  }).data?.status_counts;
}
