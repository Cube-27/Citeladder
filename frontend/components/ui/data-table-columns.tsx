import { useEffect } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { HintedTableHead, SortableTableHead } from '@/components/ui/table-heads';
import { TableHead, TableHeader, TableRow, WIDE_ONLY_CELL } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * A column's width, by what the column holds — never a number a page picks:
 * spacing steps, a share of the table (`lead`), or what is left (`flex`).
 * The table is laid out fixed from these, so paging, filtering or a long
 * value never moves a column. `flex` takes what the others leave; give it to
 * the one text column that should absorb the width.
 */
const COLUMN_WIDTH = {
  flex: { kind: 'rest' },
  /**
   * The record's identity (a source, a page) in a table whose other columns
   * are flexible figures: a quarter of the table, so the figures share the
   * rest evenly whatever the viewport.
   */
  lead: { kind: 'share', share: 0.25 },
  /** A row's ordinal on the page (#, rank). */
  index: { kind: 'steps', steps: 12 },
  /** A count, a rate or a short figure. */
  figure: { kind: 'steps', steps: 28 },
  /**
   * A short figure in a table that shares its row with another card, so its
   * name column keeps room: a one-word header ("Rank", "Visibility"), or a
   * short one that wraps to two lines ("Share of voice").
   */
  short: { kind: 'steps', steps: 24 },
  /** As `short`, for a header of three words that wraps to two lines ("Owned citation rate"). */
  shortMetric: { kind: 'steps', steps: 28 },
  /**
   * A figure whose header names its unit ("AI referral sessions", "Longest
   * receipt gap"): the figure role is too narrow for the label.
   */
  metric: { kind: 'steps', steps: 40 },
  /** A status badge or a short label. */
  status: { kind: 'steps', steps: 32 },
  /** A status badge and its short label on one line ("Medium · Web fundamentals"). */
  statusLabel: { kind: 'steps', steps: 64 },
  /** A category badge longer than a status ("Striking distance", a purpose). */
  category: { kind: 'steps', steps: 44 },
  /** A date or a date-time, in the mono data face ("Jan 1, 2026, 12:00 AM"). */
  date: { kind: 'steps', steps: 56 },
  /** A second text column beside the flexible one (an engine, a role). */
  name: { kind: 'steps', steps: 56 },
  /** A row's trailing link or icon control. */
  action: { kind: 'steps', steps: 24 },
  /** One compact control under a one-word header ("Enabled", "Actions"). */
  control: { kind: 'steps', steps: 20 },
  /** A row's trailing buttons, up to two (`TableActionsCell`). */
  rowActions: { kind: 'steps', steps: 64 },
} as const satisfies Record<
  string,
  { kind: 'rest' } | { kind: 'share'; share: number } | { kind: 'steps'; steps: number }
>;

/** The select-all checkbox column, in spacing steps. */
const SELECT_STEPS = 10;

type DataTableColumnWidth = keyof typeof COLUMN_WIDTH;

/** The widths that grow with the table: the flexible text column and the lead. */
const FLEXIBLE_WIDTHS: ReadonlySet<DataTableColumnWidth> = new Set(['flex', 'lead']);

/**
 * What a column holds. The kind sets the head and every cell of the column
 * together: alignment, face, default width and how a long value is cut, so a
 * head can never disagree with its column.
 */
type ColumnKind = 'identity' | 'text' | 'number' | 'date' | 'status' | 'url' | 'actions';

type KindSpec = Readonly<{ align: 'start' | 'end'; tabular: boolean; width: DataTableColumnWidth }>;

const KIND = {
  identity: { align: 'start', tabular: false, width: 'flex' },
  text: { align: 'start', tabular: false, width: 'flex' },
  number: { align: 'end', tabular: true, width: 'figure' },
  date: { align: 'start', tabular: true, width: 'date' },
  status: { align: 'start', tabular: false, width: 'status' },
  url: { align: 'start', tabular: false, width: 'flex' },
  actions: { align: 'end', tabular: false, width: 'rowActions' },
} as const satisfies Record<ColumnKind, KindSpec>;

