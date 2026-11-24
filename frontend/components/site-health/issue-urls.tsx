import { useState } from 'react';

import type { PageSummary } from '@citeladder/contracts';

import { IssuePagesExport } from '@/components/site-health/issues-export';
import { PageKindBadge } from '@/components/site-health/page-kind-badge';
import { pageKindFilter } from '@/components/site-health/page-kind-select';
import { SubmittedSearch } from '@/components/site-health/submitted-search';
import { Absence, printed } from '@/components/ui/absence';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { StatusMark } from '@/components/ui/status-mark';
import { mutedWhenMissing, TableCell, TableRow, UrlText } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { formatCount, sharedOrigin } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { scoreBand, type ScoreBand } from '@/lib/score-band';
import { formatScore } from '@/lib/site-health/status';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'url', label: 'URL', kind: 'identity' },
  { key: 'kind', label: 'Kind', kind: 'status', width: 'category' },
  { key: 'title', label: 'Title', priority: 'low' },
  { key: 'inlinks', label: 'Linked from', kind: 'number', width: 'figure' },
  { key: 'depth', label: 'Depth', kind: 'number', width: 'figure' },
  { key: 'web', label: 'Web fundamentals', kind: 'number', width: 'figure', priority: 'low' },
  { key: 'aeo', label: 'AEO', kind: 'number', width: 'figure' },
];

const SCORE_TONE = {
  low: 'negative',
  mid: 'warning',
  high: 'positive',
} as const satisfies Record<ScoreBand, string>;

function Score({ score }: Readonly<{ score: number | null }>) {
  if (score === null) return <Absence state="not_measured" />;
  return (
    <StatusMark tone={SCORE_TONE[scoreBand(Math.round(score))]}>
      {printed(formatScore(score))}
    </StatusMark>
  );
}

export function IssueUrlTable({
  workspaceId,
  crawlId,
  groupId,
  ruleId,
  initialPageKind = '',
  onOpen,
}: Readonly<{
  workspaceId: string;
  crawlId: string;
  groupId: string;
  ruleId: string;
  initialPageKind?: string;
  onOpen: (siteUrlId: string) => void;
}>) {
  const [pageKind, setPageKind] = useState(initialPageKind);
  const [search, setSearch] = useState('');
  const { page, table } = useCursorTableQuery({
    workspaceId,
    scopeId: [crawlId, ruleId],
    scope: [ruleId, pageKind, search],
    query: (request) =>
      siteHealthQueries.pages(workspaceId, crawlId, {
        ...request,
        rule: ruleId,
        page_kind: pageKind || undefined,
        query: search || undefined,
      }),
    noun: 'pages',
    loading: 'Loading affected pages…',
    subject: 'the affected pages',
    empty: () => ({
      kind: 'empty',
      icon: ICONS.siteHealth,
      headingLevel: 3,
      heading: 'No affected pages match this view',
    }),
  });
  const rows: readonly PageSummary[] = page?.items ?? [];
  const origin = sharedOrigin(rows.map((row) => row.display_url));
  return (
    <DataTable
      title="Affected pages"
      columns={COLUMNS}
      toolbar={{
        search: (
          <SubmittedSearch
            key={search}
            query={search}
            onApply={setSearch}
            placeholder="Search URLs…"
            label="Search URLs"
          />
        ),
        filters: [pageKindFilter({ value: pageKind, onChange: setPageKind })],
        actions: <IssuePagesExport workspaceId={workspaceId} crawlId={crawlId} groupId={groupId} />,
      }}
      {...table}
    >
      {rows.map((row) => (
        <TableRow
          key={row.site_url_id}
          onClick={() => onOpen(row.site_url_id)}
          className="cursor-pointer"
        >
          <TableCell>
            <TextLink
              text="body"
              underline="hover"
              href={`/site/crawls/${row.crawl_id}/pages/${row.site_url_id}`}
              aria-haspopup="dialog"
              onClick={(event) => {
                event.stopPropagation();
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                onOpen(row.site_url_id);
              }}
              className="flex min-w-0 items-center"
            >
              <UrlText url={row.display_url} origin={origin} />
            </TextLink>
          </TableCell>
          <TableCell className="whitespace-nowrap">
            <PageKindBadge pageKind={row.page_kind} />
          </TableCell>
          <TableCell>
            {row.title?.trim() ? (
              <ClampText lines={1}>{row.title}</ClampText>
            ) : (
              <StatusMark tone="negative">Missing</StatusMark>
            )}
          </TableCell>
          <TableCell numeric className={mutedWhenMissing(row.inbound_count)}>
            {row.inbound_count === null ? (
              <Absence state="not_measured" />
            ) : (
              formatCount(row.inbound_count)
            )}
          </TableCell>
          <TableCell numeric className={mutedWhenMissing(row.depth_from_home)}>
            {row.depth_from_home === null ? (
              <Absence state="not_measured" />
            ) : (
              formatCount(row.depth_from_home)
            )}
          </TableCell>
          <TableCell numeric>
            <Score score={row.web_fundamentals_score} />
          </TableCell>
          <TableCell numeric>
            <Score score={row.aeo_readiness_score} />
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
