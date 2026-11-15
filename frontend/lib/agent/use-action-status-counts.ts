import { useQuery } from '@tanstack/react-query';

import { actionsQueries } from '@/lib/api/actions';
import { useProjectContext } from '@/lib/project/project-context';

type StatusCounts = Partial<Record<string, number>>;

/** The work queue: Actions that are open or in progress. */
export function queueCount(counts: StatusCounts): number {
  return (counts.open ?? 0) + (counts.in_progress ?? 0);
}

/**
 * Project-wide Action counts by status, from the unfiltered first page that
 * the navigation badge, the Actions filter and the Actions table's default
 * view share: undefined until loaded, `pending` while the read is out.
 */
export function useActionStatusCounts(): { counts?: StatusCounts; pending: boolean } {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const query = useQuery({
    ...actionsQueries.list({ workspaceId: activeWorkspaceId, projectId: activeProjectId ?? '' }),
    enabled: Boolean(activeWorkspaceId && activeProjectId),
  });
  return { counts: query.data?.status_counts, pending: query.isLoading };
}
