import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ReportPage } from '@/components/templates/report-page';
import { IssuesExport } from '@/components/site-health/issues-export';
import { Inline } from '@/components/ui/layout';
import { IssuePage, PendingIssuePage, type IssueHead } from '@/components/site-health/issue-page';
import { ISSUE_COLUMNS, IssueRow } from '@/components/site-health/issue-rows';
import { pageKindFilter } from '@/components/site-health/page-kind-select';
import { choiceFilter, type FilterDefinition } from '@/components/ui/all-filters';
import {
  DataTable,
  type DataTableColumn,
  type DataTablePager,
  type DataTableState,
} from '@/components/ui/data-table';
import { InfoHint } from '@/components/ui/info-hint';
import { readErrorProps } from '@/components/ui/notice';
import { READ_FAILED } from '@/components/ui/state-block';
import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { SubmittedSearch } from '@/components/site-health/submitted-search';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { statusLabel } from '@/lib/site-health/status';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { ICONS } from '@/lib/icons';
import { ISSUE_OCCURRENCE_LIMIT, ISSUE_PAGE_LIMIT } from '@/lib/config/site-health';
import type { IssueSort, SiteIssue } from '@citeladder/contracts';
import {
  ISSUE_SEVERITY_CHOICES,
  issueCatalogParams,
  issueSeverityChange,
  issueSeverityChoice,
  toIssueParams,
  useIssueFilters,
  type IssueFilters,
} from '@/lib/site-health/issue-filters';
import { issueTitle } from '@/lib/site-health/issues';

function useIssuesCatalogQueries({
  workspaceId,
  crawlId,
  filters,
  cursor,
  selectedGroupId,
  occurrenceCursor,
}: Readonly<{
  workspaceId: string;
  crawlId: string;
  filters: IssueFilters;
  cursor: string | null;
  selectedGroupId: string | null;
  occurrenceCursor: string | undefined;
}>) {
  const params = useMemo(
    () => ({ ...issueCatalogParams(filters, cursor), section: undefined }),
    [filters, cursor],
  );
  const issuesQuery = useQuery(siteHealthQueries.issues(workspaceId, crawlId, params));
  const detailQuery = useQuery({
    ...siteHealthQueries.issue(workspaceId, crawlId, selectedGroupId ?? '', {
      cursor: occurrenceCursor,
      limit: ISSUE_OCCURRENCE_LIMIT,
      page_kind: filters.page_kind || undefined,
    }),
    enabled: selectedGroupId !== null,
  });
  const rows = issuesQuery.data?.items ?? [];
  const detail = detailQuery.data?.group_id === selectedGroupId ? detailQuery.data : undefined;
  const open: IssueHead | null =
    rows.find((issue) => issue.group_id === selectedGroupId) ?? detail ?? null;
  return { issuesQuery, detailQuery, rows, open };
}

export function IssuesCatalog({
  workspaceId,
  projectId,
  crawlId,
  notice,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  crawlId: string;
  notice?: ReactNode;
}>) {
  const catalog = useIssueFilters();
  const { filters, cursor, selectedGroupId, updateFilters } = catalog;
  const { issuesQuery, detailQuery, rows, open } = useIssuesCatalogQueries({
    workspaceId,
    crawlId,
    filters,
    cursor,
    selectedGroupId,
    occurrenceCursor: catalog.occurrenceCursor,
  });
  const pager = useCatalogPager(cursor, issuesQuery.data?.next_cursor ?? null, catalog.goToPage);

  if (selectedGroupId !== null) {
    const close = () => catalog.selectIssue(null);
    return open ? (
      <IssuePage
        issue={open}
        scope={{ workspaceId, projectId }}
        crawlId={crawlId}
        pageKind={filters.page_kind}
        detailQuery={detailQuery}
        canPrevious={catalog.canPageOccurrencesBack}
        onPrevious={catalog.previousOccurrences}
        onNext={() => {
          const next = detailQuery.data?.next_cursor;
          if (next) catalog.nextOccurrences(next);
        }}
        onClose={close}
      />
    ) : (
      <PendingIssuePage detailQuery={detailQuery} onClose={close} />
    );
  }

  return (
    <ReportPage
      actions={
        <IssuesExport
          workspaceId={workspaceId}
          crawlId={crawlId}
          filters={{ ...toIssueParams(filters), section: undefined }}
        />
      }
    >
      {notice}
      <DataTable
        label="Issues"
        columns={issueColumns(filters.sort, (sort) => updateFilters({ sort }))}
        toolbar={{
          search: (
            <SubmittedSearch
              key={filters.query}
              query={filters.query}
              onApply={(query) => updateFilters({ query })}
              placeholder="Search issues…"
              label="Search issues"
            />
          ),
          filters: catalogFilters(filters, rows, updateFilters),
        }}
        state={tableState(issuesQuery)}
        rowCount={rows.length}
        pageSize={ISSUE_PAGE_LIMIT}
        pager={pager}
        busy={{ active: issuesQuery.isFetching, label: 'Updating issues' }}
      >
        {issueGroups(rows).map((group) => (
          <Fragment key={group.label}>
            <TableRow>
              <TableCell colSpan={ISSUE_COLUMNS.length} className={textRole('emphasis', 'bg-well')}>
                {group.label}
              </TableCell>
            </TableRow>
            {group.issues.map((issue) => (
              <CatalogRow key={issue.group_id} issue={issue} onOpen={catalog.selectIssue} />
            ))}
          </Fragment>
        ))}
      </DataTable>
    </ReportPage>
  );
}

