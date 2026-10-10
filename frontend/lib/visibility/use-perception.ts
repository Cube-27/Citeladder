'use client';

import { useQuery } from '@tanstack/react-query';

import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import type { SourceFilters } from '@/components/visibility/source-rows';
import { selectionParams, type SourceQueries } from '@/lib/visibility/use-source-analysis';

/** The Perception tab's read: the same run / engine / prompt-type selection as Sources. */
export function usePerception(
  filters: Pick<SourceFilters, 'engine' | 'cohort'>,
  queries: SourceQueries,
) {
  const params = selectionParams(filters, queries);
  return useQuery({
    queryKey: queryKeys.visibility.perception(queries.projectId ?? '', params),
    queryFn: ({ signal }) =>
      visibilityApi.getPerception(queries.projectId!, params, {
        signal,
        workspaceId: queries.workspaceId,
      }),
    enabled: Boolean(
      queries.projectId && queries.activeRunId && queries.selectedRunIds?.length !== 0,
    ),
    placeholderData: (data, query) => retainPreviousDataForScope(queries.projectId!, data, query),
  });
}
