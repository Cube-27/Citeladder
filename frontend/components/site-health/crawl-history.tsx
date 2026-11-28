import { useNavigate } from 'react-router-dom';
import type { SiteCrawlListItem } from '@citeladder/contracts';
import { CrawlStatusBadge } from '@/components/site-health/crawl-status-badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Inline } from '@/components/ui/layout';
import { TableCell, TableRow, TableTime } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { sitePagePath } from '@citeladder/contracts/record-kinds';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { absent, formatCount, formatScore } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';
import { Text } from '@/components/ui/typography';

export function CrawlHistory({
  workspaceId,
  projectId,
}: Readonly<{ workspaceId: string; projectId: string }>) {
  const router = useNavigate();
  const projectHref = useProjectHref();
  const { page, table } = useCursorTableQuery({
    workspaceId,
    scopeId: projectId,
    scope: null,
    query: (request) => siteHealthQueries.crawls({ workspaceId, projectId }, request),
    noun: 'crawls',
    loading: 'Loading crawls…',
    subject: 'the crawls',
    empty: () => ({ kind: 'empty', icon: ICONS.issues, headingLevel: 3, heading: 'No crawls yet' }),
  });
  return (
    <DataTable label="Crawls" columns={COLUMNS} {...table}>
      {page?.items.map((crawl) => (
        <CrawlRow key={crawl.id} crawl={crawl} onView={() => router(projectHref(runHref(crawl)))} />
      ))}
    </DataTable>
  );
}

function runHref(crawl: Pick<SiteCrawlListItem, 'id' | 'run'>) {
  switch (crawl.run.kind) {
    case 'page':
      return sitePagePath(crawl.id, crawl.run.site_url_id);
    case 'pages':
    case 'site':
      return '/site?tab=pages';
    default: {
      const exhaustive: never = crawl.run;
      return exhaustive;
    }
  }
}

function CrawlRow({ crawl, onView }: Readonly<{ crawl: SiteCrawlListItem; onView: () => void }>) {
  const summary = crawl.score_summary;
  return (
    <TableRow onOpen={onView}>
      <TableCell>
        <Inline as="span">
          <TextLink
            underline="hover"
            href={runHref(crawl)}
            onClick={(event) => event.stopPropagation()}
          >
            <TableTime value={crawl.started_at ?? crawl.created_at} />
          </TextLink>
          {crawl.run.kind === 'site' ? null : <Text variant="caption">Re-audit</Text>}
        </Inline>
      </TableCell>
      <TableCell>
        <CrawlStatusBadge crawl={crawl} />
      </TableCell>
      <TableCell numeric>{formatCount(crawl.analyzed_count)}</TableCell>
      <TableCell numeric>{summary ? formatCount(summary.issue_count) : absent()}</TableCell>
      <TableCell numeric>{formatScore(summary?.web_fundamentals_score ?? null)}</TableCell>
      <TableCell numeric>{formatScore(summary?.aeo_readiness_score ?? null)}</TableCell>
    </TableRow>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'date', label: 'Date', kind: 'date' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'pages', label: 'Pages audited', kind: 'number', width: 'metric' },
  { key: 'issues', label: 'Issues', kind: 'number', width: 'metric' },
  { key: 'web', label: 'Web fundamentals', kind: 'number', width: 'metric' },
  { key: 'aeo', label: 'AEO readiness', kind: 'number', width: 'metric' },
];
