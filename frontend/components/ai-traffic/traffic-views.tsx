'use client';
import { useState } from 'react';
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
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { TabPanel } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { DisplayTime } from '@/components/ui/display-time';
import { ReadError } from '@/components/ui/read-error';
import { CursorPager } from '@/components/ui/cursor-pager';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CrawlLogConnections } from './crawl-log-connections';
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
  const integrationHref = workspaceDestination(
    '/settings',
    new URLSearchParams({ tab: 'integrations' }),
    workspaceId,
  );
  return (
    <TabPanel value="overview">
      <div className="grid gap-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <CrawlSignalPanel data={data.crawl} onConnect={() => setConnectOpen(true)} />
          <Card>
            <CardHeader>
              <CardTitle>AI referrals</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Badge>
                GA4 sessions ·{' '}
                {data.referrals.window_end ? 'Persisted report' : 'Not connected or awaiting sync'}
              </Badge>
              {data.referrals.referral_volume.length ? (
                <p className="type-body">
                  {data.referrals.referral_volume.at(-1)?.value ?? 'Unavailable'} AI referral
                  sessions in the latest day. Share:{' '}
                  {data.referrals.referral_share.at(-1)?.value === null
                    ? 'Unavailable'
                    : (data.referrals.referral_share.at(-1)?.value ?? 'Unavailable')}
                </p>
              ) : (
                <p className="type-body">
                  Connect GA4 and sync a source/medium report to measure referral sessions.
                </p>
              )}
              <p className="type-caption">
                Report through{' '}
                <DisplayTime value={data.referrals.window_end} dateOnly fallback="Awaiting data" />
              </p>
              <Button asChild variant="secondary">
                <Link to={integrationHref}>Connect GA4</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Tracked citations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="type-body">
              {data.citations.count ?? 'Unavailable'} tracked citations · {data.citations.label}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recognized requests by purpose</CardTitle>
          </CardHeader>
          <CardContent>
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
                {data.crawl.series.map((s) => (
                  <TableRow key={s.date + s.purpose}>
                    <TableCell>{s.date}</TableCell>
                    <TableCell>{s.purpose.replaceAll('_', ' ')}</TableCell>
                    <TableCell numeric>{s.requests}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <CrawlLogConnections open={connectOpen} onOpenChange={setConnectOpen} />
        <CoverageTable projectId={projectId} workspaceId={workspaceId} range={range} />
      </div>
    </TabPanel>
  );
}
export function TrafficCrawlers({
  data,
}: Readonly<{ data: z.infer<typeof botCrawlersResponseSchema> }>) {
  return (
    <TabPanel value="crawlers">
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
              <TableCell>{b.purpose.replaceAll('_', ' ')}</TableCell>
              <TableCell numeric>{b.requests}</TableCell>
              <TableCell numeric>{b.pages ?? 'Unavailable'}</TableCell>
              <TableCell>
                <DisplayTime value={b.last_seen} />
              </TableCell>
              <TableCell>
                {entries(b.status_codes)}
                <br />
                {entries(b.verification)}
                <br />
                Reasons within raw retention: {entries(b.verification_reasons)}
              </TableCell>
              <TableCell>
                {entries(b.folders)}
                <br />
                {entries(b.resources)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!data.items.length ? (
        <Alert tone="info">
          No matching requests were observed in the available logs. Check coverage before
          interpreting absence.
        </Alert>
      ) : null}
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
                {r.host}
                {r.display_path}
                <br />
                {r.identity === 'non_joinable' ? 'Redacted; non-joinable' : 'Path-level identity'}
              </TableCell>
              <TableCell>{r.resource_class}</TableCell>
              <TableCell numeric>{r.status_code}</TableCell>
              <TableCell>
                {r.verification} · {r.verification_reason ?? r.verification_basis}
                {r.verification_basis === 'later_snapshot' ? (
                  <p className="type-caption">Verified using a later IP-range snapshot.</p>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!data.items.length ? (
        <Alert tone="info">No matching requests in the available retained logs.</Alert>
      ) : null}
    </TabPanel>
  );
}
function entries(values: Record<string, number>) {
  return Object.entries(values)
    .map(([key, value]) => key + ': ' + value)
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
    <Card>
      <CardHeader>
        <CardTitle>Crawlers</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Badge>
          {data.connection.replaceAll('_', ' ')} · {data.coverage.replaceAll('_', ' ')}
        </Badge>
        {data.requests === null ? (
          <p className="type-body">{emptyMessage}</p>
        ) : (
          <dl className="grid gap-2">
            <dt className="type-label">Recognized automated requests</dt>
            <dd className="type-figure">{data.requests}</dd>
            <dt className="type-label">Path-level pages · active bots</dt>
            <dd className="type-body">
              {data.pages ?? 'Unavailable'} pages · {data.active_bots ?? 'Unavailable'} bots
            </dd>
            <dt className="type-label">Error share within the selected requests</dt>
            <dd className="type-body">
              {data.error_share === null ? 'Unavailable' : errorShare(data.error_share)}
            </dd>
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
        {data.failed_verification_requests > 0 ? (
          <p className="type-caption">
            {data.failed_verification_requests} failed verification requests are shown separately.
          </p>
        ) : null}
        <p className="type-caption">
          Reporting timezone: {data.reporting_timezone}. Processed{' '}
          <DisplayTime value={data.last_processed_at} fallback="Awaiting processing" />.
        </p>
        <Button variant="secondary" onClick={onConnect}>
          Connect crawl logs
        </Button>
      </CardContent>
    </Card>
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
  return (
    <section className="grid gap-3">
      <h2 className="type-section-title">Coverage by source and reporting day</h2>
      {query.isError ? (
        <ReadError
          error={query.error}
          fallback="Could not read coverage"
          onRetry={() => query.refetch()}
        />
      ) : null}
      {query.data ? (
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
              {query.data.items.map((r) => (
                <TableRow key={r.source_id + r.reporting_date + r.reporting_timezone}>
                  <TableCell>
                    {r.reporting_date} · {r.reporting_timezone}
                  </TableCell>
                  <TableCell>
                    {query.data.sources.find((s) => s.id === r.source_id)?.host} · {r.source_id}
                  </TableCell>
                  <TableCell>
                    {r.coverage.replaceAll('_', ' ')} · {r.reason.replaceAll('_', ' ')}
                  </TableCell>
                  <TableCell numeric>
                    {r.batch_count} / {r.heartbeat_count}
                  </TableCell>
                  <TableCell numeric>{r.max_gap_minutes.toFixed(1)} minutes</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-2">
            <CursorPager
              page={pager.page}
              canPrev={pager.canPrev}
              canNext={!!query.data.next_cursor}
              onPrev={pager.pop}
              onNext={() => pager.push(query.data.next_cursor)}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