export type DataTableColumn = Readonly<{
  key: string;
  label: string;
  /** What the column holds; decides the head's and the cells' alignment and face. Defaults to `text`. */
  kind?: ColumnKind;
  /** Defaults to the kind's width. */
  width?: DataTableColumnWidth;
  /** Keep the header for assistive technology only. An `actions` column always does. */
  hideLabel?: boolean;
  /**
   * `low`: a column the table can lose to scrolling. Priority columns come
   * first and fit at 982 in the host template; low ones come last.
   */
  priority?: 'low';
  /** A sortable column: the header becomes the sort button. */
  sort?: Readonly<{ active: boolean; descending: boolean; onSort: () => void }>;
  /** The fixed order the rows come in, by this column (not sortable): its mark and `aria-sort`. */
  order?: 'ascending' | 'descending';
  /** A qualifier under the label, e.g. the comparison window. */
  sublabel?: string;
  /** The column's shared caveat, behind a tooltip on the header. */
  hint?: string;
  /**
   * The narrow layout drops this column; the page's cells for it pass
   * `desktopOnly` to `TableCell` too.
   */
  desktopOnly?: boolean;
  /**
   * Dropped below 600, where the row shows the value in its identity cell;
   * the page's cells for it take `WIDE_ONLY_CELL`.
   */
  wideOnly?: boolean;
}>;

/**
 * Row selection: a leading checkbox column whose header box selects every
 * row on the page. Each row's first cell is a `TableSelectCell`.
 */
export type DataTableSelection = Readonly<{
  /** Every row selected, some, or none. */
  all: boolean | 'indeterminate';
  onAllChange: (checked: boolean) => void;
  /** What the rows are, for the header box's name: "Select all {noun}". */
  noun: string;
}>;

function columnKind(column: DataTableColumn): ColumnKind {
  return column.kind ?? 'text';
}

function widthOf(column: DataTableColumn): DataTableColumnWidth {
  return column.width ?? KIND[columnKind(column)].width;
}

/**
 * The table's column map for the cell rules in globals.css ("r3 data"): the
 * 1-based positions of the end-aligned, start-aligned and tabular columns,
 * the selection column counted, so every cell follows its column's kind
 * whatever the page passed to the cell.
 */
export function columnLayout(
  columns: readonly DataTableColumn[],
  selection: boolean,
): Readonly<{ 'data-end-cols': string; 'data-start-cols': string; 'data-tabular-cols': string }> {
  const offset = selection ? 2 : 1;
  const at = (test: (spec: KindSpec) => boolean) =>
    columns
      .flatMap((column, index) => (test(KIND[columnKind(column)]) ? [index + offset] : []))
      .join(' ');
  return {
    'data-end-cols': at((spec) => spec.align === 'end'),
    'data-start-cols': at((spec) => spec.align === 'start'),
    'data-tabular-cols': at((spec) => spec.tabular),
  };
}

/** Column sets already warned about, so a table re-rendering warns once. */
const warnedColumnSets = new Set<string>();

/**
 * Development only: a table whose every column is a fixed role cuts its text
 * while the fixed columns leave width unused. Give the text column `flex`
 * (the default) or `lead`.
 */
export function useFlexibleColumnCheck({
  columns,
  title,
  label,
}: Readonly<{ columns: readonly DataTableColumn[]; title?: string; label?: string }>) {
  useEffect(() => {
    if (!import.meta.env?.DEV) return;
    const firstLow = columns.findIndex((column) => column.priority === 'low');
    if (firstLow !== -1 && columns.slice(firstLow).some((column) => column.priority !== 'low')) {
      console.warn(
        `DataTable "${title ?? label ?? 'Table'}" puts a priority column after a low-priority one: low-priority columns come last.`,
      );
    }
    if (columns.some((column) => FLEXIBLE_WIDTHS.has(widthOf(column)))) return;
    const name = title ?? label ?? columns.map((column) => column.label).join(', ');
    const widths = columns.map((column) => `${column.key}:${column.width}`).join(',');
    const signature = `${name}|${widths}`;
    if (warnedColumnSets.has(signature)) return;
    warnedColumnSets.add(signature);
    console.warn(
      `DataTable "${name}" has no flexible column (width "flex" or "lead"): its text truncates while its fixed columns leave space unused.`,
    );
  }, [columns, title, label]);
}

function steps(count: number) {
  return `calc(var(--spacing) * ${count})`;
}

function columnWidth(width: DataTableColumnWidth): string | undefined {
  const role = COLUMN_WIDTH[width];
  switch (role.kind) {
    case 'rest':
      return undefined;
    case 'share':
      return `${role.share * 100}%`;
    case 'steps':
      return steps(role.steps);
    default: {
      const unknownRole: never = role;
      return unknownRole;
    }
  }
}

