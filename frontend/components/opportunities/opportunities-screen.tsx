'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, RefreshCw } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { AccentEyebrow } from '@/components/ui/eyebrow';
import { Skeleton } from '@/components/ui/skeleton';
import { displayHeadingLgClasses } from '@/components/ui/typography';
import { OpportunitiesCatalog } from '@/components/opportunities/opportunities-catalog';
import { opportunitySummaryPollingInterval } from '@/components/opportunities/opportunity-summary-polling';
import {
  opportunitiesApi,
  opportunitiesMutations,
  opportunitiesQueries,
} from '@/lib/api/opportunities';
import { queryKeys } from '@/lib/api/query-keys';
import type { OpportunitySummary } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';
import { formatAudited } from '@/lib/site-health/status';
import { cn } from '@/lib/utils';

function preparationMessage(state: OpportunitySummary['activation_state']): string {
  if (state === 'waiting_for_evidence') {
    return 'We need a completed visibility or website review before we can prioritize actions.';
  }
  if (state === 'delayed') {
    return 'The latest findings are safe. Try preparing the recommendations again.';
  }
  return 'We are turning your latest findings into prioritized actions automatically.';
}

/**
 * Opportunities screen container: compact recommendation queue + catalog.
 *
 * Resolves the active project and follows the server-owned recommendation
 * refresh. Normal completion is automatic; a retry is offered only after a
 * delayed terminal failure.
 */
export function OpportunitiesScreen() {
  const { activeProject, isLoading: projectLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;

  const summaryQuery = useQuery({
    ...opportunitiesQueries.summary(projectId ?? ''),
    enabled: Boolean(projectId),
    refetchInterval: (query) => opportunitySummaryPollingInterval(query.state),
  });
  const summary = summaryQuery.data ?? null;
  const loading = projectLoading || (Boolean(projectId) && summaryQuery.isPending && !summary);

  return (
    <div className="grid gap-6">
      {!projectLoading && !projectId ? (
        <Alert tone="info">Select or create a project to view its opportunities.</Alert>
      ) : loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : summaryQuery.isError && !summary ? (
        <Alert tone="danger">Could not load opportunities. Please refresh.</Alert>
      ) : projectId && summary && !summary.computed ? (
        <PreparingRecommendations projectId={projectId} summary={summary} />
      ) : projectId && summary ? (
        <>
          <SummaryStrip projectId={projectId} summary={summary} />
          <OpportunitiesCatalog key={projectId} projectId={projectId} />
        </>
      ) : null}
    </div>
  );
}

/** Recompute mutation + invalidation shared by the strip and the empty state. */
function useRecompute() {
  const queryClient = useQueryClient();
  return useMutation({
    ...opportunitiesMutations.recompute(),
    onSuccess: async () => {
      // A recompute supersedes the whole live set — the entire namespace
      // (summary, every list page/filter, details) is stale.
      await queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
    },
  });
}

function RetryButton({
  projectId,
  variant = 'primary',
}: Readonly<{ projectId: string; variant?: 'primary' | 'secondary' }>) {
  const recompute = useRecompute();
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={recompute.isPending}
      className={cn(recompute.isPending && 'cursor-wait opacity-90')}
      onClick={() => recompute.mutate({ projectId })}
    >
      <RefreshCw className={cn('size-4', recompute.isPending && 'animate-spin')} aria-hidden />
      Try recommendations again
    </Button>
  );
}

function PreparingRecommendations({
  projectId,
  summary,
}: Readonly<{ projectId: string; summary: OpportunitySummary }>) {
  const delayed = summary.activation_state === 'delayed';
  return (
    <Card>
      <CardContent className="grid justify-items-center gap-3 py-10 text-center">
        <AccentEyebrow>Recommendations</AccentEyebrow>
        <h2 className={displayHeadingLgClasses}>
          {delayed ? 'Recommendations need another try' : 'Preparing recommendations'}
        </h2>
        <p className="text-secondary max-w-md text-sm">
          {preparationMessage(summary.activation_state)}
        </p>
        {delayed ? <RetryButton projectId={projectId} variant="secondary" /> : null}
      </CardContent>
    </Card>
  );
}

function SummaryStrip({
  projectId,
  summary,
}: Readonly<{ projectId: string; summary: OpportunitySummary }>) {
  const openCount = summary.counts_by_status.open ?? 0;
  const inProgressCount = summary.counts_by_status.in_progress ?? 0;
  const highImpactCount =
    (summary.counts_by_severity.critical ?? 0) + (summary.counts_by_severity.high ?? 0);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-3">
        <div className="grid gap-1">
          <AccentEyebrow>Recommendation queue</AccentEyebrow>
          <p className="text-foreground text-sm">
            <span className="mono font-medium">{openCount}</span> open recommendations
            <span className="text-muted"> · </span>
            <span className="mono font-medium">{highImpactCount}</span> high impact
            <span className="text-muted"> · </span>
            <span className="mono font-medium">{inProgressCount}</span> in progress
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted text-xs">
              Last computed {formatAudited(summary.computed_at)} from your latest available
              evidence.
            </p>
            {summary.stale ? (
              <Badge variant="status" value="warning">
                Newer evidence available
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="secondary" size="sm">
                <Download className="size-4" aria-hidden />
                Export
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownItem asChild>
                <a href={opportunitiesApi.exportUrl(projectId, 'csv')} download>
                  Download CSV
                </a>
              </DropdownItem>
              <DropdownItem asChild>
                <a href={opportunitiesApi.exportUrl(projectId, 'md')} download>
                  Download Markdown
                </a>
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
          {summary.activation_state === 'delayed' ? <RetryButton projectId={projectId} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}
