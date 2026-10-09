import { useState, useSyncExternalStore } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { Stack } from '@/components/ui/layout';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { InternalLinksCard } from '@/components/site-health/internal-links-card';
import { IssueEvidence } from '@/components/site-health/issue-evidence';
import { PageKindBadge } from '@/components/site-health/page-kind-badge';
import { UrlScoreSummary } from '@/components/site-health/url-score-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineEmpty } from '@/components/ui/inline-empty';
import { StatGrid } from '@/components/ui/stat-grid';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { ledgerClasses } from '@/components/ui/workspace';
import type { DeliveryFacts, IssueOccurrence, PageDetail } from '@/lib/api/types';
import {
  dimensionLabel,
  severityBadgeValue,
  severityLabel,
  severityRank,
} from '@/lib/site-health/issues';
import {
  PLACEHOLDER,
  formatAudited,
  pageDisplayTitle,
  pageStatusBadgeValue,
  statusLabel,
} from '@/lib/site-health/status';
import { cn } from '@/lib/utils';
import { TrafficUrlButton } from '@/components/ai-traffic/url-panel';

/** Queued is neither "running" nor "ready to ask again": it is its own state. */
function rerunLabel(pending: boolean, queued: boolean): string {
  if (pending) return 'Re-auditing…';
  if (queued) return 'Re-audit queued';
  return 'Re-audit this page';
}

export function UrlDetailView({
  detail,
  rerunPending,
  rerunQueued,
  onRerun,
  children,
}: Readonly<{
  detail: PageDetail;
  rerunPending: boolean;
  rerunQueued: boolean;
  onRerun: () => void;
  children?: React.ReactNode;
}>) {
  return (
    <PageShell
      title={pageDisplayTitle(detail.title, detail.display_url)}
      actions={
        <>
          {detail.url_hash ? <TrafficUrlButton urlHash={detail.url_hash} /> : null}
          <Button size="sm" onClick={onRerun} disabled={rerunPending}>
            {rerunLabel(rerunPending, rerunQueued)}
          </Button>
        </>
      }
    >
      <Stack gap="workspace">
        <PageMetadata detail={detail} />
        <UrlScoreSummary detail={detail} />
        <PageMeasurements detail={detail} />
        <IssuesList issues={detail.issues} />
        {children}
      </Stack>
    </PageShell>
  );
}

const mobileMeasurementsQuery = '(max-width: 980px)';

function subscribeMobileMeasurements(notify: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => undefined;
  const media = window.matchMedia(mobileMeasurementsQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}

function isMobileMeasurementsViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(mobileMeasurementsQuery).matches
    : false;
}

