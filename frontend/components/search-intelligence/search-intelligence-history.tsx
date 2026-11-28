import { useQuery } from '@tanstack/react-query';
import { AppGrid } from '@/components/ui/app-grid';
import { Stack } from '@/components/ui/layout';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart } from '@/components/ui/area-chart';
import { type TrendPoint } from '@/components/ui/series-data';
import { Text } from '@/components/ui/typography';
import {
  searchIntelligenceQueries,
  type SearchIntelligenceDataset,
} from '@/lib/api/search-intelligence';
import {
  formatCompactCount,
  formatCount,
  formatMonth,
  formatWindowDate,
  isIsoDay,
} from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

type HistoryRow = {
  date: string;
  backlinks: number | null;
  new: number | null;
  lost: number | null;
};

function useHistory(datasetId: string) {
  const { workspaceId, projectId } = useProjectScope();
  return useQuery(searchIntelligenceQueries.datasetHistory({ workspaceId, projectId }, datasetId));
}

export function SearchIntelligenceHistory({
  dataset,
}: Readonly<{ dataset: SearchIntelligenceDataset }>) {
  const query = useHistory(dataset.id);
  const observations = query.isSuccess ? historyObservations(query.data.rows) : [];
  const [first] = observations;
  const last = observations.at(-1);
  const range =
    first && last && observations.length >= 2 ? (
      <Text as="p" variant="caption">
        {formatWindowDate(first.date)} to {formatWindowDate(last.date)}
      </Text>
    ) : undefined;
  return (
    <Section aria-labelledby="backlink-history">
      <SectionHeader actions={range}>
        <SectionTitle id="backlink-history">Backlink history</SectionTitle>
      </SectionHeader>
      <HistoryBody query={query} observations={observations} />
    </Section>
  );
}

type HistoryRows = NonNullable<ReturnType<typeof useHistory>['data']>['rows'];

function historyObservations(rows: HistoryRows): HistoryRow[] {
  return rows
    .map((row) => ({
      date: String(row.auxiliary.date ?? '').slice(0, 10),
      backlinks: row.backlinks,
      new: numeric(row.auxiliary.new_backlinks),
      lost: numeric(row.auxiliary.lost_backlinks),
    }))
    .filter(({ date }) => isIsoDay(date))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function HistoryBody({
  query,
  observations,
}: Readonly<{ query: ReturnType<typeof useHistory>; observations: readonly HistoryRow[] }>) {
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        fallback="Saved history could not be loaded."
        title="Saved history could not be loaded"
      />
    );
  if (query.isPending) return <Skeleton variant="chart" />;
  const [first] = observations;
  const last = observations.at(-1);
  if (!first || !last || observations.length < 2)
    return (
      <StateBlock
        kind="empty"
        inline
        message="History needs at least two saved observations to show a trend."
      />
    );
  const data = fillMonths(observations, first.date, last.date);
  const points = (value: (row: HistoryRow) => number | null): TrendPoint[] =>
    data.map((row) => ({
      label: formatMonth(row.date),
      value: value(row),
    }));
  return (
    <AppGrid layout="halves">
      <Stack gap="compact" box="shrink" content="start">
        <SectionHeader>
          <SectionTitle level={3}>Total backlinks</SectionTitle>
        </SectionHeader>
        <AreaChart
          label="Saved monthly backlink totals"
          name="Backlinks"
          data={points((row) => row.backlinks)}
          yFormat={formatCompactCount}
          format={formatCount}
          you={false}
        />
      </Stack>
      <Stack gap="compact" box="shrink" content="start">
        <SectionHeader>
          <SectionTitle level={3}>Monthly changes</SectionTitle>
        </SectionHeader>
        <AreaChart
          label="Saved monthly new and lost backlinks"
          name="New backlinks"
          data={points((row) => row.new)}
          series={[{ label: 'Lost backlinks', values: data.map((row) => row.lost) }]}
          yFormat={formatCompactCount}
          format={formatCount}
          you={false}
        />
      </Stack>
    </AppGrid>
  );
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fillMonths(
  rows: readonly HistoryRow[],
  firstDate: string,
  lastDate: string,
): HistoryRow[] {
  const byMonth = new Map(rows.map((row) => [row.date.slice(0, 7), row]));
  const start = new Date(`${firstDate.slice(0, 7)}-01T00:00:00Z`);
  const end = lastDate.slice(0, 7);
  const result: HistoryRow[] = [];
  while (start.toISOString().slice(0, 7) <= end) {
    const month = start.toISOString().slice(0, 7);
    result.push(byMonth.get(month) ?? { date: month, backlinks: null, new: null, lost: null });
    start.setUTCMonth(start.getUTCMonth() + 1);
  }
  return result;
}
