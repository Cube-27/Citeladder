import { useState, type ReactNode } from 'react';

import type { PageDetail } from '@citeladder/contracts';

import { PageChecks } from '@/components/site-health/page-checks';
import { PageIssues } from '@/components/site-health/page-issues';
import { PageKindBadge } from '@/components/site-health/page-kind-badge';
import { PageLink } from '@/components/site-health/page-link';
import { scoreUnavailableState } from '@/components/site-health/url-score-summary';
import { Absence, printed } from '@/components/ui/absence';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { FactList } from '@/components/ui/facts';
import { Inline, Stack } from '@/components/ui/layout';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow, UrlText } from '@/components/ui/table';
import { TabPanel, TabRail, TabsRoot } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { textRole } from '@/components/ui/typography';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatDisplayTimestamp } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { formatScore, pageStatusBadgeValue, statusLabel } from '@/lib/site-health/status';

type Pane = 'overview' | 'issues' | 'actions' | 'checks' | 'in' | 'out' | 'history' | 'traffic';
type Links = NonNullable<PageDetail['internal_links']>;
type Neighbour = Links['top_inbound'][number];

const missing = <StatusMark tone="negative">Missing</StatusMark>;
const notMeasured = <Absence state="not_measured" />;

export function PageDrawerView({
  detail,
  actions,
  work,
  history,
  traffic,
  children,
}: Readonly<{
  detail: PageDetail;
  actions?: ReactNode;
  work: { count: number | undefined; list: ReactNode };
  history: ReactNode;
  traffic: ReactNode;
  children?: ReactNode;
}>) {
  const [pane, setPane] = useState<Pane>('overview');
  const links = detail.internal_links;
  const checks = detail.evaluations.filter((evaluation) => evaluation.display_applicability);
  const items = [
    { value: 'overview', label: 'Overview' },
    { value: 'issues', label: 'Issues', count: detail.issues.length },
    { value: 'actions', label: 'Actions', count: work.count },
    { value: 'checks', label: 'Checks', count: checks.length },
    { value: 'in', label: 'Linked from', count: links?.inbound_count },
    { value: 'out', label: 'Links out', count: links?.outbound_count },
    { value: 'history', label: 'History' },
    ...(traffic ? [{ value: 'traffic', label: 'AI traffic' } as const] : []),
  ] as const satisfies readonly { value: Pane; label: string; count?: number }[];
  return (
    <TabsRoot
      value={pane}
      onValueChange={setPane}
      orientation="vertical"
      className="phone:grid-cols-1 grid min-h-0 flex-1 grid-cols-[11.5rem_minmax(0,1fr)]"
    >
      <div className="border-rule phone:border-r-0 phone:border-b border-r p-3">
        <TabRail items={items} ariaLabel="Page sections" />
      </div>
      <div className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain p-6">
        <Stack gap="item" className="mb-6 empty:hidden">
          {actions ? <Inline className="flex-wrap justify-end">{actions}</Inline> : null}
          {children}
        </Stack>
        <TabPanel value="overview">
          <Stack gap="workspace">
            <Figures detail={detail} />
            <FactSection title="URL" facts={urlFacts(detail, useDisplayTimeZone())} />
            <FactSection title="Server HTML" facts={htmlFacts(detail)} />
            <FactSection title="Delivery" facts={deliveryFacts(detail)} />
          </Stack>
        </TabPanel>
        <TabPanel value="issues">
          <PageIssues
            issues={detail.issues}
            audited={detail.analysis_status === 'completed'}
            crawlId={detail.crawl_id}
          />
        </TabPanel>
        <TabPanel value="actions">{work.list}</TabPanel>
        <TabPanel value="checks">
          <PageChecks evaluations={detail.evaluations} />
        </TabPanel>
        <TabPanel value="in">
          <LinkTable
            label="Linked from"
            first="Source page"
            rows={links?.top_inbound}
            total={links?.inbound_count}
            crawlId={detail.crawl_id}
          />
        </TabPanel>
        <TabPanel value="out">
          <LinkTable
            label="Links out"
            first="Destination"
            rows={links?.top_outbound}
            total={links?.outbound_count}
            crawlId={detail.crawl_id}
          />
        </TabPanel>
        <TabPanel value="history">{history}</TabPanel>
        <TabPanel value="traffic">{traffic}</TabPanel>
      </div>
    </TabsRoot>
  );
}

function Figures({ detail }: Readonly<{ detail: PageDetail }>) {
  const segments: readonly FigureSegment[] = [
    {
      key: 'web',
      label: 'Web fundamentals',
      value:
        detail.web_fundamentals_score === null
          ? scoreUnavailableState(detail.web_fundamentals_state)
          : printed(formatScore(detail.web_fundamentals_score)),
    },
    {
      key: 'aeo',
      label: 'AEO readiness',
      value:
        detail.aeo_readiness_score === null
          ? scoreUnavailableState(detail.aeo_measurement_state, detail.aeo_measurement_reason)
          : printed(formatScore(detail.aeo_readiness_score)),
    },
  ];
  return <FigureStrip label="Page scores" segments={segments} />;
}

type FactRow = { label: string; value: ReactNode };

function FactSection({ title, facts }: Readonly<{ title: string; facts: readonly FactRow[] }>) {
  return (
    <section className="min-w-0">
      <h3 className={textRole('subheading', 'mb-3')}>{title}</h3>
      <FactList layout="ruled" label={title} facts={facts} />
    </section>
  );
}