function PageMeasurements({ detail }: Readonly<{ detail: PageDetail }>) {
  const [selected, setSelected] = useState<'delivery' | 'links'>('delivery');
  const isMobile = useSyncExternalStore(
    subscribeMobileMeasurements,
    isMobileMeasurementsViewport,
    () => false,
  );
  if (isMobile) {
    return (
      <Stack gap="workspace" className="min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Delivery Metrics</CardTitle>
            <CardDescription>Static HTTP-level measurements</CardDescription>
          </CardHeader>
          <CardContent>
            <DeliveryMetrics delivery={detail.delivery} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            {/* The card states its own crawl scope; repeating it here doubled it. */}
            <CardTitle>Internal Links</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.internal_links ? (
              <InternalLinksCard links={detail.internal_links} crawlId={detail.crawl_id} />
            ) : (
              <InlineEmpty>Internal links not measured for this page.</InlineEmpty>
            )}
          </CardContent>
        </Card>
      </Stack>
    );
  }
  return (
    <Card className="min-w-0">
      <CardContent>
        <Tabs
          value={selected}
          onValueChange={setSelected}
          items={[
            { value: 'delivery', label: 'Delivery Metrics' },
            { value: 'links', label: 'Internal Links' },
          ]}
          ariaLabel="Page measurements"
        >
          <TabPanel value="delivery" forceMount className="pt-4">
            <DeliveryMetrics delivery={detail.delivery} />
          </TabPanel>
          <TabPanel value="links" forceMount className="pt-4">
            {detail.internal_links ? (
              <InternalLinksCard links={detail.internal_links} crawlId={detail.crawl_id} />
            ) : (
              <InlineEmpty>Internal links not measured for this page.</InlineEmpty>
            )}
          </TabPanel>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PageMetadata({ detail }: Readonly<{ detail: PageDetail }>) {
  const timeZone = useDisplayTimeZone();
  return (
    <Card className="min-w-0">
      <CardContent>
        <dl className="grid min-w-0 gap-x-6 gap-y-4 min-[701px]:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <DetailFact label="URL" className="min-[701px]:col-span-2 xl:col-span-1">
            <TextLink
              variant="external"
              text="itemTitle"
              href={detail.display_url}
              className="min-w-0 [overflow-wrap:anywhere] tabular-nums"
            >
              {detail.display_url}
            </TextLink>
          </DetailFact>
          <DetailFact label="Page Kind">
            <PageKindBadge pageKind={detail.page_kind} />
          </DetailFact>
          <DetailFact label="Last Audit">
            <span className={textRole('itemTitle')}>
              {formatAudited(detail.last_audited, timeZone)}
            </span>
          </DetailFact>
          <DetailFact label="Status">
            <Badge variant="status" value={pageStatusBadgeValue(detail.analysis_status)}>
              {statusLabel(detail.analysis_status)}
            </Badge>
          </DetailFact>
        </dl>
      </CardContent>
    </Card>
  );
}

function DetailFact({
  label,
  children,
  className,
}: Readonly<{ label: string; children: React.ReactNode; className?: string }>) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1', className)}>
      <dt className={textRole('caption')}>{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function DeliveryMetrics({ delivery }: Readonly<{ delivery: DeliveryFacts }>) {
  const items = [
    { label: 'TTFB', value: formatMeasuredMs(delivery.ttfb_ms) },
    {
      label: 'Response Size',
      value: formatBytes(delivery.decoded_bytes ?? delivery.html_bytes),
    },
    {
      label: 'HTTP Status',
      value: delivery.status_code === null ? PLACEHOLDER : `${delivery.status_code}`,
    },
    { label: 'Compression', value: delivery.compression ?? 'none' },
    { label: 'HTTP Version', value: delivery.http_version ?? PLACEHOLDER },
    { label: 'Cache-Control', value: delivery.cache_control ?? PLACEHOLDER },
    {
      label: 'Blocking Resources',
      value:
        delivery.blocking_resource_count === null
          ? PLACEHOLDER
          : `${delivery.blocking_resource_count}`,
    },
    { label: 'Wire Size', value: formatBytes(delivery.wire_bytes) },
  ];
  return (
    <Stack>
      <p className={textRole('caption', 'max-[980px]:hidden')}>Static HTTP-level measurements</p>
      <StatGrid
        columns={4}
        items={items.map((item) => ({
          key: item.label,
          label: item.label,
          value: item.value === PLACEHOLDER ? null : item.value,
        }))}
      />
    </Stack>
  );
}

function IssuesList({ issues }: Readonly<{ issues: IssueOccurrence[] }>) {
  const ordered = [...issues].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return (
    <Card>
      <CardHeader actions={<span className="type-caption">Sorted by severity</span>}>
        <CardTitle>All Issues ({issues.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <InlineEmpty>No issues detected on this page.</InlineEmpty>
        ) : (
          <ol className={ledgerClasses()}>
            {ordered.map((issue) => (
              <li
                key={issue.occurrence_id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="grid min-w-0 gap-2">
                  <span className={textRole('itemTitle')}>{issue.issue_title}</span>
                  <IssueEvidence occurrence={issue} />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge>{dimensionLabel(issue.dimension)}</Badge>
                  <Badge variant="status" value={severityBadgeValue(issue.severity)}>
                    {severityLabel(issue.severity)}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function formatMeasuredMs(value: number | null): string {
  return value === null || value <= 0 ? PLACEHOLDER : `${Math.round(value)}ms`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return PLACEHOLDER;
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round((bytes / 1024) * 10) / 10} KB`;
}