function tableState(query: ReturnType<typeof useIssuesCatalogQueries>['issuesQuery']) {
  if (query.isError && !query.data)
    return {
      kind: 'error',
      ...readErrorProps(query),
      fallback: READ_FAILED,
      title: "Couldn't load issues for this crawl",
    } satisfies DataTableState;
  if (!query.data) return { kind: 'loading', label: 'Loading issues…' } satisfies DataTableState;
  if (query.data.items.length === 0)
    return {
      kind: 'empty',
      icon: ICONS.issues,
      heading: 'No issue types match this view',
    } satisfies DataTableState;
  return undefined;
}

function issueColumns(sort: IssueSort, onSort: (sort: IssueSort) => void): DataTableColumn[] {
  const sorted = (key: IssueSort) => ({
    active: sort === key,
    descending: true,
    onSort: () => onSort(key),
  });
  return ISSUE_COLUMNS.map((column) => {
    if (column.key === 'severity') return { ...column, sort: sorted('severity') };
    if (column.key === 'pages') return { ...column, sort: sorted('pages') };
    return column;
  });
}

function groupLabel(issue: SiteIssue): string {
  return issue.dimension === 'aeo'
    ? `AEO: ${statusLabel(issue.category).toLowerCase()}`
    : 'Technical';
}

function issueGroups(rows: readonly SiteIssue[]) {
  const groups = new Map<string, SiteIssue[]>();
  for (const issue of rows) {
    const label = groupLabel(issue);
    groups.set(label, [...(groups.get(label) ?? []), issue]);
  }
  return [...groups].map(([label, issues]) => ({ label, issues }));
}

function CatalogRow({
  issue,
  onOpen,
}: Readonly<{ issue: SiteIssue; onOpen: (groupId: string) => void }>) {
  const open = () => onOpen(issue.group_id);
  return (
    <IssueRow
      issue={issue}
      onOpen={open}
      name={(title) => (
        <Inline gap="tight">
          <TextLink asChild underline="hover">
            <Pressable
              onClick={(event) => {
                event.stopPropagation();
                open();
              }}
              className="min-h-6 w-auto min-w-0"
            >
              <ClampText>{title}</ClampText>
            </Pressable>
          </TextLink>
          {issue.description ? (
            <InfoHint label={`What “${title}” checks`}>{issue.description}</InfoHint>
          ) : null}
        </Inline>
      )}
    />
  );
}

function catalogFilters(
  filters: IssueFilters,
  rows: readonly SiteIssue[],
  updateFilters: (change: Partial<IssueFilters>) => void,
): FilterDefinition[] {
  return [
    choiceFilter({
      id: 'severity',
      label: 'Severity',
      value: issueSeverityChoice(filters),
      defaultValue: 'all',
      onChange: (value) => updateFilters(issueSeverityChange(value)),
      groups: [
        { options: ISSUE_SEVERITY_CHOICES.map(({ key, label }) => ({ value: key, label })) },
      ],
    }),
    pageKindFilter({
      value: filters.page_kind,
      onChange: (page_kind) => updateFilters({ page_kind }),
    }),
    ...(filters.rule_id
      ? [
          choiceFilter({
            id: 'rule',
            label: 'Issue',
            value: filters.rule_id,
            defaultValue: '',
            onChange: (rule_id) => updateFilters({ rule_id }),
            groups: [
              {
                options: [
                  { value: '', label: 'All issues' },
                  { value: filters.rule_id, label: ruleFilterTitle(rows, filters.rule_id) },
                ],
              },
            ],
          }),
        ]
      : []),
  ];
}

function ruleFilterTitle(rows: readonly SiteIssue[], ruleId: string): string {
  const row = rows.find((issue) => issue.rule_id === ruleId);
  return row ? issueTitle(row) : 'one issue';
}

function useCatalogPager(
  cursor: string | null,
  nextCursor: string | null,
  onGo: (cursor: string | null) => void,
): DataTablePager {
  const [trail, setTrail] = useState<(string | null)[]>([]);
  const followed = cursor ? trail : [];
  return {
    canPrev: Boolean(cursor),
    canNext: Boolean(nextCursor),
    onFirst: () => {
      setTrail([]);
      onGo(null);
    },
    onPrev: () => {
      setTrail(followed.slice(0, -1));
      onGo(followed.at(-1) ?? null);
    },
    onNext: () => {
      if (!nextCursor) return;
      setTrail([...followed, cursor]);
      onGo(nextCursor);
    },
  };
}
