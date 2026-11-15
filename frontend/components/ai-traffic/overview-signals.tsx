import { Link } from 'react-router-dom';
import type { z } from 'zod';
import type { aiTrafficOverviewSchema, crawlSummarySchema } from '@citeladder/contracts/ai-traffic';
import { formatCount, formatPercent, formatWindowDate } from '@/lib/format';
import {
  citationGapLabel,
  connectionLabel,
  coverageLabel,
  words,
} from '@/lib/ai-traffic/vocabulary';
import { projectDestination } from '@/lib/navigation/project-destination';
import type { SourceStep } from '@/components/integrations/data-sources';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DisplayTime } from '@/components/ui/display-time';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { pageNumberControls, useTablePage } from '@/components/ui/pager';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
  TitledSection,
} from '@/components/ui/section';
import { TableCell, TableRow } from '@/components/ui/table';

type Overview = z.infer<typeof aiTrafficOverviewSchema>;
type CrawlSummary = z.infer<typeof crawlSummarySchema>;

const PURPOSE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'day', label: 'Reporting day', kind: 'date' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'requests', label: 'Requests', width: 'figure', kind: 'number' },
];

/** Rows per page of the daily purpose table (client-side; the series arrives whole). */
const PURPOSE_PAGE_SIZE = 10;

/**
 * The Overview's key figures, as stat cards: first whether AI sends you
 * visits (the referral sessions GA4 reported), then what the crawl logs
 * observed and the citations AI Visibility tracked. A figure that cannot be
 * read says which absence it is and carries the one step that fixes it. The
 * notes that qualify the whole window sit under the title.
 */
export function OverviewFigures({
  data,
  projectId,
  crawlAvailable,
  ga4,
  onConnectCrawl,
}: Readonly<{
  data: Overview;
  projectId: string;
  /** GA4's connection step from the one owner; `null` while it is unknown. */
  ga4: SourceStep | null;
  /** False when this workspace cannot collect crawl logs yet. */
  crawlAvailable: boolean;
  onConnectCrawl?: () => void;
}>) {
  return (
    <Section variant="group">
      <SectionHeader>
        <SectionTitle>Key figures</SectionTitle>
        <CrawlNotes crawl={data.crawl} available={crawlAvailable} />
      </SectionHeader>
      <SectionContent>
        <FigureStrip
          label="AI Traffic key figures"
          segments={[
            referralFigure(data.referrals, ga4),
            ...crawlFigures(data.crawl, crawlAvailable, onConnectCrawl),
            citationFigure(data.citations, projectId),
          ]}
        />
      </SectionContent>
    </Section>
  );
}

/** Short enough that every label in the strip holds one line, so values share a baseline. */
const CRAWL_REQUESTS = 'Crawler requests';

const CRAWL_EMPTY = {
  not_connected: 'Connect crawl logs to observe recognized automated requests.',
  awaiting_data: 'Source connected. Awaiting the first accepted batch.',
  connected: 'No matching requests were observed in the available logs. Coverage is incomplete.',
} as const;

function crawlFigures(
  crawl: CrawlSummary,
  available: boolean,
  onConnect: (() => void) | undefined,
): FigureSegment[] {
  if (!available)
    return [
      {
        key: 'requests',
        label: CRAWL_REQUESTS,
        value: null,
        missingLabel: 'Unavailable',
        sub: 'Crawl log collection is not available for this workspace yet. AI referrals and tracked citations are measured without it.',
      },
    ];
  const status =
    crawl.connection === 'connected'
      ? coverageLabel(crawl.coverage)
      : connectionLabel(crawl.connection);
  const failed = crawl.failed_verification_requests ?? 0;
  const failedNote =
    failed > 0 ? `${formatCount(failed)} failed verification requests are shown separately.` : null;
  if (crawl.requests === null)
    return [
      {
        key: 'requests',
        label: CRAWL_REQUESTS,
        value: null,
        missingLabel: status,
        sub: failedNote
          ? `${CRAWL_EMPTY[crawl.connection]} ${failedNote}`
          : CRAWL_EMPTY[crawl.connection],
        action:
          crawl.connection === 'not_connected' ? (
            <ActionButton action="connectCrawlLogs" onClick={onConnect} />
          ) : undefined,
      },
    ];
  return [
    {
      key: 'requests',
      label: CRAWL_REQUESTS,
      value: formatCount(crawl.requests),
      sub: status,
    },
    {
      key: 'pages',
      label: 'Path-level pages',
      value: crawl.pages === null ? null : formatCount(crawl.pages),
      missingLabel: 'Unavailable',
      sub:
        crawl.active_bots === null
          ? 'Active bots unavailable'
          : `Requested by ${formatCount(crawl.active_bots)} active bots`,
    },
    {
      key: 'errors',
      label: 'Error share',
      value: crawl.error_share === null ? null : errorShare(crawl.error_share),
      missingLabel: 'Unavailable',
      sub: failedNote
        ? `Within the selected requests. ${failedNote}`
        : 'Within the selected requests.',
    },
  ];
}

