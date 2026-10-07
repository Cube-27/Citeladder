'use client';
import { TRAFFIC_TABS } from '@/lib/config/crawl-logs';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useTrafficData, type TrafficDataTab } from '@/lib/ai-traffic/use-traffic-data';
import { PageShell } from '@/components/layout/page-shell';
import { PageLoading } from '@/components/layout/page-loading';
import { Stack } from '@/components/ui/layout';
import { TabsRoot, TabsBar, TabPanel } from '@/components/ui/tabs';
import { Alert } from '@/components/ui/alert';
import { ReadError } from '@/components/ui/read-error';
import { AiReferralsScreen } from './referrals-screen';
import { TrafficControls } from './traffic-controls';
import { TrafficOverview, TrafficCrawlers, TrafficActivity } from './traffic-views';
import { TrafficPager } from './traffic-pager';
import { TrafficPages } from './pages-view';
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
  const controls = <TrafficControls model={model} />;
  // First load keeps the identity, tab and control bands; only the work waits.
  if (model.isLoading || model.current.isLoading)
    return (
      <PageShell tabs={tabs} controls={controls}>
        <PageLoading label="Loading AI Traffic…" />
      </PageShell>
    );
  return (
    <PageShell tabs={tabs} controls={controls}>
      <Stack gap="workspace">
        <TrafficStatus model={model} />
        {tab === 'overview' && summary.data ? (
          <TrafficOverview
            data={summary.data}
            projectId={projectId}
            workspaceId={workspaceId}
            range={model.selection.range}
          />
        ) : null}
        {tab === 'crawlers' && crawlers.data ? (
          <TrafficCrawlers
            data={crawlers.data}
            filters={{
              range: model.selection.range,
              verification:
                model.selection.verification === 'default'
                  ? undefined
                  : model.selection.verification,
            }}
          />
        ) : null}
        {tab === 'activity' && activity.data ? (
          <TrafficActivity data={activity.data} catalog={catalog.data} />
        ) : null}
        {tab === 'pages' ? <PagesPanel model={model} /> : null}
        {tab === 'overview' ? null : (
          <TrafficPager
            page={pager.page}
            canPrev={pager.canPrev}
            canNext={!!next}
            onPrev={pager.pop}
            onNext={() => pager.push(next ?? null)}
          />
        )}
      </Stack>
    </PageShell>
  );
}
function PagesPanel({ model }: Readonly<{ model: ReturnType<typeof useTrafficData> }>) {
  const { pages, selection } = model;
  if (pages.isError || !pages.data) return null;
  return (
    <TabPanel value="pages">
      <TrafficPages
        data={pages.data}
        filters={{
          range: selection.range,
          verification: selection.verification === 'default' ? undefined : selection.verification,
        }}
      />
    </TabPanel>
  );
}
function TrafficStatus({ model }: Readonly<{ model: ReturnType<typeof useTrafficData> }>) {
  const { current, projectId, exporting } = model;
  return (
    <>
      {projectId ? null : <Alert tone="info">Select a project to inspect AI Traffic.</Alert>}
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
