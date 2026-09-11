'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageLoading } from '@/components/layout/page-loading';
import { IssueDetailRail } from '@/components/site-health/issue-detail-rail';
import { IssueMetadata } from '@/components/site-health/issue-metadata';
import {
  IssueSearch,
  useIssuesCatalogUrlState,
} from '@/components/site-health/issues-catalog-url-state';
import { PageKindSelect } from '@/components/site-health/page-kind-select';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { siteHealthQueries, type IssuesParams } from '@/lib/api/site-health';
import type { IssuesSummary, SiteIssue } from '@/lib/api/types';
import { changeIssueFilters, toIssueParams, type IssueFilters } from '@/lib/site-health/filters';
import { issueTitle } from '@/lib/site-health/issues';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';

const ISSUE_LIMIT = 25;
const OCCURRENCE_LIMIT = 25;
type FilterKey = 'all' | 'high' | 'medium' | 'low' | 'technical' | 'aeo';
type FindingView = 'defect' | 'advisory';

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'technical', label: 'Web Fundamentals' },
  { key: 'aeo', label: 'AEO' },
];

function filterParams(filter: FilterKey): Pick<IssuesParams, 'severity' | 'dimension'> {
  if (filter === 'high' || filter === 'medium' || filter === 'low') return { severity: filter };
  if (filter === 'technical' || filter === 'aeo') return { dimension: filter };
  return {};
}

function selectedFilter(filters: IssueFilters): FilterKey {
  if (filters.severity === 'high' || filters.severity === 'medium' || filters.severity === 'low')
    return filters.severity;
  if (filters.dimension === 'technical' || filters.dimension === 'aeo') return filters.dimension;
  return 'all';
}

function filterChange(filter: FilterKey): Partial<IssueFilters> {
  const params = filterParams(filter);
  return { severity: params.severity ?? '', dimension: params.dimension ?? '' };
}

function filterCount(filter: FilterKey, summary: IssuesSummary, view: FindingView): number {
  if (filter === 'high')
    return (summary.severity_counts.high ?? 0) + (summary.severity_counts.critical ?? 0);
  if (filter === 'medium' || filter === 'low') return summary.severity_counts[filter] ?? 0;
  if (filter === 'technical' || filter === 'aeo') return summary.dimension_counts[filter] ?? 0;
  return view === 'defect' ? summary.defect_issue_type_count : summary.advisory_issue_type_count;
}

/** The issue page, then the occurrences of whichever issue the rail shows. */
function useIssuesCatalogQueries(
  crawlId: string,
  filters: IssueFilters,
  cursor: string | null,
  selectedGroupId: string | null,
  occurrenceCursor: string | undefined,
) {
  const params = useMemo(() => toIssueParams(filters, cursor, ISSUE_LIMIT), [filters, cursor]);
  const issuesQuery = useQuery(siteHealthQueries.issues(crawlId, params));
  const summary = issuesQuery.data?.summary ?? null;
  const rows = issuesQuery.data?.items ?? [];
  const selected = rows.find((issue) => issue.group_id === selectedGroupId) ?? rows[0] ?? null;
  const detailQuery = useQuery({
    ...siteHealthQueries.issue(crawlId, selected?.group_id ?? '', {
      cursor: occurrenceCursor,
      limit: OCCURRENCE_LIMIT,
    }),
    enabled: selected !== null,
  });
  // The rail describes ONE issue, so its header and its occurrences must come
  // from the same one. The detail lags the selection by a request and the
  // previous page is retained meanwhile, so the rail keeps the pair it already
  // has — and marks itself busy — rather than captioning one issue's title
  // over another issue's pages. The list highlight moves on the click.
  const shown = rows.find((issue) => issue.group_id === detailQuery.data?.group_id) ?? selected;
  return { issuesQuery, detailQuery, summary, rows, selected, shown };
}

