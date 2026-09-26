'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageShell } from '@/components/layout/page-shell';
import { Stack } from '@/components/ui/layout';
import { IssuesLoading } from '@/components/site-health/issues-loading';
import { IssueDetailRail } from '@/components/site-health/issue-detail-rail';
import { IssueMetadata } from '@/components/site-health/issue-metadata';
import { PageKindSelect } from '@/components/site-health/page-kind-select';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { siteHealthQueries } from '@/lib/api/site-health';
import { ISSUE_OCCURRENCE_LIMIT, ISSUE_PAGE_LIMIT } from '@/lib/config/site-health';
import type { IssuesSummary, SiteIssue } from '@/lib/api/types';
import {
  findingClassChange,
  issueFilterClass,
  issueFilterClassChange,
  issueFilterClasses,
  toIssueParams,
  useIssueFilters,
  type FindingClass,
  type IssueFilterClass,
  type IssueFilters,
} from '@/lib/site-health/issue-filters';
import { issueTitle } from '@/lib/site-health/issues';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';

/** The toggle's label, with the count only once a summary has landed. */
function findingViewLabel(view: FindingClass, summary: IssuesSummary | null): string {
  const defects = view === 'defect';
  const label = defects ? 'Defects' : 'Advisories';
  if (!summary) return label;
  const count = defects ? summary.defect_issue_type_count : summary.advisory_issue_type_count;
  return `${label} (${count})`;
}

function filterCount(filter: IssueFilterClass, summary: IssuesSummary, view: FindingClass): number {
  if (filter === 'high')
    return (summary.severity_counts.high ?? 0) + (summary.severity_counts.critical ?? 0);
  if (filter === 'medium' || filter === 'low') return summary.severity_counts[filter] ?? 0;
  if (filter === 'technical' || filter === 'aeo') return summary.dimension_counts[filter] ?? 0;
  return view === 'defect' ? summary.defect_issue_type_count : summary.advisory_issue_type_count;
}

