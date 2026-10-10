'use client';

import { useQuery } from '@tanstack/react-query';

import { actionsQueries } from '@/lib/api/actions';
import { useProjectContext } from '@/lib/project/project-context';

/** Open plus in-progress Actions for the active project; undefined until known. */
export function useOpenActionCount(): number | undefined {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const query = useQuery({
    ...actionsQueries.list(activeWorkspaceId ?? '', activeProjectId ?? ''),
    enabled: Boolean(activeWorkspaceId && activeProjectId),
  });
  const counts = query.data?.status_counts;
  return counts ? (counts.open ?? 0) + (counts.in_progress ?? 0) : undefined;
}
