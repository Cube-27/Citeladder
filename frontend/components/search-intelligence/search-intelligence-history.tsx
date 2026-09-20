import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import { ReadError } from '@/components/ui/read-error';
import { textRole } from '@/components/ui/typography';
import {
  searchIntelligenceApi,
  type SearchIntelligenceDataset,
} from '@/lib/api/search-intelligence';
import { searchIntelligenceKeys } from '@/lib/api/query-keys/search-intelligence';
import { useProjectContext } from '@/lib/project/project-context';

export function SearchIntelligenceHistory({
  dataset,
}: Readonly<{ dataset: SearchIntelligenceDataset }>) {
  const { activeProject } = useProjectContext();
  const query = useQuery({
    queryKey: [
      ...searchIntelligenceKeys.dataset(activeProject?.workspace_id, activeProject?.id, dataset.id),
      'history',
    ],
    queryFn: ({ signal }) =>
      searchIntelligenceApi.rows(
        activeProject!.id,
        dataset.id,
        { signal, workspaceId: activeProject!.workspace_id },
        { limit: 200 },
      ),
    enabled: Boolean(activeProject),
  });
  if (query.isError)
    return (
      <ReadError
        error={query.error}
        fallback="Saved history could not be loaded."
        onRetry={() => void query.refetch()}
      />
    );
  const rows = query.data?.rows ?? [];
  const observations = rows
    .map((row) => ({
      date: String(row.auxiliary.date ?? '').slice(0, 10),
      backlinks: row.backlinks,
      new: numeric(row.auxiliary.new_backlinks),
      lost: numeric(row.auxiliary.lost_backlinks),
    }))
    .filter(({ date }) => validHistoryDate(date))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (observations.length < 2)
    return (
      <p className={textRole('meta')}>
        History needs at least two saved observations to show a trend.
      </p>
    );
  const data = fillMonths(observations);
  return (
    <section className="grid gap-3" aria-label="Saved backlink history">
      <p className={textRole('meta')}>
        Monthly domain-level history for {dataset.target_domain}, {observations[0].date} to{' '}
        {observations.at(-1)?.date}. Coverage includes the provider’s historical link population and
        may differ from the live summary. Missing observations are gaps.
      </p>
      <ChartContainer
        config={{ backlinks: { label: 'Backlinks', color: 'var(--color-chart-1)' } }}
        description="Saved monthly backlink totals; missing observations break the line."
      >
        <LineChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line
            dataKey="backlinks"
            stroke="var(--color-backlinks)"
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <ChartContainer
        config={{
          new: { label: 'New backlinks', color: 'var(--color-chart-2)' },
          lost: { label: 'Lost backlinks', color: 'var(--color-chart-3)' },
        }}
        description="Saved monthly new and lost backlinks, shown as separate labelled lines."
      >
        <LineChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line
            name="New backlinks"
            dataKey="new"
            stroke="var(--color-new)"
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            name="Lost backlinks"
            dataKey="lost"
            stroke="var(--color-lost)"
            strokeDasharray="5 3"
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </section>
  );
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function validHistoryDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function fillMonths(
  rows: { date: string; backlinks: number | null; new: number | null; lost: number | null }[],
) {
  const byMonth = new Map(rows.map((row) => [row.date.slice(0, 7), row]));
  const start = new Date(`${rows[0].date.slice(0, 7)}-01T00:00:00Z`);
  const end = rows.at(-1)!.date.slice(0, 7);
  const result = [];
  while (start.toISOString().slice(0, 7) <= end) {
    const month = start.toISOString().slice(0, 7);
    result.push(byMonth.get(month) ?? { date: month, backlinks: null, new: null, lost: null });
    start.setUTCMonth(start.getUTCMonth() + 1);
  }
  return result;
}
