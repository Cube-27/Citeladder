'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AiReferralsContent } from '@/components/ai-traffic/referrals-content';
import { FilterChoice, FilterRow } from '@/components/ui/filter-row';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Spinner } from '@/components/ui/spinner';
import { aiTrafficApi } from '@/lib/api/ai-traffic';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import {
  GRANULARITY_OPTIONS,
  RANGE_OPTIONS,
  rangeToParams,
  type AiReferralsGranularity,
  type AiReferralsRange,
} from '@/lib/ai-traffic/options';
import { useProjectContext } from '@/lib/project/project-context';

export function AiReferralsScreen({ tabs }: Readonly<{ tabs?: React.ReactNode }> = {}) {
  const { activeProject, isLoading: isProjectLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const [range, setRange] = useState<AiReferralsRange>('latest');
  const [granularity, setGranularity] = useState<AiReferralsGranularity>('week');
  const rangeParams = useMemo(() => rangeToParams(range), [range]);
  const dashboardQuery = useQuery({
    queryKey: queryKeys.aiTraffic.dashboard(activeProject?.workspace_id ?? '', projectId ?? '', {
      ...rangeParams,
      granularity,
    }),
    queryFn: ({ signal }) =>
      aiTrafficApi.getDashboard(
        projectId!,
        { ...rangeParams, granularity },
        {
          signal,
          workspaceId: activeProject?.workspace_id,
        },
      ),
    enabled: Boolean(projectId && activeProject?.workspace_id),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[3] === activeProject?.workspace_id
        ? retainPreviousDataForScope(projectId!, previousData, previousQuery)
        : undefined,
  });

  return (
    <AiReferralsContent
      tabs={tabs}
      projectId={projectId}
      projectLoading={isProjectLoading}
      range={range}
      query={dashboardQuery}
      toolbar={
        <AiReferralsToolbar
          range={range}
          onChangeRange={setRange}
          granularity={granularity}
          onChangeGranularity={setGranularity}
          fetching={dashboardQuery.isFetching}
        />
      }
    />
  );
}

function AiReferralsToolbar({
  range,
  onChangeRange,
  granularity,
  onChangeGranularity,
  fetching,
}: Readonly<{
  range: AiReferralsRange;
  onChangeRange: (range: AiReferralsRange) => void;
  granularity: AiReferralsGranularity;
  onChangeGranularity: (granularity: AiReferralsGranularity) => void;
  fetching: boolean;
}>) {
  return (
    <FilterRow
      status={
        fetching ? (
          <>
            <Spinner size="sm" />
            Updating data… Previous data shown.
          </>
        ) : null
      }
    >
      <FilterChoice
        label="Range"
        menuLabel="Date range"
        value={range}
        defaultValue="latest"
        options={RANGE_OPTIONS}
        onChange={onChangeRange}
      />
      <SegmentedControl
        value={granularity}
        onChange={onChangeGranularity}
        options={GRANULARITY_OPTIONS}
        ariaLabel="Chart interval"
      />
    </FilterRow>
  );
}
