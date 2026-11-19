import type { ReactNode } from 'react';
import type { z } from 'zod';
import type { aiTrafficOverviewSchema, crawlSummarySchema } from '@citeladder/contracts/ai-traffic';
import {
  formatCount,
  formatPercent,
  formatWindowDate,
  type DataAvailabilityState,
} from '@/lib/format';
import {
  citationGapLabel,
  connectionLabel,
  coverageLabel,
  words,
} from '@/lib/ai-traffic/vocabulary';
import type { SourceStep } from '@/components/integrations/data-sources';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { ProjectLink } from '@/components/ui/project-link';
import { StateBlock } from '@/components/ui/state-block';
import { InfoHint } from '@/components/ui/info-hint';
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
  const ga4Step = referralSetup(ga4);
  const ga4Missing = data.referrals.window_end === null && ga4Step.action !== null;
  const crawlMissing =
    crawlAvailable && data.crawl.connection === 'not_connected' && onConnectCrawl !== undefined;
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Key figures</SectionTitle>
        <CrawlNotes crawl={data.crawl} available={crawlAvailable} />
      </SectionHeader>
      <SectionContent>
        <Stack gap="compact">
          <FigureStrip
            label="AI traffic key figures"
            segments={[
              referralFigure(data.referrals, ga4),
              ...crawlFigures(data.crawl, crawlAvailable),
              citationFigure(data.citations),
            ]}
          />
          {/* Each missing source's one next step, once, under the figures it would fill. */}
          {ga4Missing ? (
            <StateBlock
              kind="empty"
              inline
              message={ga4Step.note}
              action={
                <Button asChild>
                  <ProjectLink href="/ai-traffic?tab=referrals" projectId={projectId}>
                    {ga4Step.action}
                  </ProjectLink>
                </Button>
              }
            />
          ) : null}
          {crawlMissing ? (
            <StateBlock
              kind="empty"
              inline
              message={CRAWL_EMPTY.not_connected}
              action={<ActionButton action="connectCrawlLogs" onClick={onConnectCrawl} />}
            />
          ) : null}
        </Stack>
      </SectionContent>
    </Section>
  );
}

/**
 * Whether any key figure is measured or on its way (a source connected). Until
 * one is, and GA4 is not connected either, the Overview is its setup state.
 */
export function overviewStarted(data: Overview): boolean {
  return data.crawl.connection !== 'not_connected' || overviewMeasured(data);
}

/** Whether any key figure holds a measurement; patterns read across them only then. */
export function overviewMeasured(data: Overview): boolean {
  return (
    data.referrals.window_end !== null ||
    data.crawl.requests !== null ||
    data.citations.state === 'measured'
  );
}

/** Short enough that every label in the strip holds one line, so values share a baseline. */
const CRAWL_REQUESTS = 'Crawler requests';

const CRAWL_EMPTY = {
  not_connected: 'Connect crawl logs to observe recognized automated requests.',
  awaiting_data: 'Source connected. Awaiting the first accepted batch.',
  connected: 'No matching requests were observed in the available logs. Coverage is incomplete.',
} as const;

function crawlFigures(crawl: CrawlSummary, available: boolean): FigureSegment[] {
  if (!available)
    return [
      {
        key: 'requests',
        label: CRAWL_REQUESTS,
        value: null,
        missingState: 'unavailable',
        marker: (
          <WhyAbsent label={CRAWL_REQUESTS}>
            Crawl log collection is not available for this workspace yet. AI referrals and tracked
            citations are measured without it.
          </WhyAbsent>
        ),
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
    return [noRequestsFigure({ connection: crawl.connection, status, failedNote })];
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
      missingState: 'unavailable',
      sub:
        crawl.active_bots === null
          ? 'Active bots unavailable'
          : `Requested by ${formatCount(crawl.active_bots)} active bots`,
    },
    {
      key: 'errors',
      label: 'Error share',
      value: crawl.error_share === null ? null : errorShare(crawl.error_share),
      missingState: 'unavailable',
      sub: failedNote
        ? `Within the selected requests. ${failedNote}`
        : 'Within the selected requests.',
    },
  ];
}

