'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, RefreshCw } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/layout/page-header';
import { PageLoading } from '@/components/layout/page-loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { AccentEyebrow } from '@/components/ui/eyebrow';
import { textRole } from '@/components/ui/typography';
import { MetricGroup, MetricItem } from '@/components/ui/workspace';
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
  return (
    <OpportunitiesContent projectId={activeProject?.id ?? null} projectLoading={projectLoading} />
  );
}

function OpportunitiesContent({
  projectId,
  projectLoading,
}: Readonly<{ projectId: string | null; projectLoading: boolean }>) {
  const summaryQuery = useQuery({
    ...opportunitiesQueries.summary(projectId ?? ''),
    enabled: Boolean(projectId),
    refetchInterval: (query) => opportunitySummaryPollingInterval(query.state),
  });
  const summary = summaryQuery.data ?? null;
  const screen = opportunityScreenState(
    projectId,
    projectLoading,
    summaryQuery.isPending,
    summaryQuery.isError,
    summary,
  );
  return (
    <div className="grid gap-[var(--page-section-gap)]">
      <PageHeader
        actions={
          projectId && summary?.computed ? (
            <SummaryActions projectId={projectId} summary={summary} />
          ) : undefined
        }
      />
      <OpportunitiesScreenBody state={screen} projectId={projectId} summary={summary} />
    </div>
  );
}

function opportunityScreenState(
  projectId: string | null,
  projectLoading: boolean,
  pending: boolean,
  error: boolean,
  summary: OpportunitySummary | null,
) {
  if (projectLoading) return 'loading';
  if (!projectId) return 'missing-project';
  if (!summary) return pending ? 'loading' : error ? 'error' : 'empty';
  return summary.computed ? 'ready' : 'preparing';
}

function OpportunitiesScreenBody({
  state,
  projectId,
  summary,
}: Readonly<{ state: string; projectId: string | null; summary: OpportunitySummary | null }>) {
  if (state === 'missing-project')
    return <Alert tone="info">Select or create a project to view its opportunities.</Alert>;
  if (state === 'loading') return <PageLoading label="Loading opportunities…" />;
  if (state === 'error')
    return <Alert tone="danger">Could not load opportunities. Please refresh.</Alert>;
  // Settled with nothing to show. This branch used to `return null`, which left
  // the reader on a blank pane while the summary poll kept running — a screen
  // that looks like it is still loading and never finishes. Say so instead.
  if (!projectId || !summary)
    return (
      <Alert tone="info">
        No recommendations yet. Run a visibility or website review and they will appear here.
      </Alert>
    );
  if (state === 'preparing')
    return <PreparingRecommendations projectId={projectId} summary={summary} />;
  return (
    <>
      <SummaryStrip summary={summary} />
      <OpportunitiesCatalog key={projectId} projectId={projectId} />
    </>
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
      pending={recompute.isPending}
      pendingLabel="Trying again…"
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
    <div className="grid gap-3 py-[var(--empty-state-padding)]">
      <AccentEyebrow>Recommendations</AccentEyebrow>
      <h2 className={textRole('sectionTitle')}>
        {delayed ? 'Recommendations need another try' : 'Preparing recommendations'}
      </h2>
      <p className="text-secondary max-w-md text-sm">
        {preparationMessage(summary.activation_state)}
      </p>
      {delayed ? <RetryButton projectId={projectId} variant="secondary" /> : null}
    </div>
  );
}

/**
 * The queue's state as measured values, not four stacked sentences.
 *
 * This was a prose paragraph of counts, a second of percentages, a third
 * explaining the sample, and a fourth naming the compute time — four rows to
 * say six numbers. The numbers now read as numbers, and the sample size that
 * qualifies the mix sits with the mix rather than on its own line.
 */
function SummaryStrip({ summary }: Readonly<{ summary: OpportunitySummary }>) {
  const openCount = summary.counts_by_status.open ?? 0;
  const inProgressCount = summary.counts_by_status.in_progress ?? 0;
  const highImpactCount =
    (summary.counts_by_severity.critical ?? 0) + (summary.counts_by_severity.high ?? 0);
  const mix = summary.source_mix;

  return (
    <div className="border-border-subtle grid gap-3 border-b pb-3">
      <MetricGroup>
        <MetricItem label="Open" value={String(openCount)} />
        <MetricItem label="High impact" value={String(highImpactCount)} />
        <MetricItem label="In progress" value={String(inProgressCount)} />
        {mix.state === 'available' ? (
          <MetricItem
            label="Earned evidence"
            value={`${mix.percentages.earned ?? 0}%`}
            detail={`${mix.percentages.competitive_evidence ?? 0}% competitive · ${
              mix.percentages.owned ?? 0
            }% owned · ${mix.observation_count} sources`}
          />
        ) : null}
      </MetricGroup>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted text-xs">Computed {formatAudited(summary.computed_at)}</p>
        {summary.stale ? (
          <Badge variant="status" value="warning">
            Newer evidence available
          </Badge>
        ) : null}
      </div>
      {summary.limitations.length > 0 ? (
        <p className="text-warning text-xs">{summary.limitations.join(' ')}</p>
      ) : null}
    </div>
  );
}

function SummaryActions({
  projectId,
  summary,
}: Readonly<{ projectId: string; summary: OpportunitySummary }>) {
  return (
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
  );
}

