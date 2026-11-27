import { useQuery } from '@tanstack/react-query';

import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { PERCEPTION_PENDING_POLL_MS } from '@/lib/config/operational';
import {
  windowSelectionParams,
  windowSelectionReady,
  type SourceQueries,
  type WindowFilters,
} from '@/lib/visibility/use-source-analysis';

export function usePerception({
  filters,
  queries,
  open,
}: Readonly<{ filters: WindowFilters; queries: SourceQueries; open: boolean }>) {
  const enabled = open && windowSelectionReady(filters, queries);
  return useQuery({
    ...visibilityQueries.perception(
      { workspaceId: queries.workspaceId, projectId: queries.projectId },
      windowSelectionParams(filters, queries),
    ),
    enabled,
    placeholderData: enabled
      ? (data, previous) => retainPreviousDataForScope(queries.projectId, data, previous)
      : undefined,
    refetchInterval: (current) =>
      current.state.data?.state === 'pending' ? PERCEPTION_PENDING_POLL_MS : false,
  });
}
