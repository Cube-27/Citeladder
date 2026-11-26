import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { visibilityApi } from '@/lib/api/visibility';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { PERCEPTION_PENDING_POLL_MS } from '@/lib/config/operational';
import { saveBlob } from '@/lib/download';
import type { SourceFilters } from '@/components/visibility/source-rows';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { CLAIM_STATE_VIEWS } from '@/lib/visibility/accuracy';
import { cohortUrlCodec, FACT_CHECK_COHORT } from '@/lib/visibility/prompt-cohort';
import {
  periodSelectionParams,
  selectionEnabled,
  selectionParams,
  type SourceQueries,
} from '@/lib/visibility/use-source-analysis';

const CLAIM_STATE_CODEC = stringUrlCodec(CLAIM_STATE_VIEWS, 'decided');

type AccuracyInput = Readonly<{
  filters: Pick<SourceFilters, 'engine'>;
  queries: SourceQueries;
  pilot: boolean;
}>;

function useFactFilters({ engine }: AccuracyInput['filters']) {
  const { projectId } = useProjectScope();
  const codec = useMemo(() => cohortUrlCodec(projectId, FACT_CHECK_COHORT), [projectId]);
  const [cohort] = useUrlState('cohort', codec);
  return { engine, cohort };
}

export function useAccuracy({ filters, queries, pilot }: AccuracyInput) {
  const params = periodSelectionParams(useFactFilters(filters), queries);
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
  const params = selectionParams(useFactFilters(filters), queries);
  const [claimState, setClaimState] = useUrlState('claim_state', CLAIM_STATE_CODEC);
  const claimParams = { ...params, state: claimState === 'all' ? undefined : claimState };
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
  const claims = useInfiniteQuery({
    ...visibilityQueries.accuracyClaims(scope, claimParams),
    enabled,
  });
  const exporting = useMutation({
    mutationFn: async () =>
      saveBlob(
        await visibilityApi.exportAccuracyClaims(queries.projectId, claimParams, {
          workspaceId: queries.workspaceId,
        }),
        'fact-check-claims.csv',
      ),
  });
  return { facts, claims, exporting, claimState, setClaimState };
}
