import { useQueries, useQuery } from '@tanstack/react-query';

import { actionGroupSchema } from '@citeladder/contracts/actions';

import { actionRows, issueRows, ISSUES_SOURCE } from '@/lib/agent/action-list';
import {
  actionsQueries,
  type ActionGroup,
  type ActionListView,
  type ActionPriorityBand,
  type ActionsPage,
} from '@/lib/api/actions';
import type { RetryableRead } from '@/components/ui/notice';
import { httpErrorStatus } from '@/lib/api/errors';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { actionsIssueParams, ISSUE_SECTIONS } from '@/lib/site-health/issue-filters';

type ListFilters = Readonly<{
  view: ActionListView;
  source: string | undefined;
  priority: ActionPriorityBand | undefined;
}>;

/** Whether a previous read was for this workspace's project, so its rows may stand in. */
function sameProject(key: unknown, { workspaceId, projectId }: ProjectScope): boolean {
  return Array.isArray(key) && key.includes(workspaceId) && key.includes(projectId);
}

/**
 * The Actions list's reads, none waiting on another but the crawl: the status
 * view's Actions (a read per status it holds), and the latest crawl's Issues
 * defects (a read per Issues tab) with their fix progress. Issues rows belong
 * to the Open view only, but their count is Open's too, so they are always read.
 */
export function useActionsList(scope: ProjectScope, filters: ListFilters) {
  const family = filters.source === ISSUES_SOURCE ? undefined : filters.source;
  const actionReads = useQueries({
    queries: actionsQueries
      .statusView(scope, filters.view, { priority: filters.priority, family })
      .map((read) => ({
        ...read,
        // A filter change keeps this project's rows on screen until the next land.
        placeholderData: (previous: ActionsPage | undefined, query?: { queryKey: unknown }) =>
          sameProject(query?.queryKey, scope) ? previous : undefined,
      })),
  });
  const dashboard = useQuery(siteHealthQueries.dashboard(scope));
  const crawlId = dashboard.data?.crawl?.id ?? null;
  const issueReads = useQueries({
    queries: ISSUE_SECTIONS.map(({ value }) => ({
      ...siteHealthQueries.issues(scope.workspaceId, crawlId ?? '', actionsIssueParams(value)),
      enabled: crawlId !== null,
    })),
  });
  // Fix progress is a side read: while it loads or fails, rows show no fix line.
  const fixes = useQuery({
    ...siteHealthQueries.issueFixes(scope.workspaceId, crawlId ?? ''),
    enabled: crawlId !== null,
  });

  const pages = actionReads.flatMap((read) => (read.data ? [read.data] : []));
  const statusCounts = pages[0]?.status_counts ?? null;
  const issuePages = issueReads.flatMap((read) => (read.data ? [read.data] : []));
  const issueCount = issuePages[0]
    ? Object.values(issuePages[0].summary.section_counts).reduce((sum, count) => sum + count, 0)
    : 0;
  // A family Source reads only that family's Actions; Issues reads no Actions.
  const showIssues = filters.view === 'open' && family === undefined;
  const showActions = filters.source !== ISSUES_SOURCE;

  const issues = showIssues
    ? issueRows(
        ISSUE_SECTIONS.flatMap(({ value }, index) => {
          const page = issueReads[index]?.data;
          return page ? [{ section: value, items: page.items }] : [];
        }),
        fixes.data?.items ?? [],
      ).filter((row) => !filters.priority || row.priority === filters.priority)
    : [];
  const actions = showActions ? actionRows(pages.flatMap((page) => page.items)) : [];
  const actionCounts: Partial<Record<ActionGroup, number>> = {};
  if (showActions)
    for (const goal of actionGroupSchema.options)
      actionCounts[goal] = pages.reduce((sum, page) => sum + (page.group_counts[goal] ?? 0), 0);

  const issuesPending =
    showIssues &&
    (dashboard.isPending || (crawlId !== null && issueReads.some((r) => r.isPending)));
  // A project without Website access simply has no Issues rows; any other failure is said.
  const status = httpErrorStatus(dashboard.error);
  const denied = status === 401 || status === 403;
  let issuesFailed: RetryableRead | undefined = issueReads.find(
    (read) => read.isError && !read.data,
  );
  if (dashboard.isError && !dashboard.data) issuesFailed = denied ? undefined : dashboard;
  return {
    rows: [...issues, ...actions],
    actionCounts,
    statusCounts,
    issueCount,
    /** More Actions hold this view than one read returns. */
    truncated: showActions && pages.some((page) => page.next_cursor !== null),
    loading: actionReads.some((read) => read.isPending) || issuesPending,
    fetching: actionReads.some((read) => read.isFetching && !read.isPending),
    actionsFailed: actionReads.find((read) => read.isError && !read.data),
    issuesFailed: showIssues ? issuesFailed : undefined,
  };
}
