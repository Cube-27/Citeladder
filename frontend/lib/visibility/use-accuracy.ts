import { useMutation, useQuery } from '@tanstack/react-query';

import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { visibilityApi } from '@/lib/api/visibility';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { PERCEPTION_PENDING_POLL_MS } from '@/lib/config/operational';
import { saveBlob } from '@/lib/download';
import type { SourceFilters } from '@/components/visibility/source-rows';
import {
  selectionEnabled,
  selectionParams,
  type SourceQueries,
} from '@/lib/visibility/use-source-analysis';

type AccuracyInput = Readonly<{
  filters: Pick<SourceFilters, 'engine' | 'cohort'>;
  queries: SourceQueries;
  /** Outside the fact-checking pilot nothing is read. */
  pilot: boolean;
}>;

/**
 * The Fact-checking tab's read: the same selection as Perception. It rechecks while
 * claims are still being checked, on the perception cadence.
 */
export function useAccuracy({ filters, queries, pilot }: AccuracyInput) {
  const params = selectionParams(filters, queries);
  const enabled = pilot && selectionEnabled(queries);
  const query = useQuery({
    ...visibilityQueries.accuracy(
      { workspaceId: queries.workspaceId, projectId: queries.projectId },
      params,
    ),
    enabled,
    placeholderData: enabled
      ? (data, previous) => retainPreviousDataForScope(queries.projectId, data, previous)
      : undefined,
    refetchInterval: (current) =>
      current.state.data?.state === 'pending' ? PERCEPTION_PENDING_POLL_MS : false,
  });
  return query;
}

/**
 * The By fact view and the claims export for the same selection, on the
 * Fact-checking tab only. By fact is read once this selection's accuracy has
 * settled, the only state that draws it, so it never keeps mid-check counts.
 */
export function useFactViews({
  filters,
  queries,
  accuracy,
  open,
}: Readonly<{
  filters: AccuracyInput['filters'];
  queries: SourceQueries;
  accuracy: Pick<ReturnType<typeof useAccuracy>, 'data' | 'isPlaceholderData'>;
  open: boolean;
}>) {
  const params = selectionParams(filters, queries);
  const enabled =
    open &&
    accuracy.data?.state === 'value' &&
    !accuracy.isPlaceholderData &&
    selectionEnabled(queries);
  const scope = { workspaceId: queries.workspaceId, projectId: queries.projectId };
  const facts = useQuery({
    ...visibilityQueries.accuracyFacts(scope, params),
    enabled,
    placeholderData: enabled
      ? (data, previous) => retainPreviousDataForScope(queries.projectId, data, previous)
      : undefined,
  });
  const exporting = useMutation({
    mutationFn: async () =>
      saveBlob(
        await visibilityApi.exportAccuracyClaims(queries.projectId, params, {
          workspaceId: queries.workspaceId,
        }),
        'fact-check-claims.csv',
      ),
  });
  return { facts, exporting };
}
