import type { UseQueryResult } from '@tanstack/react-query';

import { AiReferralsEmptyState } from '@/components/ai-referrals/empty-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { rangeLabel, type AiReferralsRange } from '@/lib/ai-referrals/options';
import { isAiReferralsEmpty } from '@/lib/ai-referrals/series';
import type { AiReferrals } from '@/lib/api/ai-referrals';

import { AiReferralsDashboard } from './ai-referrals-dashboard';
import { AiReferralsSkeleton } from './ai-referrals-skeleton';

export function AiReferralsContent({
  projectId,
  projectLoading,
  range,
  query,
  toolbar,
}: Readonly<{
  projectId: string | null;
  projectLoading: boolean;
  range: AiReferralsRange;
  query: UseQueryResult<AiReferrals, Error>;
  toolbar: React.ReactNode;
}>) {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      {toolbar}
      <AiReferralsDataRegion
        projectId={projectId}
        projectLoading={projectLoading}
        range={range}
        query={query}
      />
    </div>
  );
}

function AiReferralsDataRegion({
  projectId,
  projectLoading,
  range,
  query,
}: Omit<React.ComponentProps<typeof AiReferralsContent>, 'toolbar'>) {
  if (projectLoading || (Boolean(projectId) && query.isLoading)) return <AiReferralsSkeleton />;
  if (!projectId) return <Alert tone="info">Select or create a project to see AI referrals.</Alert>;
  if (query.isError) return <AiReferralsError onRetry={() => query.refetch()} />;

  const data = query.data ?? null;
  if (!data || (isAiReferralsEmpty(data) && range === 'latest')) return <AiReferralsEmptyState />;
  if (isAiReferralsEmpty(data)) return <AiReferralsNoSnapshot range={range} />;

  return <AiReferralsDashboard data={data} fetching={query.isFetching} />;
}

function AiReferralsError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <Alert tone="danger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>AI referrals could not be loaded. Check your connection and try again.</span>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </Alert>
  );
}

/**
 * Nothing is PROJECTED at this length yet — distinct from "measured zero",
 * which renders as a dashboard of zeroes. The preset is named rather than a
 * date window: the server resolves a preset against persisted evidence, so
 * there are no client-side bounds to quote, and quoting a window the client
 * invented is what made this surface wrong in the first place.
 */
function AiReferralsNoSnapshot({ range }: Readonly<{ range: AiReferralsRange }>) {
  return (
    <Alert tone="info">
      No synced AI-referral snapshot covers {rangeLabel(range).toLowerCase()} yet. Switch to the
      latest synced window, or run a sync from Performance.
    </Alert>
  );
}
