import { useQuery } from '@tanstack/react-query';
import { Drawer } from '@/components/ui/drawer';
import { ReadError } from '@/components/ui/read-error';
import { PageLoading } from '@/components/layout/page-loading';
import { TrafficPager } from './traffic-pager';
import { aiTrafficApi, type TrafficFilters } from '@/lib/api/ai-traffic';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext } from '@/lib/project/project-context';
import { useCursorTable } from '@/lib/table/use-cursor-table';
import { TrafficPages } from './pages-view';

export function CrawlerPages({
  botId,
  onClose,
  filters = {},
}: Readonly<{ botId: string | null; onClose: () => void; filters?: TrafficFilters }>) {
  const { activeProject } = useProjectContext(),
    workspaceId = activeProject?.workspace_id ?? '',
    projectId = activeProject?.id ?? '';
  const pager = useCursorTable(JSON.stringify([workspaceId, projectId, botId, filters]));
  const selected = { ...filters, bot_id: botId, cursor: pager.cursor, limit: pager.pageSize };
  const query = useQuery({
    queryKey: queryKeys.aiTraffic.view(workspaceId, projectId, 'crawler-pages', selected),
    queryFn: ({ signal }) => aiTrafficApi.pages(projectId, selected, { workspaceId, signal }),
    enabled: !!botId && !!workspaceId && !!projectId,
  });
  return (
    <Drawer
      open={!!botId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Observed crawler pages"
      description="Joinable path observations for the selected crawler."
    >
      {query.isLoading ? <PageLoading label="Loading crawler paths…" /> : null}
      {query.isError ? (
        <ReadError
          error={query.error}
          fallback="Could not read crawler pages"
          onRetry={() => query.refetch()}
        />
      ) : null}
      {query.data && !query.isError ? (
        <>
          <TrafficPages data={query.data} filters={filters} />
          <TrafficPager
            page={pager.page}
            canPrev={pager.canPrev}
            canNext={!!query.data.next_cursor}
            onPrev={pager.pop}
            onNext={() => pager.push(query.data?.next_cursor ?? null)}
          />
        </>
      ) : null}
    </Drawer>
  );
}
