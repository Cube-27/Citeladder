import { Fragment, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ActionPriorityBadge } from '@/components/agent/action-status-badge';
import { IssueSeverityMark } from '@/components/site-health/issue-metadata';
import { fixedLabel } from '@/components/site-health/issue-fix-actions';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { StatusMark } from '@/components/ui/status-mark';
import { TableCell, TableRow } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { actionTarget } from '@/lib/agent/action-title';
import {
  rowSourceLabel,
  type ActionListBranch,
  type ActionListCategory,
  type ActionListRow,
} from '@/lib/agent/action-list';
import { approachLabel } from '@/lib/agent/vocabulary';
import { ACTIONS_CATEGORY_ROWS } from '@/lib/config/agent';
import { formatCount, pluralCount, readableUrl } from '@/lib/format';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { issueHref } from '@/lib/site-health/issue-filters';
import { issueTitle } from '@/lib/site-health/issues';
import { isSiteLevelRule } from '@/lib/site-health/site-level-evidence';

// The server orders Actions by priority and Issues by severity; neither column sorts.
const COLUMNS: readonly DataTableColumn[] = [
  { key: 'action', label: 'Action', kind: 'identity' },
  { key: 'priority', label: 'Priority', kind: 'status' },
  { key: 'source', label: 'Source', width: 'category', priority: 'low' },
];

/** The id of a branch's header row, which the goal strip jumps to. */
export const branchAnchor = (key: string) => `actions-branch-${key}`;

/**
 * The list's tree in one table: each goal (or source) a header row that folds
 * it, each category under it a header row that folds its rows, then the rows.
 * A long category shows its first rows and "Show more".
 */
export function ActionsTree({
  branches,
  collapsed,
  onToggle,
  state,
  busy,
}: Readonly<{
  branches: readonly ActionListBranch[];
  /** Folded branches and categories, by `branch` and `branch/category` keys. */
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
  state: DataTableState | undefined;
  busy: boolean;
}>) {
  return (
    <DataTable
      label="Actions"
      columns={COLUMNS}
      rowLines={2}
      state={state}
      busy={{ active: busy, label: 'Loading Actions…' }}
    >
      {branches.map((branch) => {
        const open = !collapsed.has(branch.key);
        return (
          <Fragment key={branch.key}>
            <HeaderRow
              id={branchAnchor(branch.key)}
              label={branch.label}
              count={branch.count}
              open={open}
              onToggle={() => onToggle(branch.key)}
              mark={
                branch.blocking ? (
                  <StatusMark variant="severity" value="critical">
                    Blocking
                  </StatusMark>
                ) : null
              }
            />
            {open
              ? branch.categories.map((category) => {
                  const key = `${branch.key}/${category.label}`;
                  return (
                    <CategoryRows
                      key={key}
                      category={category}
                      open={!collapsed.has(key)}
                      onToggle={() => onToggle(key)}
                    />
                  );
                })
              : null}
          </Fragment>
        );
      })}
    </DataTable>
  );
}

/** A goal's, source's or category's header row: its name and count; it folds what it heads. */
function HeaderRow({
  id,
  label,
  count,
  open,
  nested = false,
  mark,
  onToggle,
}: Readonly<{
  id?: string;
  label: string;
  count: number;
  open: boolean;
  nested?: boolean;
  mark?: ReactNode;
  onToggle: () => void;
}>) {
  return (
    <TableRow id={id} className="scroll-mt-4">
      <TableCell colSpan={COLUMNS.length} nested={nested}>
        <Button
          variant="quiet"
          aria-expanded={open}
          aria-label={`${label}, ${formatCount(count)}${mark ? ', blocking' : ''}`}
          onClick={onToggle}
        >
          <Icon icon={open ? ChevronDown : ChevronRight} />
          <span className={nested ? 'text-ink' : textRole('emphasis', 'text-ink')}>{label}</span>
          <span className="text-ink-2 tabular-nums">{formatCount(count)}</span>
          {mark}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CategoryRows({
  category,
  open,
  onToggle,
}: Readonly<{ category: ActionListCategory; open: boolean; onToggle: () => void }>) {
  const [shown, setShown] = useState(ACTIONS_CATEGORY_ROWS);
  const rest = category.rows.length - shown;
  return (
    <>
      <HeaderRow
        nested
        label={category.label}
        count={category.rows.length}
        open={open}
        onToggle={onToggle}
      />
      {open
        ? category.rows.slice(0, shown).map((row) => <ListRow key={row.key} row={row} />)
        : null}
      {open && rest > 0 ? (
        <TableRow>
          <TableCell colSpan={COLUMNS.length} nested={2}>
            <Button
              variant="secondary"
              onClick={() => setShown(shown + ACTIONS_CATEGORY_ROWS)}
              aria-label={`Show ${formatCount(Math.min(rest, ACTIONS_CATEGORY_ROWS))} more in ${category.label}`}
            >
              Show {formatCount(Math.min(rest, ACTIONS_CATEGORY_ROWS))} more
            </Button>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** What a row says: its title, where it leads, one muted line, and its priority mark. */
function rowFace(row: ActionListRow): {
  title: string;
  tooltip: string;
  href: string;
  caption: string;
  mark: ReactNode;
} {
  switch (row.kind) {
    case 'issue': {
      const { issue, fix } = row;
      const reach = isSiteLevelRule(issue.rule_id)
        ? 'Whole site'
        : pluralCount(issue.affected_url_count, 'page');
      const title = issueTitle(issue);
      return {
        title,
        tooltip: title,
        href: issueHref(row.section, issue.group_id),
        caption: fix && fix.fixed_url_count > 0 ? `${reach} · ${fixedLabel(fix)}` : reach,
        mark: <IssueSeverityMark issue={issue} />,
      };
    }
    case 'action': {
      const { action } = row;
      return {
        title: actionTarget(action),
        tooltip: readableUrl(action.target_label),
        href: `/actions/${action.id}`,
        caption: [
          approachLabel(action.approach),
          pluralCount(action.member_count, 'finding'),
          action.origin === 'agent' ? 'From agent work' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        mark: <ActionPriorityBadge band={action.priority_band} />,
      };
    }
    default: {
      const unreachable: never = row;
      return unreachable;
    }
  }
}

/**
 * One row. The whole row opens its destination (an issue on Issues, an Action
 * on its page); the title link inside it is the same destination for the
 * keyboard and a screen reader.
 */
function ListRow({ row }: Readonly<{ row: ActionListRow }>) {
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const face = rowFace(row);
  const open = (event: MouseEvent<HTMLTableRowElement>) => {
    // The link and any control in the row handle their own press.
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    navigate(projectHref(face.href));
  };
  return (
    <TableRow onClick={open} className="cursor-pointer">
      {/* Two steps in: under its category, under its goal. */}
      <TableCell nested={2}>
        <Stack gap="tight" className="min-w-0">
          <ClampText rowTitle tooltip={face.tooltip}>
            <TextLink href={face.href} text="body" underline="hover">
              {face.title}
            </TextLink>
          </ClampText>
          <ClampText className={textRole('caption')}>{face.caption}</ClampText>
        </Stack>
      </TableCell>
      <TableCell>{face.mark}</TableCell>
      <TableCell className={textRole('caption')}>{rowSourceLabel(row)}</TableCell>
    </TableRow>
  );
}
