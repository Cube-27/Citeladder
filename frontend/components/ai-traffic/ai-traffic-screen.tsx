'use client';
import { TRAFFIC_TABS } from '@/lib/config/crawl-logs';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useTrafficData, type TrafficDataTab } from '@/lib/ai-traffic/use-traffic-data';
import { PageShell } from '@/components/layout/page-shell';
import { PageLoading } from '@/components/layout/page-loading';
import { TabsRoot, TabsBar } from '@/components/ui/tabs';
import { Alert } from '@/components/ui/alert';
import { ReadError } from '@/components/ui/read-error';
import { CursorPager } from '@/components/ui/cursor-pager';
import { AiReferralsScreen } from './referrals-screen';
import { TrafficControls } from './traffic-controls';
import { TrafficOverview, TrafficCrawlers, TrafficActivity } from './traffic-views';
export { CrawlSignalPanel } from './traffic-views';
const tabCodec = stringUrlCodec(
  TRAFFIC_TABS.map((t) => t.value),
  'overview',
);
export function AiTrafficScreen() {
  const [tab, setTab] = useUrlState('tab', tabCodec);
  const tabs = <TabsBar variant="band" ariaLabel="AI Traffic views" items={TRAFFIC_TABS} />;
  return (
    <TabsRoot value={tab} onValueChange={setTab}>
      {tab === 'referrals' ? (
        <AiReferralsScreen tabs={tabs} />
      ) : (
        <TrafficDataView tab={tab} tabs={tabs} />
      )}
    </TabsRoot>
  );
}
function TrafficDataView({ tab, tabs }: Readonly<{ tab: TrafficDataTab; tabs: React.ReactNode }>) {
  const model = useTrafficData(tab);
  const { projectId, workspaceId, summary, crawlers, activity, catalog, pager, next } = model;
  return (
    <PageShell title="AI Traffic" tabs={tabs} controls={<TrafficControls model={model} />}>
      <TrafficStatus model={model} />
      {tab === 'overview' && summary.data ? (
        <TrafficOverview
          data={summary.data}
          projectId={projectId}
          workspaceId={workspaceId}
          range={model.selection.range}
        />
      ) : null}
      {tab === 'crawlers' && crawlers.data ? <TrafficCrawlers data={crawlers.data} /> : null}
      {tab === 'activity' && activity.data ? (
        <TrafficActivity data={activity.data} catalog={catalog.data} />
      ) : null}
      {tab !== 'overview' ? (
        <div className="flex justify-end gap-2">
          <CursorPager
            page={pager.page}
            canPrev={pager.canPrev}
            canNext={!!next}
            onPrev={pager.pop}
            onNext={() => pager.push(next ?? null)}
          />
        </div>
      ) : null}
    </PageShell>
  );
}
function TrafficStatus({ model }: Readonly<{ model: ReturnType<typeof useTrafficData> }>) {
  const { isLoading, current, projectId, exporting } = model;
  return (
    <>
      {isLoading || current.isLoading ? <PageLoading label="Loading AI Traffic…" /> : null}
      {!isLoading && !projectId ? (
        <Alert tone="info">Select a project to inspect AI Traffic.</Alert>
      ) : null}
      {current.isError ? (
        <ReadError
          error={current.error}
          fallback="Could not read AI Traffic"
          onRetry={() => current.refetch()}
        />
      ) : null}
      {exporting.isError ? <Alert tone="danger">{exporting.error.message}</Alert> : null}
    </>
  );
}
