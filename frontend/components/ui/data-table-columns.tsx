import { useEffect, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { HintedTableHead, SortableTableHead } from '@/components/ui/table-heads';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';

/**
 * A column's width, by what the column holds — never a number a page picks:
 * spacing steps, or what is left (`flex`). The table is laid out fixed from
 * these, so paging, filtering or a long value never moves a column. `flex`
 * takes what the others leave; give it to the one text column that should
 * absorb the width, so no figure column grows past its role.
 */
const COLUMN_WIDTH = {
  flex: { kind: 'rest' },
  /**
   * As `flex`, for text read whole (a prompt): low-priority columns hide
   * before it narrows under these steps; the table scrolls only under `flex`'s floor.
   */
  reading: { kind: 'rest', steps: 86 },
  /** A row's ordinal on the page (#, rank). */
  index: { kind: 'steps', steps: 12 },
  /**
   * A count, a rate or a short figure ("100.0%", "+12.3 pp", "99,999") with
   * its padding; a longer header widens it (`labelFloor`), so spare width
   * goes to the flexible column rather than past the figure.
   */
  figure: { kind: 'steps', steps: 24 },
  /** Up to three 16px marks and a "+n" count (the brands named, the sites cited). */
  marks: { kind: 'steps', steps: 26 },
  /** As `figure`, for a header of three words that wraps to two lines ("Owned citation rate"). */
  shortMetric: { kind: 'steps', steps: 28 },
  /**
   * A figure whose header names its unit ("AI referral sessions", "Longest
   * receipt gap"): the figure role is too narrow for the label.
   */
  metric: { kind: 'steps', steps: 40 },
  /** A status badge or a short label. */
  status: { kind: 'steps', steps: 32 },
  /** A category badge longer than a status ("Striking distance", a purpose). */
  category: { kind: 'steps', steps: 44 },
  /** A date or a date-time, in the mono data face ("Jan 1, 2026, 12:00 AM"). */
  date: { kind: 'steps', steps: 56 },
  /** A labelled date-time with its zone ("Accepted: Nov 15, 2026, 02:44 AM UTC"). */
  stamp: { kind: 'steps', steps: 68 },
  /** A second text column beside the flexible one (an engine, a role). */
  name: { kind: 'steps', steps: 56 },
  /** A row's trailing link or icon control. */
  action: { kind: 'steps', steps: 24 },
  /** A row's one labelled button, an icon and a word ("Review"). */
  button: { kind: 'steps', steps: 32 },
  /** One compact control under a one-word header ("Enabled", "Actions"). */
  control: { kind: 'steps', steps: 20 },
  /** A row's trailing buttons, up to two (`TableActionsCell`). */
  rowActions: { kind: 'steps', steps: 64 },
} as const satisfies Record<
  string,
  { kind: 'rest'; steps?: number } | { kind: 'steps'; steps: number }
>;

/** The select-all checkbox column, in spacing steps. */
const SELECT_STEPS = 10;

type DataTableColumnWidth = keyof typeof COLUMN_WIDTH;

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
   * `low`: a column the table hides, last one first, while the column
   * floors do not fit the frame, so the table fits instead of scrolling.
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

/** Whether the column takes what the fixed columns leave. */
export function isFlexible(column: DataTableColumn): boolean {
  return COLUMN_WIDTH[widthOf(column)].kind === 'rest';
}

const alignOf = (column: DataTableColumn) => KIND[columnKind(column)].align;

/**
 * Whether each column opens on a gutter: a start-aligned column straight after
 * an end-aligned one, whose values would otherwise meet across the padding.
 */
function gutters(columns: readonly DataTableColumn[]): boolean[] {
  return columns.map(
    (column, index) =>
      index > 0 && alignOf(column) === 'start' && alignOf(columns[index - 1]!) === 'end',
  );
}

/**
 * The table's column map for the cell rules in data-table.css: the 1-based
 * positions of the end-aligned, start-aligned and tabular columns, and of the
 * shown columns that open on a gutter, the selection column counted, so every
 * cell follows its column's kind whatever the page passed to the cell.
 */
export function columnLayout({
  columns,
  shown,
  selection,
}: Readonly<{
  columns: readonly DataTableColumn[];
  shown: readonly DataTableColumn[];
  selection: boolean;
}>): Readonly<{
  'data-end-cols': string;
  'data-start-cols': string;
  'data-tabular-cols': string;
  'data-gutter-cols': string;
}> {
  const offset = selection ? 2 : 1;
  const position = (column: DataTableColumn) => columns.indexOf(column) + offset;
  const at = (test: (spec: KindSpec) => boolean) =>
    columns
      .flatMap((column) => (test(KIND[columnKind(column)]) ? [position(column)] : []))
      .join(' ');
  const gutter = gutters(shown);
  return {
    'data-end-cols': at((spec) => spec.align === 'end'),
    'data-start-cols': at((spec) => spec.align === 'start'),
    'data-tabular-cols': at((spec) => spec.tabular),
    'data-gutter-cols': shown
      .flatMap((column, index) => (gutter[index] ? [position(column)] : []))
      .join(' '),
  };
}

/** Column sets already warned about, so a table re-rendering warns once. */
const warnedColumnSets = new Set<string>();

/**
 * Development only: a table whose every column is a fixed role cuts its text
 * while the fixed columns leave width unused. Give the text column `flex`
 * (the default).
 */
export function useFlexibleColumnCheck({
  columns,
  title,
  label,
}: Readonly<{ columns: readonly DataTableColumn[]; title?: string; label?: string }>) {
  useEffect(() => {
    if (!import.meta.env?.DEV) return;
    if (columns.some(isFlexible)) return;
    const name = title ?? label ?? columns.map((column) => column.label).join(', ');
    const widths = columns.map((column) => `${column.key}:${column.width}`).join(',');
    const signature = `${name}|${widths}`;
    if (warnedColumnSets.has(signature)) return;
    warnedColumnSets.add(signature);
    console.warn(
      `DataTable "${name}" has no flexible column (width "flex"): its text truncates while its fixed columns leave space unused.`,
    );
  }, [columns, title, label]);
}

function steps(count: number) {
  return `calc(var(--spacing) * ${count})`;
}

/** A head label's width per character: the caption face averages under 0.6em a glyph. */
const HEAD_CHAR_EM = 0.6;
/** A sort glyph or an order mark after the label: 4 apart, 12 wide. */
const HEAD_MARK_PX = 16;
/** A cell's inline padding: 12 a side, 16 at the table's first and last edge. */
const CELL_PAD_PX = 12;
const EDGE_PAD_PX = 16;
/** The extra start padding of a column that opens on a gutter (`gutters`), as in data-table.css. */
const GUTTER_PX = 12;
/** A date-time on one line ("Sep 30, 2026, 12:59 PM") with its padding: dates never cut. */
const DATE_FLOOR_STEPS = 48;

type ColumnEdge = Readonly<{ first: boolean; last: boolean; gutter: boolean }>;

/** The head label (or its sublabel) on one line in `caption-strong`, with its glyph and padding. */
function labelFloor(column: DataTableColumn, edge: ColumnEdge): string | null {
  if (column.hideLabel || columnKind(column) === 'actions') return null;
  const chars = Math.max(column.label.length, column.sublabel?.length ?? 0);
  const mark = column.sort || column.order ? HEAD_MARK_PX : 0;
  const pad = (edge.first ? EDGE_PAD_PX : CELL_PAD_PX) + (edge.last ? EDGE_PAD_PX : CELL_PAD_PX);
  return `calc(${chars} * ${HEAD_CHAR_EM} * var(--text-caption) + ${mark + pad}px)`;
}

/**
 * The narrowest a column may be: its role's steps (a flexible column the
 * identity minimum), a date's full width, and never less than its head label.
 */
function columnFloor(column: DataTableColumn, edge: ColumnEdge): string {
  const role = COLUMN_WIDTH[widthOf(column)];
  const parts = [role.kind === 'steps' ? steps(role.steps) : 'var(--data-table-identity-min)'];
  if (columnKind(column) === 'date') parts.push(steps(DATE_FLOOR_STEPS));
  const label = labelFloor(column, edge);
  if (label) parts.push(label);
  const floor = `max(${parts.join(', ')})`;
  return edge.gutter ? `calc(${floor} + ${GUTTER_PX}px)` : floor;
}

/** The width the low-priority fit keeps for a column: a `reading` column's reading width, else its floor. */
export function fitFloor(column: DataTableColumn, edge: ColumnEdge): string {
  const role = COLUMN_WIDTH[widthOf(column)];
  const floor = columnFloor(column, edge);
  return role.kind === 'rest' && 'steps' in role ? `max(${floor}, ${steps(role.steps)})` : floor;
}

/** Each shown column with its edge: the select column, when present, is the first edge. */
export function withEdges(columns: readonly DataTableColumn[], selection: boolean) {
  const gutter = gutters(columns);
  return columns.map((column, index) => ({
    column,
    edge: {
      first: !selection && index === 0,
      last: index === columns.length - 1,
      gutter: gutter[index] ?? false,
    },
  }));
}

/** A column's `col` width: a fixed role at its floor, or what is left. */
function columnWidth(column: DataTableColumn, edge: ColumnEdge): string | undefined {
  return isFlexible(column) ? undefined : columnFloor(column, edge);
}

/**
 * The narrowest the table may be so that no column is squeezed: the sum of
 * the column floors (`columnFloor`) and the select column; below it the frame
 * scrolls sideways with the identity column pinned. The narrow layout leaves
 * out `desktopOnly` columns.
 */
export function columnsMinWidth({
  columns,
  selection,
  desktop,
}: Readonly<{
  columns: readonly DataTableColumn[];
  selection: boolean;
  desktop: boolean;
}>): string {
  const shown = columns.filter((column) => desktop || !column.desktopOnly);
  const fixed = selection ? [steps(SELECT_STEPS)] : [];
  const rest: string[] = [];
  for (const { column, edge } of withEdges(shown, selection)) {
    (isFlexible(column) ? rest : fixed).push(columnFloor(column, edge));
  }
  // A fixed layout splits what is left evenly, so each flexible column needs the widest floor.
  const restMin = rest.length > 0 ? `${rest.length} * max(${rest.join(', ')})` : '0px';
  return `calc(${fixed.join(' + ') || '0px'} + ${restMin})`;
}

/**
 * The column widths and the header row, with the select-all column first.
 * The width is a custom property so the narrow layout (globals.css) can give
 * the identity column the rest and collapse a `desktopOnly` column. A hidden
 * low-priority column has no `col`; its head and cells hide by position
 * (`useFittedColumns`), so the shown cells meet the shown `col`s in order.
 */
export function DataTableColumns({
  columns,
  shown,
  selection,
}: Readonly<{
  columns: readonly DataTableColumn[];
  shown: readonly DataTableColumn[];
  selection?: DataTableSelection;
}>) {
  return (
    <>
      <colgroup>
        {selection ? <col style={colWidth(steps(SELECT_STEPS), steps(SELECT_STEPS))} /> : null}
        {withEdges(shown, Boolean(selection)).map(({ column, edge }, index) => (
          <col
            key={column.key}
            style={colWidth(columnWidth(column, edge), columnFloor(column, edge))}
            data-identity-col={index === 0 || undefined}
            data-desktop-only={column.desktopOnly || undefined}
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

/** The select-all column's width. */
export const SELECT_WIDTH = steps(SELECT_STEPS);

const colWidth = (width: string | undefined, floor: string) =>
  ({ '--col-width': width, '--col-floor': floor }) as CSSProperties;

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
  if (column.sort) {
    return (
      <SortableTableHead
        label={column.label}
        numeric={numeric}
        sublabel={column.sublabel}
        hint={column.hint}
        desktopOnly={column.desktopOnly}
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
      />
    );
  }
  // The column's floor fits its label on one line; wrapping is the fallback
  // for a face wider than the floor's estimate, never an overlap.
  const hidden = column.hideLabel || columnKind(column) === 'actions';
  return (
    <TableHead
      numeric={numeric}
      desktopOnly={column.desktopOnly}
      className="whitespace-normal"
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
