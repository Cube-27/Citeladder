import { useQuery } from '@tanstack/react-query';

import { Absence } from '@/components/ui/absence';
import { Inline } from '@/components/ui/layout';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { integrationsQueries, type IntegrationBackfillProgress } from '@/lib/api/integrations';
import { SYNC_RUN_POLL_MS } from '@/lib/config/operational';
import { formatShortDate } from '@/lib/format';

export function BackfillProgress({
  workspaceId,
  connectionId,
}: Readonly<{ workspaceId: string; connectionId: string }>) {
  const progress = useBackfillProgress(workspaceId, connectionId);
  if (!progress || progress.state === 'not_started') return null;

  return (
    <Inline className="flex-wrap">
      <span className={textRole('body', 'text-ink-2')}>History</span>
      <span className="text-caption text-ink-2 tabular-nums">{progressLabel(progress)}</span>
    </Inline>
  );
}

export function BackfillHistory({
  workspaceId,
  connectionId,
}: Readonly<{ workspaceId: string; connectionId: string }>) {
  const progressQuery = useBackfillProgressQuery(workspaceId, connectionId);
  const progress = progressQuery.data;
  if (progressQuery.isError) return <Absence state="unavailable" />;
  if (!progress) return <Skeleton lines={1} label="Loading history…" />;
  if (progress.state === 'not_started') return <span className="text-ink-2">Not started</span>;
  return <span className="truncate">{progressLabel(progress)}</span>;
}

function useBackfillProgress(workspaceId: string, connectionId: string) {
  return useBackfillProgressQuery(workspaceId, connectionId).data ?? null;
}

function useBackfillProgressQuery(workspaceId: string, connectionId: string) {
  return useQuery({
    ...integrationsQueries.backfillProgress(workspaceId, connectionId),
    refetchInterval: (query) =>
      query.state.data?.state === 'importing' ? SYNC_RUN_POLL_MS : false,
  });
}

function progressLabel(progress: IntegrationBackfillProgress): string {
  const { completed_windows: completed, total_windows: total } = progress;
  if (progress.state === 'importing') {
    return `Importing: ${completed} of ${total} windows`;
  }
  const covered = coveredLabel(progress);
  if (progress.state === 'partial') {
    return `${covered} · ${progress.failed_windows} of ${total} windows failed`;
  }
  return covered;
}

function coveredLabel(progress: IntegrationBackfillProgress): string {
  const { covered_from: from, covered_through: through } = progress;
  if (!from || !through) return 'No history imported';
  return `${formatShortDate(from)}–${formatShortDate(through)}`;
}
