'use client';

import { useQuery } from '@tanstack/react-query';

import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import type { SourceFilters } from '@/components/visibility/source-rows';
import {
  selectionEnabled,
  selectionParams,
  type SourceQueries,
} from '@/lib/visibility/use-source-analysis';

/**
 * The Ads tab's read: the same run / engine / prompt-type selection as
 * Sources. A range with no runs reads nothing rather than keeping the
 * previous selection.
 */
export function useAds(filters: Pick<SourceFilters, 'engine' | 'cohort'>, queries: SourceQueries) {
  const params = selectionParams(filters, queries);
  const projectId = queries.projectId ?? '';
  const enabled = selectionEnabled(queries);
  const query = useQuery({
    queryKey: queryKeys.visibility.ads(projectId, params),
    queryFn: ({ signal }) =>
      visibilityApi.getAds(projectId, params, { signal, workspaceId: queries.workspaceId }),
    enabled,
    placeholderData: enabled
      ? (data, previous) => retainPreviousDataForScope(projectId, data, previous)
      : undefined,
  });
  return { query, enabled };
}