export function IssuesCatalog({ crawlId }: Readonly<{ crawlId: string }>) {
  const { cursor, filters, selectedGroupId, navigate, selectIssue } = useIssuesCatalogUrlState();
  const [occurrenceCursors, setOccurrenceCursors] = useState<string[]>([]);
  const findingView: FindingView = filters.finding_class;
  const { issuesQuery, detailQuery, summary, rows, selected, shown } = useIssuesCatalogQueries(
    crawlId,
    filters,
    cursor,
    selectedGroupId,
    occurrenceCursors.at(-1),
  );

  const updateFilters = (change: Partial<IssueFilters>) => {
    const changed = changeIssueFilters(filters, change);
    setOccurrenceCursors([]);
    navigate(changed.filters, changed.cursor);
  };
  const chooseGroup = (groupId: string) => {
    selectIssue(groupId);
    setOccurrenceCursors([]);
  };

  // One loader, then the finished view, drawn once. Painting on the list alone
  // shoved everything down when the summary band arrived, and left the rail
  // short until the occurrences did — the panel growing under the first click.
  // Only this FIRST detail can be empty: later selections keep the previous
  // crawl-scoped occurrences while the next set loads.
  if ((issuesQuery.isPending && !issuesQuery.data) || detailQuery.isLoading)
    return <PageLoading label="Loading issues…" />;

  return (
    <div className="grid min-w-0 gap-[var(--page-section-gap)]">
      {summary ? <IssueSummary summary={summary} findingView={findingView} /> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <IssueSearch
          key={filters.query}
          query={filters.query}
          onApply={(query) => updateFilters({ query })}
        />
        <div className="min-w-0 max-[700px]:w-full [&>button]:max-[700px]:w-full">
          <PageKindSelect
            value={filters.page_kind}
            onChange={(page_kind) => updateFilters({ page_kind })}
          />
        </div>
        <div className="max-w-full min-w-0 overflow-x-auto pb-0.5 max-[700px]:w-full">
          <FindingClassFilter
            value={findingView}
            summary={summary}
            onChange={(finding_class) =>
              updateFilters({ finding_class, severity: '', dimension: '' })
            }
          />
        </div>
        <div className="max-w-full min-w-0 overflow-x-auto pb-0.5 max-[700px]:w-full">
          <SegmentedControl
            className="w-max"
            value={selectedFilter(filters)}
            onChange={(value) => updateFilters(filterChange(value))}
            ariaLabel="Issue filters"
            options={FILTERS.filter(
              (item) => findingView === 'defect' || !['high', 'medium', 'low'].includes(item.key),
            ).map((item) => ({
              value: item.key,
              label: `${item.label}${summary ? ` (${filterCount(item.key, summary, findingView)})` : ''}`,
            }))}
          />
        </div>
      </div>

      {issuesQuery.isError ? (
        <Alert tone="danger">Could not load issues for this crawl. Please refresh.</Alert>
      ) : rows.length === 0 ? (
        <p className="text-secondary py-[var(--empty-state-padding)] text-sm">
          No issues match this view.
        </p>
      ) : (
        <div
          className="border-border-subtle grid min-w-0 items-start overflow-hidden rounded-[var(--radius-card)] border min-[701px]:grid-cols-[var(--pane-list-detail)]"
          aria-busy={issuesQuery.isFetching}
        >
          <IssueGroupList rows={rows} selectedGroupId={selected?.group_id} onSelect={chooseGroup} />
          {shown ? (
            <IssueDetailRail
              issue={shown}
              crawlId={crawlId}
              detailQuery={detailQuery}
              canPrevious={occurrenceCursors.length > 0}
              onPrevious={() => setOccurrenceCursors((values) => values.slice(0, -1))}
              onNext={() => {
                const next = detailQuery.data?.next_cursor;
                if (next) setOccurrenceCursors((values) => [...values, next]);
              }}
            />
          ) : null}
        </div>
      )}

      {rows.length > 0 ? (
        <CatalogPager
          cursor={cursor}
          page={issuesQuery.data}
          onGo={(next) => {
            setOccurrenceCursors([]);
            navigate(filters, next);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The catalog's page controls.
 *
 * Renders nothing at all when there is no page to go to. It used to render
 * whenever there were rows and then disable both buttons, so a crawl whose
 * issues all fit on one page showed two permanently dead controls — the same
 * noise the one-point trend chart rule exists to prevent.
 */
function CatalogPager({
  cursor,
  page,
  onGo,
}: Readonly<{
  cursor: string | null;
  page: { next_cursor?: string | null } | undefined;
  onGo: (cursor: string | null) => void;
}>) {
  const nextCursor = page?.next_cursor ?? null;
  if (!cursor && !nextCursor) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="secondary" size="sm" onClick={() => onGo(null)} disabled={!cursor}>
        First page
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => nextCursor && onGo(nextCursor)}
        disabled={!nextCursor}
      >
        Next
      </Button>
    </div>
  );
}

function IssueSummary({
  summary,
  findingView,
}: Readonly<{ summary: IssuesSummary; findingView: FindingView }>) {
  const typeCount =
    findingView === 'defect' ? summary.defect_issue_type_count : summary.advisory_issue_type_count;
  return (
    <div className="border-border-subtle flex flex-wrap gap-x-8 gap-y-3 border-b pb-3">
      <SummaryMeasure value={typeCount} label={`${findingView} issue types`} />
      <SummaryMeasure value={summary.occurrence_count} label={`${findingView} occurrences`} />
      <SummaryMeasure value={summary.affected_url_count} label="affected URLs" />
    </div>
  );
}

function SummaryMeasure({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={textRole('sectionTitle', 'tabular-nums')}>{value}</span>{' '}
      <span className="text-muted text-xs">{label}</span>
    </span>
  );
}

function FindingClassFilter({
  value,
  summary,
  onChange,
}: Readonly<{
  value: FindingView;
  summary: IssuesSummary | null;
  onChange: (value: FindingView) => void;
}>) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      ariaLabel="Finding class"
      options={(['defect', 'advisory'] as const).map((view) => ({
        value: view,
        label: `${view === 'defect' ? 'Defects' : 'Advisories'}${
          summary
            ? ` (${view === 'defect' ? summary.defect_issue_type_count : summary.advisory_issue_type_count})`
            : ''
        }`,
      }))}
    />
  );
}

function IssueGroupList({
  rows,
  selectedGroupId,
  onSelect,
}: Readonly<{
  rows: SiteIssue[];
  selectedGroupId: string | undefined;
  onSelect: (groupId: string) => void;
}>) {
  return (
    <div className="border-border-subtle divide-border-subtle flex min-w-0 divide-x overflow-x-auto border-b min-[701px]:grid min-[701px]:divide-x-0 min-[701px]:divide-y min-[701px]:overflow-visible min-[701px]:border-r min-[701px]:border-b-0">
      {rows.map((issue) => {
        const selected = issue.group_id === selectedGroupId;
        return (
          <Pressable
            key={issue.group_id}
            type="button"
            onClick={() => onSelect(issue.group_id)}
            aria-pressed={selected}
            className={cn(
              'focus-ring grid w-[272px] shrink-0 gap-2 px-4 py-3 text-left transition-colors min-[701px]:w-full',
              selected
                ? 'bg-accent-subtle shadow-[inset_0_2px_0_var(--color-accent)] min-[701px]:shadow-[inset_2px_0_0_var(--color-accent)]'
                : 'hover:bg-active',
            )}
          >
            <span className="flex items-center justify-between gap-3">
              <IssueMetadata issue={issue} />
              <span className="text-muted text-xs whitespace-nowrap">
                {issue.affected_url_count} {issue.affected_url_count === 1 ? 'page' : 'pages'}
              </span>
            </span>
            <span className={textRole('bodyStrong')}>{issueTitle(issue)}</span>
            <span className="text-secondary line-clamp-2 text-xs">{issue.description}</span>
          </Pressable>
        );
      })}
    </div>
  );
}