/**
 * The narrowest the table may be so that no column is squeezed: every fixed
 * column at its width and every flexible one (`flex`, `lead`) at least the
 * identity minimum, which keeps a row's name readable; below it the frame
 * scrolls sideways with the first column pinned. `floor` is the page's own
 * minimum (`minWidth`). The narrow layout leaves out `desktopOnly` columns.
 */
export function columnsMinWidth({
  columns,
  selection,
  floor,
  desktop,
}: Readonly<{
  columns: readonly DataTableColumn[];
  selection: boolean;
  floor: string | undefined;
  desktop: boolean;
}>): string {
  let fixedSteps = selection ? SELECT_STEPS : 0;
  let rest = 0;
  let share = 0;
  for (const column of columns) {
    if (column.desktopOnly && !desktop) continue;
    const role = COLUMN_WIDTH[widthOf(column)];
    if (role.kind === 'steps') fixedSteps += role.steps;
    else if (role.kind === 'share') share += role.share;
    else rest += 1;
  }
  const parts = [
    `calc((${steps(fixedSteps)} + ${rest} * var(--data-table-identity-min)) / ${1 - share})`,
  ];
  // A share column is a share of the table: the table is wide enough that the share holds the minimum.
  if (share > 0) parts.push(`calc(var(--data-table-identity-min) / ${share})`);
  if (floor) parts.push(floor);
  return `max(${parts.join(', ')})`;
}

/** The column widths and the header row, with the select-all column first. */
export function DataTableColumns({
  columns,
  selection,
}: Readonly<{ columns: readonly DataTableColumn[]; selection?: DataTableSelection }>) {
  return (
    <>
      <colgroup>
        {selection ? <col style={{ width: steps(SELECT_STEPS) }} /> : null}
        {columns.map((column) => (
          <col
            key={column.key}
            style={{ width: columnWidth(widthOf(column)) }}
            className={cn(
              column.desktopOnly && 'hidden desktop:table-column',
              column.wideOnly && 'hidden min-[600px]:table-column',
            )}
          />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          {selection ? <SelectAllHead selection={selection} /> : null}
          {columns.map((column) => (
            <ColumnHead key={column.key} column={column} />
          ))}
        </TableRow>
      </TableHeader>
    </>
  );
}

function SelectAllHead({ selection }: Readonly<{ selection: DataTableSelection }>) {
  return (
    <TableHead>
      <Checkbox
        aria-label={`Select all ${selection.noun}`}
        checked={selection.all}
        onCheckedChange={(checked) => selection.onAllChange(checked === true)}
      />
    </TableHead>
  );
}

function ColumnHead({ column }: Readonly<{ column: DataTableColumn }>) {
  const numeric = columnKind(column) === 'number';
  const wide = column.wideOnly ? WIDE_ONLY_CELL : undefined;
  if (column.sort) {
    return (
      <SortableTableHead
        label={column.label}
        numeric={numeric}
        sublabel={column.sublabel}
        hint={column.hint}
        desktopOnly={column.desktopOnly}
        className={wide}
        {...column.sort}
      />
    );
  }
  if (column.hint) {
    return (
      <HintedTableHead
        label={column.label}
        hint={column.hint}
        numeric={numeric}
        desktopOnly={column.desktopOnly}
        className={wide}
      />
    );
  }
  // The columns are fixed, so a label longer than its role wraps under
  // itself instead of painting over the next header.
  const hidden = column.hideLabel || columnKind(column) === 'actions';
  return (
    <TableHead
      numeric={numeric}
      desktopOnly={column.desktopOnly}
      className={cn('whitespace-normal', wide)}
      aria-sort={column.order}
    >
      {hidden ? <span className="sr-only">{column.label || 'Actions'}</span> : column.label}
      {column.order ? <OrderMark order={column.order} /> : null}
      {column.sublabel ? (
        <span className={textRole('caption', 'block truncate')} title={column.sublabel}>
          {column.sublabel}
        </span>
      ) : null}
    </TableHead>
  );
}

/** The fixed order's arrow after the label, in ink like an active sort. */
function OrderMark({ order }: Readonly<{ order: 'ascending' | 'descending' }>) {
  const Arrow = order === 'descending' ? ArrowDown : ArrowUp;
  return <Arrow className="ms-1 inline size-3 align-[-1px]" aria-hidden />;
}
