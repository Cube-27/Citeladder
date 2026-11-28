import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ReportPage } from '@/components/templates/report-page';
import { IssuesExport } from '@/components/site-health/issues-export';
import { Inline } from '@/components/ui/layout';
import { IssuePage, PendingIssuePage, type IssueHead } from '@/components/site-health/issue-page';
import { ISSUE_COLUMNS, IssueRow } from '@/components/site-health/issue-rows';
import { pageKindFilter } from '@/components/site-health/page-kind-select';
import { choiceFilter, type FilterDefinition } from '@/components/ui/all-filters';
import { DataTable, type DataTableColumn, type DataTablePager } from '@/components/ui/data-table';
import { InfoHint } from '@/components/ui/info-hint';
import { queryTableState } from '@/components/ui/state-block';
import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { SubmittedSearch } from '@/components/site-health/submitted-search';
import { ClampText } from '@/components/ui/clamp-text';
import { TableGroupRow } from '@/components/ui/table';
import { statusLabel } from '@/lib/site-health/status';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { ICONS } from '@/lib/icons';
import { ISSUE_PAGE_LIMIT } from '@/lib/config/site-health';
import { pageRange } from '@/lib/table/use-cursor-table';
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
  pageSize,
  occurrences,
}: Readonly<{
  workspaceId: string;
  crawlId: string;
  filters: IssueFilters;
  cursor: string | null;
  selectedGroupId: string | null;
  pageSize: number;
  occurrences: Readonly<{ cursor: string | undefined; pageSize: number }>;
}>) {
  const params = useMemo(
    () => ({ ...issueCatalogParams(filters, cursor, pageSize), section: undefined }),
    [filters, cursor, pageSize],
  );
  const issuesQuery = useQuery(siteHealthQueries.issues(workspaceId, crawlId, params));
  const detailQuery = useQuery({
    ...siteHealthQueries.issue(workspaceId, crawlId, selectedGroupId ?? '', {
      cursor: occurrences.cursor,
      limit: occurrences.pageSize,
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
  const [pageSize, setPageSize] = useState<number>(ISSUE_PAGE_LIMIT);
  const { issuesQuery, detailQuery, rows, open } = useIssuesCatalogQueries({
    workspaceId,
    crawlId,
    filters,
    cursor,
    selectedGroupId,
    pageSize,
    occurrences: catalog.occurrences,
  });
  const pager = useCatalogPager({
    cursor,
    nextCursor: issuesQuery.data?.next_cursor ?? null,
    shown: rows.length,
    pageSize,
    onPageSize: setPageSize,
    onGo: catalog.goToPage,
  });

  if (selectedGroupId !== null) {
    const close = () => catalog.selectIssue(null);
    return open ? (
      <IssuePage
        issue={open}
        scope={{ workspaceId, projectId }}
        crawlId={crawlId}
        pageKind={filters.page_kind}
        detailQuery={detailQuery}
        occurrences={catalog.occurrences}
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
        {...tableState(issuesQuery)}
        pageSize={pageSize}
        pager={pager}
        busy={{ active: issuesQuery.isFetching, label: 'Updating issues' }}
      >
        {issueGroups(rows).map((group) => (
          <Fragment key={group.label}>
            <TableGroupRow span={ISSUE_COLUMNS.length}>{group.label}</TableGroupRow>
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
  return queryTableState(query, {
    subject: 'issues for this crawl',
    empty: (data) =>
      data.items.length === 0
        ? { kind: 'empty', icon: ICONS.issues, heading: 'No issue types match this view' }
        : undefined,
  });
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
      renderName={(title) => (
        <Inline gap="tight">
          <TextLink asChild underline="hover">
            <Pressable
              onClick={(event) => {
                event.stopPropagation();
                open();
              }}
              box="target-shrink"
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

function useCatalogPager({
  cursor,
  nextCursor,
  shown,
  pageSize,
  onPageSize,
  onGo,
}: Readonly<{
  cursor: string | null;
  nextCursor: string | null;
  shown: number;
  pageSize: number;
  onPageSize: (size: number) => void;
  onGo: (cursor: string | null) => void;
}>): DataTablePager {
  const [trail, setTrail] = useState<(string | null)[]>([]);
  const followed = cursor ? trail : [];
  return {
    range: {
      ...pageRange(followed.length + 1, pageSize, shown),
      cursor: true,
      noun: 'issues',
    },
    pageSize: {
      value: pageSize,
      onChange: (size) => {
        onPageSize(size);
        setTrail([]);
        onGo(null);
      },
    },
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
