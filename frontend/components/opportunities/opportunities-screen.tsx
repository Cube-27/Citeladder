'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, RefreshCw } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { AccentEyebrow } from '@/components/ui/eyebrow';
import { Skeleton } from '@/components/ui/skeleton';
import { displayHeadingLgClasses } from '@/components/ui/typography';
import { OpportunitiesCatalog } from '@/components/opportunities/opportunities-catalog';
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

/**
 * Opportunities screen container: compact recommendation queue + catalog.
 *
 * Resolves the active project, renders the latest recompute snapshot as the
 * queue summary (API-owned counts — never a client re-count) with refresh and
 * export actions, then the priority-sorted recommendation catalog. A
 * project that has never been recomputed gets the empty state with a
 * Recompute CTA (and copy pointing at running an audit/crawl first).
 */
export function OpportunitiesScreen() {
  const { activeProject, isLoading: projectLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;

  const summaryQuery = useQuery({
    ...opportunitiesQueries.summary(projectId ?? ''),
    enabled: Boolean(projectId),
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
        <NeverComputed projectId={projectId} />
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

function RecomputeButton({
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
      Refresh recommendations
    </Button>
  );
}

function NeverComputed({ projectId }: Readonly<{ projectId: string }>) {
  return (
    <Card>
      <CardContent className="grid justify-items-center gap-3 py-10 text-center">
        <AccentEyebrow>Recommendations</AccentEyebrow>
        <h2 className={displayHeadingLgClasses}>No recommendations yet</h2>
        <p className="text-secondary max-w-md text-sm">
          Run a visibility audit or Site Health crawl first, then refresh this page to turn the
          latest findings into prioritized actions.
        </p>
        <RecomputeButton projectId={projectId} variant="secondary" />
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
            <span className="mono font-semibold">{openCount}</span> open recommendations
            <span className="text-muted"> · </span>
            <span className="mono font-semibold">{highImpactCount}</span> high impact
            <span className="text-muted"> · </span>
            <span className="mono font-semibold">{inProgressCount}</span> in progress
          </p>
          <p className="text-muted text-xs">
            Updated {formatAudited(summary.computed_at)} from your latest available evidence.
          </p>
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
          <RecomputeButton projectId={projectId} />
        </div>
      </CardContent>
    </Card>
  );
}
