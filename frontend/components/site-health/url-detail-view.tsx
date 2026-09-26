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
import { Card, CardContent } from '@/components/ui/card';
import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { Label, textRole } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { EditorialSectionHeader, ledgerClasses } from '@/components/ui/workspace';
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
}: Readonly<{
  detail: PageDetail;
  rerunPending: boolean;
  rerunQueued: boolean;
  onRerun: () => void;
}>) {
  return (
    <PageShell
      title={pageDisplayTitle(detail.title, detail.display_url)}
      actions={
        <Button size="sm" onClick={onRerun} disabled={rerunPending}>
          {rerunLabel(rerunPending, rerunQueued)}
        </Button>
      }
    >
      <Stack gap="workspace">
        <PageMetadata detail={detail} />
        <UrlScoreSummary detail={detail} />
        <PageMeasurements detail={detail} />
        <IssuesList issues={detail.issues} />
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
      <div className="grid min-w-0 gap-[var(--workspace-gap)]">
        <section className="border-border-subtle grid gap-4 border-y py-4">
          <EditorialSectionHeader
            title="Delivery Metrics"
            description="Static HTTP-level measurements"
          />
          <DeliveryMetrics delivery={detail.delivery} />
        </section>
        <section className="border-border-subtle grid gap-4 border-y py-4">
          {detail.internal_links ? (
            <EditorialSectionHeader
              title="Internal Links"
              description={`Modelled over ${detail.internal_links.source_page_count} observed crawl page${detail.internal_links.source_page_count === 1 ? '' : 's'}${detail.internal_links.observed_crawl_incomplete ? '; this crawl is incomplete or sampled' : ''}`}
            />
          ) : (
            <EditorialSectionHeader title="Internal Links" />
          )}
          {detail.internal_links ? (
            <InternalLinksCard links={detail.internal_links} crawlId={detail.crawl_id} />
          ) : (
            <p className={textRole('body')}>Internal links not measured for this page.</p>
          )}
        </section>
      </div>
    );
  }
  return (
    <section className="min-w-0">
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
            <p className={textRole('body')}>Internal links not measured for this page.</p>
          )}
        </TabPanel>
      </Tabs>
    </section>
  );
}

function PageMetadata({ detail }: Readonly<{ detail: PageDetail }>) {
  const timeZone = useDisplayTimeZone();
  return (
    <section className="border-border-subtle min-w-0 border-b pb-4">
      <dl className="grid min-w-0 gap-x-6 gap-y-4 min-[701px]:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <DetailFact label="URL" className="min-[701px]:col-span-2 xl:col-span-1">
          <ExternalHttpLink
            href={detail.display_url}
            className={textRole(
              'bodyStrong',
              'tabular-nums text-accent-text min-w-0 [overflow-wrap:anywhere] hover:underline',
            )}
          >
            {detail.display_url}
          </ExternalHttpLink>
        </DetailFact>
        <DetailFact label="Page Kind">
          <PageKindBadge pageKind={detail.page_kind} />
        </DetailFact>
        <DetailFact label="Last Audit">
          <span className={textRole('bodyStrong')}>
            {formatAudited(detail.last_audited, timeZone)}
          </span>
        </DetailFact>
        <DetailFact label="Status">
          <Badge variant="status" value={pageStatusBadgeValue(detail.analysis_status)}>
            {statusLabel(detail.analysis_status)}
          </Badge>
        </DetailFact>
      </dl>
    </section>
  );
}

function DetailFact({
  label,
  children,
  className,
}: Readonly<{ label: string; children: React.ReactNode; className?: string }>) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1', className)}>
      <dt className={textRole('meta')}>{label}</dt>
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
    <div className="grid gap-3">
      <p className={textRole('meta', 'max-[980px]:hidden')}>Static HTTP-level measurements</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="grid gap-0.5">
            <Label>{item.label}</Label>
            <dd className={textRole('metricSm', 'tabular-nums')}>
              {item.value === PLACEHOLDER ? <UnavailableValue state="not_measured" /> : item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function IssuesList({ issues }: Readonly<{ issues: IssueOccurrence[] }>) {
  const ordered = [...issues].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className={textRole('objectTitle')}>All Issues ({issues.length})</h2>
          <span className="text-muted text-xs">Sorted by severity</span>
        </div>
        {ordered.length === 0 ? (
          <p className={textRole('body')}>No issues detected on this page.</p>
        ) : (
          <ol className={ledgerClasses()}>
            {ordered.map((issue, index) => (
              <li key={issue.occurrence_id} className="grid gap-2 py-3">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="text-muted w-6 shrink-0 text-xs tabular-nums">
                      {index + 1}
                    </span>
                    <span className={textRole('bodyStrong')}>{issue.issue_title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge
                      className={cn(
                        issue.dimension === 'aeo' ? 'text-accent-text' : 'text-info-text',
                      )}
                    >
                      {dimensionLabel(issue.dimension)}
                    </Badge>
                    <Badge variant="status" value={severityBadgeValue(issue.severity)}>
                      {severityLabel(issue.severity)}
                    </Badge>
                  </span>
                </span>
                <div className="pl-9">
                  <IssueEvidence occurrence={issue} />
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
