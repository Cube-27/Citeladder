import { useContext, type ComponentProps } from 'react';

import { StatusMark } from '@/components/ui/status-mark';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import type { TableToolbarProps } from '@/components/ui/filter-bar';
import { Inline, Stack } from '@/components/ui/layout';
import { ClampText } from '@/components/ui/clamp-text';
import { mutedWhenMissing, TableCell, TableRow, TableTime, UrlText } from '@/components/ui/table';
import { sharedOrigin } from '@/lib/format';
import { Absence } from '@/components/ui/absence';
import { PageLink } from '@/components/site-health/page-link';
import { PageOpenContext } from '@/components/site-health/page-open-context';
import type { PagesSort } from '@/lib/api/site-health';
import type { PageSummary } from '@citeladder/contracts';
import { PageKindBadge } from '@/components/site-health/page-kind-badge';
import { RobotsExcludedBadge } from '@/components/site-health/robots-choice';
import {
  DEFAULT_PAGES_SORT,
  formatIssueCount,
  pageDisplayTitle,
  pageStatusBadgeValue,
  isFetchFailure,
  statusLabel,
} from '@/lib/site-health/status';
import { MeasurementValue } from '@/components/site-health/measurement-value';
import { Text } from '@/components/ui/typography';

function LinkedFromLine({ page }: Readonly<{ page: PageSummary }>) {
  const [first, ...rest] = page.linked_from;
  if (!first || !isFetchFailure(page.analysis_status)) return null;
  return (
    <ClampText lines={1} text="caption">
      {rest.length
        ? `Linked from ${first.url} and ${rest.length} more`
        : `Linked from ${first.url}`}
    </ClampText>
  );
}

function pagesColumns(
  sort: PagesSort,
  onSortChange: ((sort: PagesSort) => void) | undefined,
): DataTableColumn[] {
  const sortBy = (key: PagesSort, descending: boolean) =>
    onSortChange
      ? {
          active: sort === key,
          descending,
          onSort: () => onSortChange(sort === key ? DEFAULT_PAGES_SORT : key),
        }
      : undefined;
  return [
    { key: 'page', label: 'Page', kind: 'identity', sort: sortBy('url', false) },
    { key: 'status', label: 'Status', kind: 'status', sort: sortBy('status', false) },
    { key: 'type', label: 'Type', kind: 'status', width: 'category', priority: 'low' },
    { key: 'issues', label: 'Issues', kind: 'number', width: 'figure' },
    { key: 'web', label: 'Web fundamentals', kind: 'number', width: 'figure' },
    { key: 'aeo', label: 'AEO readiness', kind: 'number', width: 'figure' },
    { key: 'depth', label: 'Depth', kind: 'number', priority: 'low', sort: sortBy('depth', false) },
    {
      key: 'inlinks',
      label: 'Inlinks',
      kind: 'number',
      priority: 'low',
      sort: sortBy('inbound', true),
    },
    { key: 'audited', label: 'Last audit', kind: 'date', width: 'metric', priority: 'low' },
  ];
}

export function PagesTable({
  title,
  pages,
  sort = DEFAULT_PAGES_SORT,
  onSortChange,
  state,
  toolbar,
  pager,
  pageSize,
  busy,
}: Readonly<{
  title?: string;
  pages: PageSummary[];
  sort?: PagesSort;
  onSortChange?: (sort: PagesSort) => void;
  state?: DataTableState;
  toolbar?: TableToolbarProps;
  pager?: ComponentProps<typeof DataTable>['pager'];
  pageSize?: number;
  busy?: ComponentProps<typeof DataTable>['busy'];
}>) {
  const open = useContext(PageOpenContext);
  const openPage = (page: PageSummary) =>
    open?.({ crawlId: page.crawl_id, siteUrlId: page.site_url_id });
  const origin = sharedOrigin(pages.map((page) => page.display_url));
  return (
    <DataTable
      title={title}
      label="Pages"
      columns={pagesColumns(sort, onSortChange)}
      toolbar={toolbar}
      state={state}
      pager={pager}
      pageSize={pageSize}
      busy={busy}
    >
      {pages.map((page) => {
        const title = pageDisplayTitle(page.title, page.display_url);
        return (
          <TableRow
            key={page.site_url_id}
            tabIndex={0}
            onClick={() => openPage(page)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              openPage(page);
            }}
            focusable
            className="cursor-pointer"
          >
            <TableCell>
              <Stack as="span" gap="tight" box="shrink">
                <Inline as="span" wrap="phone">
                  <ClampText box="fixed-full">
                    <PageLink
                      text="inherit"
                      underline="hover"
                      crawlId={page.crawl_id}
                      siteUrlId={page.site_url_id}
                      aria-label={`View ${title}, ${page.display_url}`}
                    >
                      {title}
                    </PageLink>
                  </ClampText>
                  {page.robots_excluded ? <RobotsExcludedBadge /> : null}
                  <Text variant="body" tone="ink-2" box="clip">
                    <UrlText url={page.display_url} origin={origin} />
                  </Text>
                </Inline>
                <LinkedFromLine page={page} />
              </Stack>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <StatusMark tone={pageStatusBadgeValue(page.analysis_status)}>
                {statusLabel(page.analysis_status)}
              </StatusMark>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <PageKindBadge pageKind={page.page_kind} />
            </TableCell>
            <TableCell numeric tone={page.issue_count === 0 ? 'ink-2' : undefined}>
              {formatIssueCount(page.issue_count)}
            </TableCell>
            <TableCell numeric tone={mutedWhenMissing(page.web_fundamentals_score)}>
              <MeasurementValue
                score={page.web_fundamentals_score}
                checks={page.web_fundamentals_checks}
                state={page.web_fundamentals_state}
              />
            </TableCell>
            <TableCell numeric tone={mutedWhenMissing(page.aeo_readiness_score)}>
              <MeasurementValue
                score={page.aeo_readiness_score}
                checks={page.aeo_readiness_checks}
                state={page.aeo_measurement_state}
              />
            </TableCell>
            <TableCell numeric tone={mutedWhenMissing(page.depth_from_home)}>
              <DepthValue page={page} />
            </TableCell>
            <TableCell numeric tone={mutedWhenMissing(page.inbound_count)}>
              {page.inbound_count ?? <Absence state="not_measured" />}
            </TableCell>
            <TableCell>
              <TableTime value={page.last_audited} fallback={<Absence state="not_measured" />} />
            </TableCell>
          </TableRow>
        );
      })}
    </DataTable>
  );
}

function DepthValue({ page }: Readonly<{ page: PageSummary }>) {
  if (page.depth_from_home !== null) return page.depth_from_home;
  if (page.inbound_count === null) return <Absence state="not_measured" />;
  return <Absence state="unavailable" label="Not reached" />;
}
