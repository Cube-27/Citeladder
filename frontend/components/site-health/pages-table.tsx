import type { ComponentProps } from 'react';
import { useNavigate } from 'react-router-dom';

import { StatusMark } from '@/components/ui/status-mark';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import type { FilterBarProps } from '@/components/ui/filter-bar';
import { Inline, Stack } from '@/components/ui/layout';
import { ClampText } from '@/components/ui/clamp-text';
import { mutedWhenMissing, TableCell, TableRow, TableTime, UrlText } from '@/components/ui/table';
import { sharedOrigin } from '@/lib/format';
import { Absence, printed } from '@/components/ui/absence';
import { TextLink } from '@/components/ui/text-link';
import type { PagesSort } from '@/lib/api/site-health';
import type { PageSummary } from '@citeladder/contracts';
import { PageKindBadge } from '@/components/site-health/page-kind-badge';
import { RobotsExcludedBadge } from '@/components/site-health/robots-choice';
import {
  DEFAULT_PAGES_SORT,
  formatIssueCount,
  formatScore,
  pageDisplayTitle,
  pageStatusBadgeValue,
  isFetchFailure,
  statusLabel,
} from '@/lib/site-health/status';
import { useProjectHref } from '@/lib/navigation/project-destination';

/**
 * Analyzed-pages table (Slice 7, mockups 712 + 713).
 *
 * Seven columns: the row's ordinal, the page (its title, which links to the
 * per-URL detail, over its URL), the page-kind badge (v2 P1), the issue count,
 * the Web fundamentals and AEO readiness scores and the last audit. A page whose
 * analysis has not completed (queued, running, error, blocked…) carries its
 * status badge beside the title, so a failure stays visible on every view.
 * Missing / not-yet-analysed scores render the not-measured Absence dash —
 * never a fabricated zero (an error/blocked row shows the dash, not 0).
 * The whole row is clickable and navigates to the Slice 8 per-URL detail route
 * (`/site/crawls/[crawlId]/pages/[siteUrlId]`); the title link is the
 * keyboard/screen-reader affordance.
 *
 * Sorting is SERVER-SIDE and keyset-paged: the Page header asks the backend to
 * reorder the whole result set by URL, never the current page window; clicking
 * it again returns to the default (status) order.
 */

/** Where a failing URL is linked from: the first page, and how many more the crawl found. */
function LinkedFromLine({ page }: Readonly<{ page: PageSummary }>) {
  const [first, ...rest] = page.linked_from;
  if (!first || !isFetchFailure(page.analysis_status)) return null;
  return (
    <ClampText lines={1} className="type-caption">
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
  const byUrl = sort === 'url';
  return [
    {
      key: 'page',
      label: 'Page',
      kind: 'identity',
      sort: onSortChange
        ? {
            active: byUrl,
            descending: false,
            onSort: () => onSortChange(byUrl ? DEFAULT_PAGES_SORT : 'url'),
          }
        : undefined,
    },
    // At 982 the fit hides the last audit, then the page kind.
    // The longest page kind ("Case Study / Review") fits on one line.
    { key: 'type', label: 'Type', kind: 'status', width: 'category', priority: 'low' },
    { key: 'issues', label: 'Issues', kind: 'number', width: 'figure' },
    { key: 'web', label: 'Web fundamentals', kind: 'number', width: 'figure' },
    { key: 'aeo', label: 'AEO readiness', kind: 'number', width: 'figure' },
    { key: 'audited', label: 'Last audit', kind: 'date', width: 'metric', priority: 'low' },
  ];
}

export function PagesTable({
  pages,
  crawlId,
  sort = DEFAULT_PAGES_SORT,
  onSortChange,
  state,
  toolbar,
  pager,
  pageSize,
  busy,
}: Readonly<{
  pages: PageSummary[];
  crawlId: string;
  sort?: PagesSort;
  /** Omitted where the table is read-only; the Page header then renders plain. */
  onSortChange?: (sort: PagesSort) => void;
  /** What the table shows instead of rows (loading, error, empty). */
  state?: DataTableState;
  toolbar?: FilterBarProps;
  pager?: ComponentProps<typeof DataTable>['pager'];
  pageSize?: number;
  busy?: ComponentProps<typeof DataTable>['busy'];
}>) {
  const router = useNavigate();
  const projectHref = useProjectHref();
  const openPage = (siteUrlId: string) => {
    const page = pages.find((row) => row.site_url_id === siteUrlId);
    router(projectHref(`/site/crawls/${page?.crawl_id ?? crawlId}/pages/${siteUrlId}`));
  };
  const origin = sharedOrigin(pages.map((page) => page.display_url));
  return (
    <DataTable
      label="Pages"
      columns={pagesColumns(sort, onSortChange)}
      toolbar={toolbar}
      state={state}
      pager={pager}
      pageSize={pageSize}
      rowCount={pages.length}
      busy={busy}
      // Every Pages view shares one footprint, so switching views never moves
      // the sections below the table.
      reserveRows
    >
      {pages.map((page) => {
        const title = pageDisplayTitle(page.title, page.display_url);
        return (
          <TableRow
            key={page.site_url_id}
            // Preserve native row/cell semantics; the title is the announced link.
            tabIndex={0}
            onClick={() => openPage(page.site_url_id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              openPage(page.site_url_id);
            }}
            className="focus-ring cursor-pointer"
          >
            {/* A URL is one unbreakable token: every line is clamped to the
                column and carries the full value in a tooltip when cut. */}
            <TableCell>
              <Stack as="span" gap="tight" className="min-w-0">
                <Inline as="span">
                  <ClampText className="max-w-full shrink-0">
                    <TextLink
                      text="emphasis"
                      underline="hover"
                      href={`/site/crawls/${page.crawl_id}/pages/${page.site_url_id}`}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`View ${title}, ${page.display_url}`}
                    >
                      {title}
                    </TextLink>
                  </ClampText>
                  {page.analysis_status === 'completed' ? null : (
                    <StatusMark variant="status" value={pageStatusBadgeValue(page.analysis_status)}>
                      {statusLabel(page.analysis_status)}
                    </StatusMark>
                  )}
                  {page.robots_excluded ? <RobotsExcludedBadge /> : null}
                  <span className="text-ink-2 min-w-0 overflow-hidden">
                    <UrlText url={page.display_url} origin={origin} />
                  </span>
                </Inline>
                <LinkedFromLine page={page} />
              </Stack>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <PageKindBadge pageKind={page.page_kind} />
            </TableCell>
            <TableCell numeric className="tabular-nums">
              {formatIssueCount(page.issue_count)}
            </TableCell>
            <TableCell numeric className={mutedWhenMissing(page.web_fundamentals_score)}>
              <MeasurementValue
                score={page.web_fundamentals_score}
                state={page.web_fundamentals_state}
              />
            </TableCell>
            <TableCell numeric className={mutedWhenMissing(page.aeo_readiness_score)}>
              <MeasurementValue
                score={page.aeo_readiness_score}
                state={page.aeo_measurement_state}
              />
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

/**
 * A measured score is the number alone (owner, 2026-11-10: no evidence
 * caption under it); only a score with no value names its state.
 */
function MeasurementValue({ score, state }: Readonly<{ score: number | null; state: string }>) {
  if (score === null) return measurementStateValue(state);
  return printed(formatScore(score));
}

function measurementStateValue(state: string) {
  if (state === 'limited_evidence') return 'Limited evidence';
  if (state === 'excluded') return 'Excluded';
  return <Absence state="not_measured" />;
}