/**
 * No crawler requests in the window. Not connected is its own word, with the
 * connect step under the strip; otherwise why waits behind the hint.
 */
function noRequestsFigure({
  connection,
  status,
  failedNote,
}: Readonly<{
  connection: CrawlSummary['connection'];
  status: string;
  failedNote: string | null;
}>): FigureSegment {
  if (connection === 'not_connected')
    return {
      key: 'requests',
      label: CRAWL_REQUESTS,
      value: null,
      missingState: 'not_connected',
    };
  return {
    key: 'requests',
    label: CRAWL_REQUESTS,
    value: null,
    missingLabel: status,
    marker: (
      <WhyAbsent label={CRAWL_REQUESTS}>
        {failedNote ? `${CRAWL_EMPTY[connection]} ${failedNote}` : CRAWL_EMPTY[connection]}
      </WhyAbsent>
    ),
  };
}

function referralFigure(referrals: Overview['referrals'], ga4: SourceStep | null): FigureSegment {
  const latest = referrals.referral_volume.at(-1);
  // Only a persisted snapshot carries a window; without one nothing has synced.
  const synced = referrals.window_end !== null;
  const share = sharePhrase(referrals);
  const unsynced = referralSetup(ga4);
  const reported = referrals.referral_volume.length > 0;
  const label = 'AI referral sessions';
  // A step under the strip already says why; only GA4's own wait needs the hint.
  const hinted = !reported && (synced || unsynced.action === null);
  return {
    key: 'referrals',
    label,
    caption: 'Latest day',
    value: latest?.value == null ? null : formatCount(latest.value),
    missingState: synced ? 'unavailable' : unsyncedKind(ga4),
    marker: hinted ? <WhyAbsent label={label}>{unsynced.note}</WhyAbsent> : undefined,
    sub:
      reported || referrals.window_end !== null ? (
        <>
          {reported ? `${share}GA4 · Synced` : null}
          {referrals.window_end === null ? null : (
            // A report day is a calendar date, not an instant: it reads the same in every zone.
            <>
              {reported ? ' · Report through ' : 'Report through '}
              <time dateTime={referrals.window_end}>{formatWindowDate(referrals.window_end)}</time>
            </>
          )}
        </>
      ) : undefined,
  };
}

/** The latest day's share of sessions as a lead-in, or nothing when it was not measured. */
function sharePhrase(referrals: Overview['referrals']): string {
  const value = referrals.referral_share.at(-1)?.value ?? null;
  return value === null ? '' : `${formatPercent(value)} of sessions · `;
}

/** Which absence a referral figure is before GA4 has synced, by GA4's step. */
function unsyncedKind(ga4: SourceStep | null): DataAvailabilityState {
  // GA4's step is unknown (its read is pending or failed), never assumed.
  if (ga4 === null) return 'unavailable';
  switch (ga4.kind) {
    case 'connect':
    case 'reconnect':
      return 'not_connected';
    case 'choose':
      return 'not_set';
    case 'ready':
      return 'not_run';
    default:
      return ga4 satisfies never;
  }
}

/** Why a figure has no value: a sentence is not a figure's job, so it waits behind the hint. */
function WhyAbsent({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return <InfoHint label={`About ${label}`}>{children}</InfoHint>;
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

function citationFigure(citations: Overview['citations']): FigureSegment {
  const measured = citations.state === 'measured';
  return {
    key: 'citations',
    label: 'Tracked citations',
    value: measured ? formatCount(citations.count) : null,
    // No run is "not run yet"; a run not yet counted is unavailable for now.
    missingState: !measured && citations.reason === 'no_completed_run' ? 'not_run' : 'unavailable',
    sub: measured ? citations.label : `${citations.label} · ${citationGapLabel(citations.reason)}`,
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
    <SectionDescription className="min-w-0">
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
  const { page, setPage, pageCount, from, to } = useTablePage(rows.length, {
    pageSize: PURPOSE_PAGE_SIZE,
    urlKey: 'purpose_page',
  });
  return (
    <TitledSection title="Recognized requests by purpose">
      <DataTable
        label="Recognized requests by purpose"
        columns={PURPOSE_COLUMNS}
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
