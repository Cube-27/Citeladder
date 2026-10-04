'use client';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  aiTrafficOverviewSchema,
  botCrawlersResponseSchema,
  botActivityResponseSchema,
  crawlCatalogSchema,
  crawlSummarySchema,
} from '@citeladder/contracts/ai-traffic';
import { aiTrafficApi } from '@/lib/api/ai-traffic';
import { queryKeys } from '@/lib/api/query-keys';
import { useCursorTable } from '@/lib/table/use-cursor-table';
import { projectDestination, workspaceDestination } from '@/lib/navigation/project-destination';
import { connectionLabel, coverageLabel, words } from '@/lib/ai-traffic/vocabulary';
import { CalendarX } from 'lucide-react';
import { formatPercent } from '@/lib/ai-traffic/series';
import { TabPanel } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricValue } from '@/components/ui/metric-value';
import { Stack } from '@/components/ui/layout';
import { DisplayTime } from '@/components/ui/display-time';
import { ReadError } from '@/components/ui/read-error';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CrawlLogConnections } from './crawl-log-connections';
import { InsightStrip } from './insight-strip';
import { CrawlerPages } from './crawler-pages';
import { TrafficNoResults } from './empty-state';
import { TrafficPager } from './traffic-pager';
import type { TrafficFilters } from '@/lib/api/ai-traffic';
export function TrafficOverview({
  data,
  projectId,
  workspaceId,
  range,
}: Readonly<{
  data: z.infer<typeof aiTrafficOverviewSchema>;
  projectId: string;
  workspaceId: string;
  range: string;
}>) {
  const [connectOpen, setConnectOpen] = useState(false);
  const crawlConnected = data.crawl.connection !== 'not_connected';
  return (
    <TabPanel value="overview">
      <Stack gap="workspace">
        <InsightStrip projectId={projectId} workspaceId={workspaceId} range={range} />
        <div className="grid gap-[var(--workspace-gap)] lg:grid-cols-3">
          <CrawlSignalPanel data={data.crawl} onConnect={() => setConnectOpen(true)} />
          <ReferralSignal data={data.referrals} workspaceId={workspaceId} />
          <CitationSignal data={data.citations} projectId={projectId} />
        </div>
        {data.crawl.series.length ? <RequestsByPurpose series={data.crawl.series} /> : null}
        <CrawlLogConnections
          open={connectOpen}
          onOpenChange={setConnectOpen}
          headerWhenEmpty={false}
        />
        {crawlConnected ? (
          <CoverageTable projectId={projectId} workspaceId={workspaceId} range={range} />
        ) : null}
      </Stack>
    </TabPanel>
  );
}
/** One Overview signal: title and state, the figure or why it is missing, one action. */
function SignalCard({
  title,
  status,
  action,
  children,
}: Readonly<{ title: string; status?: string; action?: ReactNode; children: ReactNode }>) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {status ? <Badge>{status}</Badge> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {children}
        {action ? <div className="mt-auto pt-1">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
function ReferralSignal({
  data,
  workspaceId,
}: Readonly<{
  data: z.infer<typeof aiTrafficOverviewSchema>['referrals'];
  workspaceId: string;
}>) {
  const latest = data.referral_volume.at(-1);
  const synced = data.window_end !== null;
  return (
    <SignalCard
      title="AI referrals"
      status={synced ? 'GA4 · Synced' : 'GA4 · Not synced'}
      action={
        synced ? null : (
          <Button asChild variant="secondary" size="sm">
            <Link
              to={workspaceDestination(
                '/settings',
                new URLSearchParams({ tab: 'integrations' }),
                workspaceId,
              )}
            >
              Connect GA4
            </Link>
          </Button>
        )
      }
    >
      {data.referral_volume.length ? (
        <div className="grid gap-1">
          <p className="type-label">AI referral sessions in the latest day</p>
          <MetricValue
            value={latest?.value == null ? null : String(latest.value)}
            label="Unavailable"
          />
          <p className="type-caption">
            Share of sessions: {formatPercent(data.referral_share.at(-1)?.value ?? null, 1)}
          </p>
        </div>
      ) : (
        <p className="type-body text-secondary">
          Connect GA4 and sync a source/medium report to measure referral sessions.
        </p>
      )}
      {synced ? (
        <p className="type-caption">
          Report through <DisplayTime value={data.window_end} dateOnly />
        </p>
      ) : null}
    </SignalCard>
  );
}
function CitationSignal({
  data,
  projectId,
}: Readonly<{
  data: z.infer<typeof aiTrafficOverviewSchema>['citations'];
  projectId: string;
}>) {
  return (
    <SignalCard
      title="Tracked citations"
      action={
        <Button asChild variant="secondary" size="sm">
          <Link to={projectDestination('/visibility', null, projectId)}>Open AI Visibility</Link>
        </Button>
      }
    >
      <div className="grid gap-1">
        <p className="type-label">{data.label}</p>
        <MetricValue value={data.count === null ? null : String(data.count)} label="Unavailable" />
      </div>
    </SignalCard>
  );
}
function RequestsByPurpose({
  series,
}: Readonly<{ series: z.infer<typeof crawlSummarySchema>['series'] }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recognized requests by purpose</CardTitle>
      </CardHeader>
      <Table>
        <caption className="sr-only">Daily recognized automated requests</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Reporting day</TableHead>
            <TableHead>Purpose</TableHead>
            <TableHead numeric>Requests</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {series.map((s) => (
            <TableRow key={s.date + s.purpose}>
              <TableCell>{s.date}</TableCell>
              <TableCell>{words(s.purpose)}</TableCell>
              <TableCell numeric>{s.requests}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
export function TrafficCrawlers({
  data,
  filters = {},
}: Readonly<{ data: z.infer<typeof botCrawlersResponseSchema>; filters?: TrafficFilters }>) {
  const [botId, setBotId] = useState<string | null>(null);
  return (
    <TabPanel value="crawlers">
      {data.items.length ? (
        <Table>
          <caption className="sr-only">Recognized crawlers</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Crawler</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead numeric>Requests</TableHead>
              <TableHead numeric>Path-level pages</TableHead>
              <TableHead>Last observed</TableHead>
              <TableHead>Status and verification</TableHead>
              <TableHead>Folder and resource breakdown</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((b) => (
              <TableRow key={b.bot_id}>
                <TableCell>{b.label}</TableCell>
                <TableCell>{words(b.purpose)}</TableCell>
                <TableCell numeric>{b.requests}</TableCell>
                <TableCell numeric>
                  <Button variant="ghost" size="sm" onClick={() => setBotId(b.bot_id)}>
                    {b.pages ?? 'Unavailable'} paths
                  </Button>
                </TableCell>
                <TableCell>
                  <DisplayTime value={b.last_seen} />
                </TableCell>
                <TableCell>
                  <CellLines
                    lines={[
                      entries(b.status_codes),
                      entries(b.verification),
                      'Reasons within raw retention: ' + entries(b.verification_reasons),
                    ]}
                  />
                </TableCell>
                <TableCell>
                  <CellLines lines={[entries(b.folders), entries(b.resources)]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <TrafficNoResults
          heading="No matching requests were observed"
          description="Check coverage on Overview before interpreting absence in the available logs."
        />
      )}
      <CrawlerPages botId={botId} onClose={() => setBotId(null)} filters={filters} />
    </TabPanel>
  );
}
export function TrafficActivity({
  data,
  catalog,
}: Readonly<{
  data: z.infer<typeof botActivityResponseSchema>;
  catalog?: z.infer<typeof crawlCatalogSchema>;
}>) {
  return (
    <TabPanel value="activity">
      {data.items.length ? (
        <Table>
          <caption className="sr-only">Retained automated request activity</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Observed</TableHead>
              <TableHead>Bot</TableHead>
              <TableHead>Host and path</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead numeric>Status</TableHead>
              <TableHead>Verification</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <DisplayTime value={r.occurred_at} />
                </TableCell>
                <TableCell>
                  {catalog?.bots.find((b) => b.bot_id === r.bot_id)?.label ?? r.bot_id}
                </TableCell>
                <TableCell>
                  <CellLines
                    lines={[
                      r.host + r.display_path,
                      r.identity === 'non_joinable'
                        ? 'Redacted; non-joinable'
                        : 'Path-level identity',
                    ]}
                  />
                </TableCell>
                <TableCell>{words(r.resource_class)}</TableCell>
                <TableCell numeric>{r.status_code}</TableCell>
                <TableCell>
                  <CellLines
                    lines={[
                      words(r.verification) +
                        ' · ' +
                        words(r.verification_reason ?? r.verification_basis ?? 'unknown'),
                      r.verification_basis === 'later_snapshot'
                        ? 'Verified using a later IP-range snapshot.'
                        : '',
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <TrafficNoResults
          heading="No matching requests"
          description="Nothing in the available retained logs matches these filters."
        />
      )}
    </TabPanel>
  );
}
/** A primary value with its qualifiers beneath it in caption ink. */
function CellLines({ lines }: Readonly<{ lines: string[] }>) {
  const [first, ...rest] = lines.filter(Boolean);
  return (
    <div className="grid gap-0.5">
      <span>{first}</span>
      {rest.map((line) => (
        <span key={line} className="type-caption">
          {line}
        </span>
      ))}
    </div>
  );
}
function entries(values: Record<string, number>) {
  return Object.entries(values)
    .map(([key, value]) => words(key) + ': ' + value)
    .join(' · ');
}
export function CrawlSignalPanel({
  data,
  onConnect,
}: Readonly<{ data: z.infer<typeof crawlSummarySchema>; onConnect?: () => void }>) {
  const emptyMessage = {
    not_connected: 'Connect crawl logs to observe recognized automated requests.',
    awaiting_data: 'Source connected. Awaiting the first accepted batch.',
    connected: 'No matching requests were observed in the available logs. Coverage is incomplete.',
  }[data.connection];
  return (
    <SignalCard
      title="Crawlers"
      status={
        data.connection === 'connected'
          ? coverageLabel(data.coverage)
          : connectionLabel(data.connection)
      }
      action={
        data.connection === 'not_connected' ? (
          <Button variant="secondary" size="sm" onClick={onConnect}>
            Connect crawl logs
          </Button>
        ) : null
      }
    >
      {data.requests === null ? (
        <p className="type-body text-secondary">{emptyMessage}</p>
      ) : (
        <dl className="grid gap-3">
          <div className="grid gap-1">
            <dt className="type-label">Recognized automated requests</dt>
            <dd>
              <MetricValue value={String(data.requests)} label="Unavailable" />
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="type-label">Path-level pages · active bots</dt>
            <dd className="type-body">
              {data.pages ?? 'Unavailable'} pages · {data.active_bots ?? 'Unavailable'} bots
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="type-label">Error share within the selected requests</dt>
            <dd className="type-body">
              {data.error_share === null ? 'Unavailable' : errorShare(data.error_share)}
            </dd>
          </div>
        </dl>
      )}
      {data.coverage === 'partial' ? (
        <p className="type-caption">
          Coverage is incomplete. These are observations within the available logs.
        </p>
      ) : null}
      {data.coverage === 'declared_complete' ? (
        <p className="type-caption">Complete within the client-reported file scan.</p>
      ) : null}
      {data.failed_verification_requests !== null && data.failed_verification_requests > 0 ? (
        <p className="type-caption">
          {data.failed_verification_requests} failed verification requests are shown separately.
        </p>
      ) : null}
      {data.last_processed_at ? (
        <p className="type-caption">
          Reporting timezone: {data.reporting_timezone}. Processed{' '}
          <DisplayTime value={data.last_processed_at} />.
        </p>
      ) : null}
    </SignalCard>
  );
}
function errorShare(value: number) {
  return value > 0 && value < 0.001 ? '<0.1%' : (value * 100).toFixed(1) + '%';
}
function CoverageTable({
  projectId,
  workspaceId,
  range,
}: Readonly<{ projectId: string; workspaceId: string; range: string }>) {
  const pager = useCursorTable(JSON.stringify([projectId, workspaceId, range]));
  const filters = { range, cursor: pager.cursor, limit: pager.pageSize };
  const query = useQuery({
    queryKey: queryKeys.aiTraffic.view(workspaceId, projectId, 'coverage', filters),
    queryFn: ({ signal }) => aiTrafficApi.coverage(projectId, filters, { workspaceId, signal }),
  });
  const data = query.data;
  return (
    <section className="grid gap-3" aria-labelledby="ai-traffic-coverage">
      <h2 id="ai-traffic-coverage" className="type-section-title">
        Coverage by source and reporting day
      </h2>
      {query.isError ? (
        <ReadError
          error={query.error}
          fallback="Could not read coverage"
          onRetry={() => query.refetch()}
        />
      ) : null}
      {data && !data.items.length && !pager.canPrev ? (
        <EmptyState
          variant="compact"
          headingLevel={3}
          icon={CalendarX}
          heading="No persisted coverage in this range"
        />
      ) : null}
      {data && (data.items.length || pager.canPrev) ? (
        <>
          <Table>
            <caption className="sr-only">Crawl log coverage and receipt gaps</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead numeric>Batch / heartbeat count</TableHead>
                <TableHead numeric>Longest receipt gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((r) => (
                <TableRow key={r.source_id + r.reporting_date + r.reporting_timezone}>
                  <TableCell>
                    <CellLines lines={[r.reporting_date, r.reporting_timezone]} />
                  </TableCell>
                  <TableCell>
                    <CellLines
                      lines={[
                        data.sources.find((s) => s.id === r.source_id)?.host ?? r.source_id,
                        r.source_id,
                      ]}
                    />
                  </TableCell>
                  <TableCell>
                    <CellLines lines={[coverageLabel(r.coverage), words(r.reason)]} />
                  </TableCell>
                  <TableCell numeric>
                    {r.batch_count} / {r.heartbeat_count}
                  </TableCell>
                  <TableCell numeric>{r.max_gap_minutes.toFixed(1)} minutes</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TrafficPager
            page={pager.page}
            canPrev={pager.canPrev}
            canNext={!!data.next_cursor}
            onPrev={pager.pop}
            onNext={() => pager.push(data.next_cursor)}
          />
        </>
      ) : null}
    </section>
  );
}
