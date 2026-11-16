import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ACTION_LIST_VIEW_OPTIONS, useActionFilters } from '@/components/agent/action-queue';
import { ActionsTree, branchAnchor } from '@/components/agent/actions-tree';
import { AnalyzePageButton } from '@/components/agent/analyze-page-dialog';
import { useActionsList } from '@/components/agent/use-actions-list';
import { ReportPage } from '@/components/templates/report-page';
import { Button } from '@/components/ui/button';
import type { DataTableState } from '@/components/ui/data-table';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { FilterBar } from '@/components/ui/filter-bar';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { ProjectLink } from '@/components/ui/project-link';
import { StatusMark } from '@/components/ui/status-mark';
import { SegmentedControl } from '@/components/ui/tabs';
import { textRole } from '@/components/ui/typography';
import { goalTree, sourceTree, type ActionListBranch } from '@/lib/agent/action-list';
import { ACTION_FAMILIES, ACTION_GROUP_LABEL } from '@/lib/agent/vocabulary';
import { ACTION_LIST_VIEWS, type ActionGroup, type ActionListView } from '@/lib/api/actions';
import { commerceQueries } from '@/lib/api/commerce';
import { formatCount } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { actionGroupSchema } from '@citeladder/contracts/actions';

/**
 * Every piece of work in the project in one place (owner, 2026-11-16): the
 * latest crawl's Issues defects as Issues groups them, beside every other
 * Action, under the goal they serve (or their source), then a category. The
 * status view, Source, Priority and grouping are URL state. Analyze a page in
 * the header turns a content page into an Action (CO6).
 */
export function ActionsScreen() {
  const scope = useProjectScope();
  const filters = useActionFilters();
  const list = useActionsList(scope, filters);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const catalog = useQuery(commerceQueries.catalog(scope));
  const branches =
    filters.groupBy === 'goal'
      ? goalTree(list.rows, actionGroupSchema.options, list.actionCounts)
      : sourceTree(list.rows, ACTION_FAMILIES);
  // The goal strip offers the products goal to a project with a catalog, or with product work.
  const goals = actionGroupSchema.options.filter(
    (goal) =>
      goal !== 'products' ||
      (catalog.data?.product_total ?? 0) > 0 ||
      branches.some((branch) => branch.key === goal),
  );
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const jumpTo = (key: string) => {
    setCollapsed((current) => new Set([...current].filter((entry) => entry !== key)));
    const header = document.getElementById(branchAnchor(key));
    header?.scrollIntoView({ block: 'start' });
    header?.querySelector('button')?.focus({ preventScroll: true });
  };
  const everHadWork =
    (list.issueCount ?? 0) > 0 || Object.values(list.statusCounts ?? {}).some((count) => count > 0);

  return (
    <ReportPage
      actions={<AnalyzePageButton />}
      filters={
        <FilterBar
          view={
            <SegmentedControl
              value={filters.view}
              onChange={filters.setView}
              ariaLabel="Status"
              options={ACTION_LIST_VIEW_OPTIONS.map((option) => ({
                ...option,
                count: viewCount(option.value, list.statusCounts, list.issueCount),
              }))}
            />
          }
          filters={everHadWork ? filters.definitions : undefined}
        />
      }
    >
      <Stack gap="tight">
        <h2 className={textRole('heading')}>Close the gaps keeping you out of AI answers</h2>
        <p className={textRole('body', 'text-ink-2')}>
          Start with site fixes. Then improve your pages and earn mentions on the pages AI already
          cites.
        </p>
      </Stack>
      {filters.groupBy === 'goal' && !list.loading && !list.actionsFailed ? (
        <GoalStrip goals={goals} branches={branches} onJump={jumpTo} />
      ) : null}
      {list.issuesFailed ? (
        <Notice
          kind="read"
          {...readErrorProps(list.issuesFailed)}
          title="Couldn't load Website issues"
          fallback="Website issues could not be loaded, so they are missing from this list."
        />
      ) : null}
      <ActionsTree
        branches={branches}
        collapsed={collapsed}
        onToggle={toggle}
        busy={list.fetching}
        state={treeState({
          list,
          branches,
          filtered: filters.filtered,
          onClear: filters.clear,
          view: filters.view,
          everHadWork,
        })}
      />
      {list.truncated ? (
        <p className={textRole('caption')}>
          This view holds more Actions than one list shows; the highest priority are listed. Narrow
          it with Source or Priority.
        </p>
      ) : null}
    </ReportPage>
  );
}

/** A status view's count: the project-wide status counts, Open with the Issues defects once known. */
function viewCount(
  view: ActionListView,
  counts: Readonly<Record<string, number>> | null,
  issueCount: number | null,
): number | undefined {
  if (!counts) return undefined;
  const total = ACTION_LIST_VIEWS[view].reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  if (view !== 'open') return total;
  return issueCount === null ? undefined : total + issueCount;
}

/** One cell per goal with how much it holds; a cell jumps to its goal in the tree. */
function GoalStrip({
  goals,
  branches,
  onJump,
}: Readonly<{
  goals: readonly ActionGroup[];
  branches: readonly ActionListBranch[];
  onJump: (key: string) => void;
}>) {
  const segments = goals.map((goal): FigureSegment => {
    const branch = branches.find((candidate) => candidate.key === goal);
    const label = ACTION_GROUP_LABEL[goal];
    const count = branch?.count ?? 0;
    return {
      key: goal,
      label,
      value: formatCount(count),
      marker: branch?.blocking ? (
        <StatusMark variant="severity" value="critical">
          Blocking
        </StatusMark>
      ) : undefined,
      onSelect: () => onJump(goal),
      actionLabel: `Go to ${label}, ${formatCount(count)}`,
    };
  });
  return <FigureStrip label="Goals" segments={segments} />;
}

/** What the tree says before it has rows: loading, failed, nothing matches, or nothing yet. */
function treeState({
  list,
  branches,
  filtered,
  onClear,
  view,
  everHadWork,
}: Readonly<{
  list: ReturnType<typeof useActionsList>;
  branches: readonly ActionListBranch[];
  filtered: boolean;
  onClear: () => void;
  view: ActionListView;
  everHadWork: boolean;
}>): DataTableState | undefined {
  if (list.loading) return { kind: 'loading', label: 'Loading Actions…' };
  if (list.actionsFailed)
    return {
      kind: 'error',
      ...readErrorProps(list.actionsFailed),
      title: "Couldn't load Actions",
      fallback: 'Actions could not be loaded.',
    };
  if (branches.length > 0) return undefined;
  if (filtered) return { kind: 'filtered', heading: 'No Actions match these filters', onClear };
  if (everHadWork) return { kind: 'empty', icon: ICONS.opportunities, heading: EMPTY_VIEW[view] };
  return {
    kind: 'empty',
    icon: ICONS.opportunities,
    heading: 'No current Actions',
    description:
      'Actions are the work found on your site, your pages, your products and the sites that cite rivals. None are listed now: no crawl, visibility run or Search Console sync has current work to show.',
    action: (
      <Button asChild>
        <ProjectLink href="/site">
          <Icon icon={ICONS.site} />
          Open Website
        </ProjectLink>
      </Button>
    ),
  };
}

const EMPTY_VIEW: Record<ActionListView, string> = {
  open: 'No open Actions',
  in_progress: 'No Actions in progress',
  measuring: 'No Actions being measured',
  done: 'No Actions done yet',
  dismissed: 'No dismissed Actions',
};