function yesNo(value: boolean | null): ReactNode {
  if (value === null) return notMeasured;
  return value ? 'Yes' : 'No';
}

function statusMark(code: number | null): ReactNode {
  if (code === null) return notMeasured;
  let tone: 'positive' | 'warning' | 'negative' = 'negative';
  if (code < 300) tone = 'positive';
  else if (code < 400) tone = 'warning';
  return <StatusMark tone={tone}>{code}</StatusMark>;
}

function urlFacts(detail: PageDetail, timeZone: string): FactRow[] {
  const depth = detail.internal_links?.depth_from_home ?? null;
  const canonical = detail.facts?.canonical_url;
  let canonicalValue: ReactNode = notMeasured;
  if (canonical) canonicalValue = <UrlText url={canonical} />;
  else if (detail.facts) canonicalValue = missing;
  return [
    { label: 'Kind', value: <PageKindBadge pageKind={detail.page_kind} /> },
    { label: 'HTTP status', value: statusMark(detail.delivery.status_code) },
    { label: 'Indexable', value: yesNo(detail.main_content_indexable) },
    { label: 'Canonical', value: canonicalValue },
    { label: 'Depth', value: depth === null ? notMeasured : formatCount(depth) },
    {
      label: 'Audited',
      value: detail.last_audited
        ? formatDisplayTimestamp(detail.last_audited, timeZone)
        : notMeasured,
    },
    ...(detail.analysis_status === 'completed'
      ? []
      : [
          {
            label: 'Status',
            value: (
              <StatusMark variant="status" value={pageStatusBadgeValue(detail.analysis_status)}>
                {statusLabel(detail.analysis_status)}
              </StatusMark>
            ),
          },
        ]),
  ];
}

function htmlFacts(detail: PageDetail): FactRow[] {
  const facts = detail.facts;
  if (!facts)
    return ['Title', 'Meta description', 'H1', 'Words in content', 'Structured data'].map(
      (label) => ({ label, value: notMeasured }),
    );
  const text = (value: string | null) => (value?.trim() ? value : missing);
  const count = (value: number | null) => (value === null ? notMeasured : formatCount(value));
  return [
    { label: 'Title', value: text(facts.title) },
    { label: 'Meta description', value: text(facts.meta_description) },
    { label: 'H1', value: count(facts.h1_count) },
    { label: 'Words in content', value: count(facts.word_count) },
    {
      label: 'Structured data',
      value:
        facts.structured_data_types.length === 0 ? (
          <StatusMark tone="warning">None</StatusMark>
        ) : (
          <span className="flex min-w-0 flex-wrap gap-1">
            {facts.structured_data_types.map((type) => (
              <Tag key={type}>{type}</Tag>
            ))}
          </span>
        ),
    },
  ];
}

function deliveryFacts(detail: PageDetail): FactRow[] {
  const delivery = detail.delivery;
  const bytes = delivery.decoded_bytes ?? delivery.html_bytes;
  return [
    {
      label: 'Time to first byte',
      value:
        delivery.ttfb_ms === null || delivery.ttfb_ms <= 0
          ? notMeasured
          : `${Math.round(delivery.ttfb_ms)} ms`,
    },
    {
      label: 'Response size',
      value: bytes === null ? notMeasured : `${formatCount(Math.round(bytes / 1024))} KB`,
    },
    { label: 'Compression', value: delivery.compression ?? notMeasured },
    { label: 'HTTP version', value: delivery.http_version ?? notMeasured },
  ];
}

function linkColumns(first: string): readonly DataTableColumn[] {
  return [
    { key: 'page', label: first, kind: 'identity' },
    { key: 'links', label: 'Links', kind: 'number', width: 'figure' },
    { key: 'placement', label: 'Placement', width: 'category' },
  ];
}

function LinkTable({
  label,
  first,
  rows,
  total,
  crawlId,
}: Readonly<{
  label: string;
  first: string;
  rows: readonly Neighbour[] | undefined;
  total: number | undefined;
  crawlId: string;
}>) {
  const shown = rows ?? [];
  return (
    <Stack gap="item">
      <DataTable
        label={label}
        columns={linkColumns(first)}
        state={
          shown.length === 0
            ? {
                kind: 'empty',
                icon: ICONS.siteHealth,
                headingLevel: 3,
                heading: rows ? 'No links found' : "Internal links weren't counted for this page",
              }
            : undefined
        }
      >
        {shown.map((row) => (
          <TableRow key={row.url}>
            <TableCell>
              {row.site_url_id ? (
                <PageLink
                  text="body"
                  underline="hover"
                  crawlId={crawlId}
                  siteUrlId={row.site_url_id}
                  className="flex min-w-0 items-center"
                >
                  <UrlText url={row.url} />
                </PageLink>
              ) : (
                <UrlText url={row.url} />
              )}
            </TableCell>
            <TableCell numeric>{formatCount(row.anchor_count)}</TableCell>
            <TableCell className="whitespace-nowrap">
              {row.main_content ? 'Main content' : 'Navigation or footer'}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      {total !== undefined && total > shown.length && shown.length > 0 ? (
        <p className={textRole('caption', 'text-ink-2')}>
          Showing {formatCount(shown.length)} of {formatCount(total)}
        </p>
      ) : null}
    </Stack>
  );
}