function referralFigure(referrals: Overview['referrals'], ga4: SourceStep | null): FigureSegment {
  const latest = referrals.referral_volume.at(-1);
  // Only a persisted snapshot carries a window; without one nothing has synced.
  const synced = referrals.window_end !== null;
  const share = formatPercent(referrals.referral_share.at(-1)?.value ?? null);
  const unsynced = referralSetup(ga4);
  return {
    key: 'referrals',
    label: 'AI referral sessions',
    caption: 'Latest day',
    value: latest?.value == null ? null : formatCount(latest.value),
    missingLabel: synced ? 'Unavailable' : 'Not synced',
    sub: (
      <>
        {referrals.referral_volume.length ? `${share} of sessions · GA4 · Synced` : unsynced.note}
        {referrals.window_end === null ? null : (
          // A report day is a calendar date, not an instant: it reads the same in every zone.
          <>
            {' · Report through '}
            <time dateTime={referrals.window_end}>{formatWindowDate(referrals.window_end)}</time>
          </>
        )}
      </>
    ),
    action:
      synced || unsynced.action === null ? undefined : (
        <Button asChild variant="secondary">
          {/* The referrals view connects and sets up GA4 in place. */}
          <ProjectLink href="/ai-traffic?tab=referrals">{unsynced.action}</ProjectLink>
        </Button>
      ),
  };
}

/** Before a referral snapshot exists: GA4's real step, never a guessed "not connected". */
function referralSetup(ga4: SourceStep | null): { note: string; action: string | null } {
  if (ga4 === null)
    return { note: 'Referral sessions appear once GA4 imports a report.', action: null };
  switch (ga4.kind) {
    case 'connect':
      return {
        note: 'Connect GA4 and sync a source/medium report to measure referral sessions.',
        action: 'Connect GA4',
      };
    case 'reconnect':
      return { note: 'GA4 needs your consent again.', action: 'Reconnect GA4' };
    case 'choose':
      return {
        note: 'GA4 is connected. Choose its property to import referral sessions.',
        action: 'Choose GA4 property',
      };
    case 'ready':
      return {
        note: 'GA4 is connected. Referral sessions appear after its next import.',
        action: null,
      };
    default:
      return ga4 satisfies never;
  }
}

function citationFigure(citations: Overview['citations'], projectId: string): FigureSegment {
  const measured = citations.state === 'measured';
  return {
    key: 'citations',
    label: 'Tracked citations',
    value: measured ? formatCount(citations.count) : null,
    missingLabel: 'Not available yet',
    sub: measured ? citations.label : `${citations.label} · ${citationGapLabel(citations.reason)}`,
    action: (
      <Button asChild variant="secondary">
        <Link to={projectDestination('/visibility', null, projectId)}>Open AI Visibility</Link>
      </Button>
    ),
  };
}

const COVERAGE_NOTE: Partial<Record<CrawlSummary['coverage'], string>> = {
  partial: 'Coverage is incomplete. These are observations within the available logs.',
  declared_complete: 'Complete within the client-reported file scan.',
};

/** What qualifies every crawl figure in the window: its coverage and when it was processed. */
function CrawlNotes({ crawl, available }: Readonly<{ crawl: CrawlSummary; available: boolean }>) {
  if (!available) return null;
  const coverage = COVERAGE_NOTE[crawl.coverage] ?? null;
  if (!coverage && !crawl.last_processed_at) return null;
  return (
    <SectionDescription>
      {coverage}
      {coverage && crawl.last_processed_at ? ' ' : null}
      {crawl.last_processed_at ? (
        <>
          Reporting timezone: {crawl.reporting_timezone}. Processed{' '}
          <DisplayTime value={crawl.last_processed_at} />.
        </>
      ) : null}
    </SectionDescription>
  );
}

/**
 * Requests per reporting day and purpose, newest day first, a page at a
 * time: a 90-day window holds hundreds of rows.
 */
export function RequestsByPurpose({ series }: Readonly<{ series: CrawlSummary['series'] }>) {
  const rows = [...series].reverse();
  const { page, setPage, pageCount, from, to } = useTablePage(rows.length, PURPOSE_PAGE_SIZE);
  return (
    <TitledSection title="Recognized requests by purpose">
      <DataTable
        label="Recognized requests by purpose"
        columns={PURPOSE_COLUMNS}
        minWidth="sm"
        pageSize={PURPOSE_PAGE_SIZE}
        rowCount={Math.min(PURPOSE_PAGE_SIZE, to - from + 1)}
        pager={{
          range: { from, to, total: rows.length, noun: 'rows' },
          ...pageNumberControls(page, pageCount, setPage),
        }}
      >
        {rows.slice(from - 1, to).map((s) => (
          <TableRow key={s.date + s.purpose}>
            <TableCell>
              <time dateTime={s.date}>{formatWindowDate(s.date)}</time>
            </TableCell>
            <TableCell>{words(s.purpose)}</TableCell>
            <TableCell numeric>{formatCount(s.requests)}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

function errorShare(value: number) {
  return value > 0 && value < 0.001 ? '<0.1%' : formatPercent(value);
}
