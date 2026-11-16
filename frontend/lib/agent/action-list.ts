/**
 * The Actions list's rows and tree, PURE: the Issues defects of the latest
 * crawl (as the Issues screen groups them) beside every other Action, under a
 * goal (or a source), then a category. No transport and no React.
 */
import type { IssueFixProgress, IssueSection, SiteIssue } from '@citeladder/contracts';

import { ACTION_GROUP_LABEL, familyLabel } from '@/lib/agent/vocabulary';
import type { Action, ActionGroup, ActionPriorityBand } from '@/lib/api/actions';
import {
  ACTION_CATEGORIES,
  ACTION_CATEGORY_FALLBACK,
  ISSUE_CATEGORY_FALLBACK,
  ISSUE_CATEGORY_LABEL,
  ISSUE_SECTION_GOAL,
} from '@/lib/config/agent';
import { severityPriority } from '@/lib/site-health/issues';

/** The Source of a row read from Issues; every other row's Source is its evidence family. */
export const ISSUES_SOURCE = 'issues';
const OTHER_SOURCE = 'other';

export type ActionListRow =
  | Readonly<{
      kind: 'issue';
      key: string;
      goal: ActionGroup;
      category: string;
      priority: ActionPriorityBand;
      issue: SiteIssue;
      section: IssueSection;
      fix: IssueFixProgress | null;
    }>
  | Readonly<{
      kind: 'action';
      key: string;
      goal: ActionGroup;
      category: string;
      priority: ActionPriorityBand | null;
      action: Action;
    }>;

export type ActionListCategory = Readonly<{ label: string; rows: readonly ActionListRow[] }>;

/** A goal or a source: its count, whether a critical issue blocks it, then its categories. */
export type ActionListBranch = Readonly<{
  key: string;
  label: string;
  count: number;
  blocking: boolean;
  categories: readonly ActionListCategory[];
}>;

/** An Action's category: the first configured rule that admits it. */
export function actionCategory(action: Pick<Action, 'target_kind' | 'approach' | 'families'>) {
  const rule = ACTION_CATEGORIES.find(
    (candidate) =>
      (!candidate.targetKinds ||
        candidate.targetKinds.some((kind) => kind === action.target_kind)) &&
      (!candidate.approaches || candidate.approaches.includes(action.approach)) &&
      (!candidate.families ||
        candidate.families.some((family) => action.families.includes(family))),
  );
  return rule?.label ?? ACTION_CATEGORY_FALLBACK;
}

const CATEGORY_ORDER = [
  ...new Set([...ACTION_CATEGORIES.map((rule) => rule.label), ACTION_CATEGORY_FALLBACK]),
];

/** An issue's category as it reads: its rule's own category, else the fallback. */
function issueCategoryLabel(category: string): string {
  return ISSUE_CATEGORY_LABEL.get(category) ?? ISSUE_CATEGORY_FALLBACK;
}

/**
 * Each Issues tab's defects as rows, in the Issues order: the goal its tab
 * falls under, its rule's category, and its fix progress when read.
 */
export function issueRows(
  sections: readonly Readonly<{ section: IssueSection; items: readonly SiteIssue[] }>[],
  fixes: readonly IssueFixProgress[],
): ActionListRow[] {
  const progress = new Map(fixes.map((fix) => [fix.group_id, fix]));
  return sections.flatMap(({ section, items }) =>
    items.map((issue) => ({
      kind: 'issue' as const,
      key: `issue/${issue.group_id}`,
      goal: ISSUE_SECTION_GOAL[section],
      category: issueCategoryLabel(issue.category),
      priority: severityPriority(issue.severity),
      issue,
      section,
      fix: progress.get(issue.group_id) ?? null,
    })),
  );
}

/** Every other Action as a row, by category in the configured order and by priority within one. */
export function actionRows(actions: readonly Action[]): ActionListRow[] {
  const rows = actions.map((action) => ({
    kind: 'action' as const,
    key: `action/${action.id}`,
    goal: action.group,
    category: actionCategory(action),
    priority: action.priority_band,
    action,
  }));
  const rank = (row: (typeof rows)[number]) => CATEGORY_ORDER.indexOf(row.category);
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) || (b.action.priority_score ?? -1) - (a.action.priority_score ?? -1),
  );
}

/** A row's Source key: Issues, or the Action's first evidence family. */
export function rowSource(row: ActionListRow): string {
  if (row.kind === 'issue') return ISSUES_SOURCE;
  return row.action.families[0] ?? OTHER_SOURCE;
}

/** A row's Source as it reads: Issues, or every family the Action's evidence comes from. */
export function rowSourceLabel(row: ActionListRow): string {
  if (row.kind === 'issue') return 'Issues';
  return row.action.families.map(familyLabel).filter(Boolean).join(', ') || 'Other';
}

/** The rows of one branch under their categories, in the rows' order. */
function categorize(rows: readonly ActionListRow[]): ActionListCategory[] {
  const byLabel = new Map<string, ActionListRow[]>();
  for (const row of rows) byLabel.set(row.category, [...(byLabel.get(row.category) ?? []), row]);
  return [...byLabel].map(([label, members]) => ({ label, rows: members }));
}

/** A critical issue in a goal blocks it: AI cannot read that part of the site. */
const blocks = (rows: readonly ActionListRow[]) =>
  rows.some((row) => row.kind === 'issue' && row.issue.severity === 'critical');

/**
 * The rows under each goal in the list's order; a goal with nothing is left
 * out. `actionCounts` is the server's count per goal, which reaches past one read.
 */
export function goalTree(
  rows: readonly ActionListRow[],
  goals: readonly ActionGroup[],
  actionCounts: Readonly<Partial<Record<ActionGroup, number>>>,
): ActionListBranch[] {
  return goals.flatMap((goal) => {
    const members = rows.filter((row) => row.goal === goal);
    const issues = members.filter((row) => row.kind === 'issue').length;
    const count = issues + (actionCounts[goal] ?? 0);
    if (count === 0) return [];
    return [
      {
        key: goal,
        label: ACTION_GROUP_LABEL[goal],
        count,
        blocking: blocks(members),
        categories: categorize(members),
      },
    ];
  });
}

/** The rows under each Source: Issues first, then each evidence family in `families` order. */
export function sourceTree(
  rows: readonly ActionListRow[],
  families: readonly string[],
): ActionListBranch[] {
  return [ISSUES_SOURCE, ...families, OTHER_SOURCE].flatMap((source) => {
    const members = rows.filter((row) => rowSource(row) === source);
    if (members.length === 0) return [];
    let label = familyLabel(source) ?? 'Other sources';
    if (source === ISSUES_SOURCE) label = 'Issues';
    return [
      {
        key: source,
        label,
        count: members.length,
        blocking: blocks(members),
        categories: categorize(members),
      },
    ];
  });
}
