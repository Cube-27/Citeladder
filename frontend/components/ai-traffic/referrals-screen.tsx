'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AiReferralsContent } from '@/components/ai-traffic/referrals-content';
import { AnalyticsToolbar } from '@/components/ui/analytics-toolbar';
import { aiTrafficApi } from '@/lib/api/ai-traffic';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import {
  GRANULARITY_OPTIONS,
  RANGE_OPTIONS,
  rangeLabel,
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
    queryKey: queryKeys.aiTraffic.dashboard(projectId ?? '', { ...rangeParams, granularity }),
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
      retainPreviousDataForScope(projectId!, previousData, previousQuery),
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
    <AnalyticsToolbar
      range={range}
      defaultRange="latest"
      rangeLabel={rangeLabel(range)}
      rangeOptions={RANGE_OPTIONS}
      onChangeRange={onChangeRange}
      granularity={granularity}
      granularityOptions={GRANULARITY_OPTIONS}
      onChangeGranularity={onChangeGranularity}
      fetching={fetching}
      testId="ai-traffic-toolbar"
    />
  );
}