/** The issue page, then the occurrences of whichever issue the rail shows. */
function useIssuesCatalogQueries(
  workspaceId: string,
  crawlId: string,
  filters: IssueFilters,
  cursor: string | null,
  selectedGroupId: string | null,
  occurrenceCursor: string | undefined,
) {
  const params = useMemo(() => toIssueParams(filters, cursor, ISSUE_PAGE_LIMIT), [filters, cursor]);
  const issuesQuery = useQuery(siteHealthQueries.issues(workspaceId, crawlId, params));
  const summary = issuesQuery.data?.summary ?? null;
  const rows = issuesQuery.data?.items ?? [];
  const selected = rows.find((issue) => issue.group_id === selectedGroupId) ?? rows[0] ?? null;
  const detailQuery = useQuery({
    ...siteHealthQueries.issue(workspaceId, crawlId, selected?.group_id ?? '', {
      cursor: occurrenceCursor,
      limit: ISSUE_OCCURRENCE_LIMIT,
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

export function IssuesCatalog({
  workspaceId,
  crawlId,
  notice,
}: Readonly<{
  workspaceId: string;
  crawlId: string;
  /** A refresh failure to report above the catalog it could not refresh. */
  notice?: ReactNode;
}>) {
  const catalog = useIssueFilters();
  const { filters, cursor, selectedGroupId, updateFilters } = catalog;
  const findingView = filters.finding_class;
  const { issuesQuery, detailQuery, summary, rows, selected, shown } = useIssuesCatalogQueries(
    workspaceId,
    crawlId,
    filters,
    cursor,
    selectedGroupId,
    catalog.occurrenceCursor,
  );

  // Wait for the issues page, and only for that.
  //
  // This used to wait for the first issue's OCCURRENCES as well — a third
  // request that cannot even begin until the second one names an issue. So the
  // whole screen was withheld for three sequential round trips to show a list
  // that the second one had already fully answered.
  //
  // The reason given for waiting was layout: painting the list alone shoved
  // everything down when the summary arrived and left the rail short until the
  // occurrences did. That is an argument for reserving the space, which the
  // grid below now does, not for showing nothing.
  if (issuesQuery.isPending && !issuesQuery.data)
    return (
      <PageShell>
        <Stack gap="section" className="min-w-0">
          {notice}
          <IssuesLoading />
        </Stack>
      </PageShell>
    );

  let issuesBody: ReactNode = (
    <div
      // `min-h` matches the loading placeholder's, so the pane keeps its height
      // while the rail's own read lands rather than growing under the reader.
      className="border-border grid min-h-[32rem] min-w-0 items-start overflow-hidden rounded-[var(--radius-card)] border min-[701px]:grid-cols-[var(--pane-list-detail)]"
      aria-busy={issuesQuery.isFetching}
    >
      <IssueGroupList
        rows={rows}
        selectedGroupId={selected?.group_id}
        onSelect={catalog.selectIssue}
      />
      {shown ? (
        <IssueDetailRail
          issue={shown}
          crawlId={crawlId}
          detailQuery={detailQuery}
          canPrevious={catalog.canPageOccurrencesBack}
          onPrevious={catalog.previousOccurrences}
          onNext={() => {
            const next = detailQuery.data?.next_cursor;
            if (next) catalog.nextOccurrences(next);
          }}
        />
      ) : null}
    </div>
  );
  if (issuesQuery.isError) {
    issuesBody = <Alert tone="danger">Could not load issues for this crawl. Please refresh.</Alert>;
  } else if (rows.length === 0) {
    issuesBody = (
      <p className="text-secondary py-[var(--empty-state-padding)] text-sm">
        No issues match this view.
      </p>
    );
  }

  return (
    <PageShell
      controls={
        <>
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
          <div className="max-w-full min-w-0 max-[700px]:w-full">
            <FindingClassFilter
              value={findingView}
              summary={summary}
              onChange={(value) => updateFilters(findingClassChange(value))}
            />
          </div>
          <div className="max-w-full min-w-0 max-[700px]:w-full">
            <SegmentedControl
              value={issueFilterClass(filters)}
              onChange={(value) => updateFilters(issueFilterClassChange(value))}
              ariaLabel="Issue filters"
              options={issueFilterClasses(findingView).map((item) => ({
                value: item.key,
                label: `${item.label}${summary ? ` (${filterCount(item.key, summary, findingView)})` : ''}`,
              }))}
            />
          </div>
        </>
      }
    >
      <Stack gap="section" className="min-w-0">
        {notice}
        {summary ? <IssueSummary summary={summary} findingView={findingView} /> : null}

        {issuesBody}

        {rows.length > 0 ? (
          <CatalogPager cursor={cursor} page={issuesQuery.data} onGo={catalog.goToPage} />
        ) : null}
      </Stack>
    </PageShell>
  );
}

function IssueSearch({
  query,
  onApply,
}: Readonly<{ query: string; onApply: (query: string) => void }>) {
  const [draft, setDraft] = useState(query);
  return (
    <form
      className="min-w-0 max-[700px]:w-full"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <SearchField
        size="compact"
        value={draft}
        onValueChange={setDraft}
        placeholder="Search issues…"
        aria-label="Search issues"
        className="w-full max-w-xs max-[700px]:max-w-none"
      />
    </form>
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
}: Readonly<{ summary: IssuesSummary; findingView: FindingClass }>) {
  const typeCount =
    findingView === 'defect' ? summary.defect_issue_type_count : summary.advisory_issue_type_count;
  return (
    <div className="border-border-subtle flex flex-wrap gap-x-8 gap-y-3 border-b pb-3 min-[981px]:border-b-0 min-[981px]:pb-0">
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
  value: FindingClass;
  summary: IssuesSummary | null;
  onChange: (value: FindingClass) => void;
}>) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      ariaLabel="Finding class"
      options={(['defect', 'advisory'] as const).map((view) => ({
        value: view,
        label: findingViewLabel(view, summary),
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
