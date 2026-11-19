import { useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';
import type {
  aiTrafficOverviewSchema,
  crawlCatalogSchema,
  crawlCoverageResponseSchema,
} from '@citeladder/contracts/ai-traffic';
import {
  aiTrafficQueries,
  type TrafficFilters,
  type TrafficTableScope,
} from '@/lib/api/ai-traffic';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';
import { coverageLabel, reasonLabel, words } from '@/lib/ai-traffic/vocabulary';
import { formatCount, formatMean, formatWindowDate, isOwnHost } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { CalendarX, SearchX } from 'lucide-react';
import { TabPanel } from '@/components/ui/tabs';
import { Absence } from '@/components/ui/absence';
import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { TableRow, TableCell, TableCellLines, TableTime, UrlText } from '@/components/ui/table';
import { CrawlLogConnections } from './crawl-log-connections';
import { InsightStrip } from './insight-strip';
import { OverviewFigures, RequestsByPurpose, overviewMeasured } from './overview-signals';
import { trafficNarrowed } from './traffic-controls';
import type { SourceStep } from '@/components/integrations/data-sources';
import { CrawlerPages } from './crawler-pages';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { readErrorProps } from '@/components/ui/notice';
import { SectionStack, TitledSection } from '@/components/ui/section';

const CRAWLER_COLUMNS: readonly DataTableColumn[] = [
  { key: 'crawler', label: 'Crawler', width: 'name' },
  { key: 'purpose', label: 'Purpose', width: 'category', priority: 'low' },
  { key: 'requests', label: 'Requests', width: 'figure', kind: 'number' },
  { key: 'pages', label: 'Path-level pages', width: 'metric', kind: 'number' },
  { key: 'last-seen', label: 'Last observed', width: 'date', kind: 'date', priority: 'low' },
  { key: 'status', label: 'Status and verification' },
  { key: 'breakdown', label: 'Folder and resource breakdown', priority: 'low' },
];
const COVERAGE_COLUMNS: readonly DataTableColumn[] = [
  // A day without a time: the date floor, not the date-time role.
  { key: 'day', label: 'Day', kind: 'date', width: 'category' },
  { key: 'source', label: 'Source', width: 'name' },
  { key: 'coverage', label: 'Coverage' },
  {
    key: 'counts',
    label: 'Batch / heartbeat count',
    width: 'metric',
    kind: 'number',
    priority: 'low',
  },
  { key: 'gap', label: 'Longest receipt gap', width: 'metric', kind: 'number', priority: 'low' },
];

const ACTIVITY_COLUMNS: readonly DataTableColumn[] = [
  { key: 'observed', label: 'Observed', width: 'date', kind: 'date' },
  { key: 'bot', label: 'Bot', width: 'category' },
  { key: 'path', label: 'Host and path' },
  { key: 'resource', label: 'Resource', width: 'status', priority: 'low' },
  { key: 'status', label: 'Status', width: 'figure', kind: 'number' },
  { key: 'verification', label: 'Verification', priority: 'low' },
];
export function TrafficOverview({
  data,
  projectId,
  workspaceId,
  range,
  crawlAvailable,
  ga4,
}: Readonly<{
  data: z.infer<typeof aiTrafficOverviewSchema>;
  projectId: string;
  workspaceId: string;
  range: string;
  crawlAvailable: boolean;
  ga4: SourceStep | null;
}>) {
  const [connectOpen, setConnectOpen] = useState(false);
  const crawlConnected = data.crawl.connection !== 'not_connected';
  return (
    <TabPanel value="overview">
      {/* The figures lead: they say what the window measured before the
          patterns read across it. */}
      <SectionStack>
        <OverviewFigures
          data={data}
          projectId={projectId}
          crawlAvailable={crawlAvailable}
          ga4={ga4}
          onConnectCrawl={() => setConnectOpen(true)}
        />
        {overviewMeasured(data) ? (
          <InsightStrip projectId={projectId} workspaceId={workspaceId} range={range} />
        ) : null}
        {data.crawl.series.length ? <RequestsByPurpose series={data.crawl.series} /> : null}
        {crawlAvailable ? (
          <CrawlLogConnections
            open={connectOpen}
            onOpenChange={setConnectOpen}
            headerWhenEmpty={false}
          />
        ) : null}
        {crawlConnected ? (
          <CoverageTable projectId={projectId} workspaceId={workspaceId} range={range} />
        ) : null}
      </SectionStack>
    </TabPanel>
  );
}
/** A crawl-log table, and how to clear its narrowing. */
type CrawlTableScope = TrafficTableScope & Readonly<{ onClearFilters: () => void }>;

/**
 * An empty narrowed table is "none match", with Clear filters. Unnarrowed,
 * absence is an observation within the available logs, not proof of no
 * traffic. (With no crawl log source the screen shows its setup state instead.)
 */
function noMatches(
  { filters, onClearFilters }: CrawlTableScope,
  copy: Readonly<{ heading: string; description: string }>,
): DataTableState {
  if (trafficNarrowed(filters)) return { kind: 'filtered', onClear: onClearFilters };
  return { kind: 'empty', icon: SearchX, ...copy };
}

/** A drawer opened from a row reads the table's window, not its narrowing. */
function windowFilters(filters: TrafficFilters): TrafficFilters {
  return { range: filters.range, verification: filters.verification };
}
export function TrafficCrawlers(scope: CrawlTableScope) {
  const { workspaceId, projectId, filters } = scope;
  const [botId, setBotId] = useState<string | null>(null);
  const { page, table } = useCursorTableQuery({
    workspaceId,
    scopeId: projectId,
    scope: filters,
    query: (request) =>
      aiTrafficQueries.crawlers({ workspaceId, projectId }, { ...filters, ...request }),
    noun: 'crawlers',
    loading: 'Loading crawlers…',
    subject: 'the crawlers',
    empty: () =>
      noMatches(scope, {
        heading: 'No matching requests were observed',
        description:
          'Check coverage on Overview before interpreting absence in the available logs.',
      }),
  });
  return (
    <TabPanel value="crawlers">
      <SectionStack>
        {/* Status and breakdown stack their qualifiers: two-line rows. */}
        <DataTable label="Recognized crawlers" columns={CRAWLER_COLUMNS} rowLines={2} {...table}>
          {page?.items.map((b) => (
            <TableRow key={b.bot_id}>
              <TableCell>{b.label}</TableCell>
              <TableCell>{words(b.purpose)}</TableCell>
              <TableCell numeric>{formatCount(b.requests)}</TableCell>
              <TableCell numeric>
                {b.pages === null ? (
                  <Absence state="unavailable" />
                ) : (
                  <TextLink asChild text="inherit">
                    <Pressable
                      className="w-auto tabular-nums"
                      onClick={() => setBotId(b.bot_id)}
                      aria-label={`View paths requested by ${b.label}`}
                    >
                      {formatCount(b.pages)} paths
                    </Pressable>
                  </TextLink>
                )}
              </TableCell>
              <TableCell>
                <TableTime value={b.last_seen} />
              </TableCell>
              <TableCell>
                <CellLines
                  lines={[
                    entries(b.status_codes),
                    entries(b.verification),
                    reasonEntries(b.verification_reasons),
                  ]}
                />
              </TableCell>
              <TableCell>
                <CellLines lines={[entries(b.folders), entries(b.resources)]} />
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
        {page?.items.length === 0 ? <CrawlLogConnections /> : null}
      </SectionStack>
      <CrawlerPages
        botId={botId}
        onClose={() => setBotId(null)}
        workspaceId={workspaceId}
        projectId={projectId}
        filters={windowFilters(filters)}
      />
    </TabPanel>
  );
}
/**
 * What the activity table shows while the crawler catalog cannot name its
 * bots: rows of raw bot ids would read as findings, so the catalog's own
 * loading or failure takes the table's place, in the same footprint.
 */
function catalogState(
  catalog: UseQueryResult<z.infer<typeof crawlCatalogSchema>>,
): DataTableState | undefined {
  if (catalog.isError && !catalog.data)
    return {
      kind: 'error',
      ...readErrorProps(catalog),
      title: "Couldn't load the crawler catalog",
      fallback: 'Without it the bots in this table cannot be named.',
    };
  if (catalog.isPending) return { kind: 'loading', label: 'Loading the crawler catalog…' };
  return undefined;
}
export function TrafficActivity(scope: CrawlTableScope) {
  const { workspaceId, projectId, filters } = scope;
  // The screen's controls read the same entry, so this adds no request.
  const catalog = useQuery(aiTrafficQueries.catalog({ workspaceId, projectId }));
  const website = useProjectScope().project.website_url;
  const { page, table } = useCursorTableQuery({
    workspaceId,
    scopeId: projectId,
    scope: filters,
    query: (request) =>
      aiTrafficQueries.activity({ workspaceId, projectId }, { ...filters, ...request }),
    noun: 'requests',
    loading: 'Loading request activity…',
    subject: 'the request activity',
    empty: () =>
      noMatches(scope, {
        heading: 'No matching requests',
        description: 'Nothing in the available retained logs matches these filters.',
      }),
  });
  return (
    <TabPanel value="activity">
      <SectionStack>
        <DataTable
          label="Retained automated request activity"
          columns={ACTIVITY_COLUMNS}
          rowLines={2}
          {...table}
          state={catalogState(catalog) ?? table.state}
        >
          {page?.items.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <TableTime value={r.occurred_at} />
              </TableCell>
              <TableCell>
                {catalog.data?.bots.find((b) => b.bot_id === r.bot_id)?.label ?? r.bot_id}
              </TableCell>
              <TableCell>
                {/* The path alone on the project's own host; a foreign host stays printed. */}
                <TableCellLines
                  primary={
                    <UrlText
                      url={isOwnHost(r.host, website) ? r.display_path : r.host + r.display_path}
                    />
                  }
                  secondary={r.identity === 'non_joinable' ? 'Redacted; non-joinable' : null}
                />
              </TableCell>
              <TableCell>{words(r.resource_class)}</TableCell>
              <TableCell numeric>{r.status_code}</TableCell>
              <TableCell>
                <CellLines
                  lines={[
                    words(r.verification) +
                      (r.verification_reason ? ' · ' + reasonLabel(r.verification_reason) : ''),
                    r.verification_basis === 'later_snapshot'
                      ? 'Verified using a later IP-range snapshot.'
                      : '',
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
        {page?.items.length === 0 ? <CrawlLogConnections /> : null}
      </SectionStack>
    </TabPanel>
  );
}
function SourceLines({
  source,
}: Readonly<{ source?: z.infer<typeof crawlCoverageResponseSchema>['sources'][number] }>) {
  return <CellLines lines={[source?.host ?? 'Removed source', words(source?.setup ?? '')]} />;
}
/**
 * A primary value with its qualifiers beneath it in caption ink: one line
 * each, so the row never grows past two; cut text moves into a tooltip.
 */
function CellLines({ lines }: Readonly<{ lines: string[] }>) {
  const [first, ...rest] = lines.filter(Boolean);
  return <TableCellLines primary={first} secondary={rest.join(' · ')} />;
}
/** Reasons survive raw retention because rollups keep them. */
function reasonEntries(values: Record<string, number>) {
  return Object.entries(values)
    .filter(([key]) => key !== 'verified')
    .map(([key, value]) => reasonLabel(key) + ': ' + value)
    .join(' · ');
}
function entries(values: Record<string, number>) {
  return Object.entries(values)
    .map(([key, value]) => words(key) + ': ' + value)
    .join(' · ');
}
function CoverageTable({
  projectId,
  workspaceId,
  range,
}: Readonly<{ projectId: string; workspaceId: string; range: string }>) {
  const { page: data, table } = useCursorTableQuery({
    workspaceId,
    scopeId: projectId,
    scope: range,
    query: (request) =>
      aiTrafficQueries.coverage({ workspaceId, projectId }, { range, ...request }),
    noun: 'reporting days',
    loading: 'Loading coverage…',
    subject: 'the coverage',
    empty: () => ({
      kind: 'empty',
      icon: CalendarX,
      heading: 'No persisted coverage in this range',
    }),
  });
  return (
    <TitledSection title="Coverage by source and reporting day">
      <DataTable
        label="Coverage by source and reporting day"
        columns={COVERAGE_COLUMNS} // Every row stacks a qualifier under its value.
        rowLines={2}
        {...table}
      >
        {data?.items.map((r) => (
          <TableRow key={r.source_id + r.reporting_date + r.reporting_timezone}>
            <TableCell>
              <CellLines lines={[formatWindowDate(r.reporting_date), r.reporting_timezone]} />
            </TableCell>
            <TableCell>
              <SourceLines source={data.sources.find((s) => s.id === r.source_id)} />
            </TableCell>
            <TableCell>
              <CellLines lines={[coverageLabel(r.coverage), reasonLabel(r.reason)]} />
            </TableCell>
            <TableCell numeric>
              {formatCount(r.batch_count)} / {formatCount(r.heartbeat_count)}
            </TableCell>
            <TableCell numeric>{formatMean(r.max_gap_minutes)} minutes</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}
