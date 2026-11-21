import { useEffect } from 'react';

import { ArrowDown, ArrowUp } from '@/lib/icons';
import { Checkbox } from '@/components/ui/checkbox';
import { HintedTableHead, SortableTableHead } from '@/components/ui/table-heads';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';

/**
 * A column's width by what it holds, never a number a page picks. `flex`
 * columns share what the others leave (normally the first column alone);
 * every other role hugs its content, at least its role's floor in spacing
 * steps, so no gap opens between columns (AR-4) and a short page barely moves
 * a column.
 */
const COLUMN_WIDTH = {
  flex: { kind: 'rest' },
  /** As `flex`, for text read whole (a prompt): low-priority columns hide before it narrows under these steps. */
  reading: { kind: 'rest', steps: 86 },
  /** A row's ordinal on the page (#, rank). */
  index: { kind: 'steps', steps: 10 },
  /** A count, a rate or a short figure ("100.0%", "+12.3 pp", "99,999"). */
  figure: { kind: 'steps', steps: 16 },
  /** Up to three 16px marks and a "+n" count (the brands named, the sites cited). */
  marks: { kind: 'steps', steps: 24 },
  /** As `figure`, under a header of three words. */
  shortMetric: { kind: 'steps', steps: 16 },
  /** A figure whose header names its unit ("AI referral sessions"). */
  metric: { kind: 'steps', steps: 16 },
  /** A status badge or a short label. */
  status: { kind: 'steps', steps: 20 },
  /** A category badge longer than a status ("Striking distance", a purpose). */
  category: { kind: 'steps', steps: 24 },
  /** A date or a date-time, in tabular numerals. */
  date: { kind: 'steps', steps: 24 },
  /** A labelled date-time with its zone. */
  stamp: { kind: 'steps', steps: 24 },
  /** A second text column beside the flexible one (an engine, a role). */
  name: { kind: 'steps', steps: 24 },
  /** A row's trailing link or icon control. */
  action: { kind: 'steps', steps: 10 },
  /** A row's one labelled button, an icon and a word ("Review"). */
  button: { kind: 'steps', steps: 20 },
  /** One compact control under a one-word header ("Enabled", "Actions"). */
  control: { kind: 'steps', steps: 10 },
  /** A row's trailing buttons, up to two (`TableActionsCell`). */
  rowActions: { kind: 'steps', steps: 20 },
} as const satisfies Record<
  string,
  { kind: 'rest'; steps?: number } | { kind: 'steps'; steps: number }
>;

/** The select-all checkbox column, in spacing steps. */
const SELECT_STEPS = 10;

type DataTableColumnWidth = keyof typeof COLUMN_WIDTH;

/**
 * What a column holds. The kind sets the head and every cell of the column
 * together: alignment, face, default width, so a head can never disagree
 * with its column.
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

/** Whether the column takes what the hugging columns leave. */
function isFlexible(column: DataTableColumn): boolean {
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

/** The extra start padding of a column that opens on a gutter. */
const GUTTER_PX = 12;

/**
 * The table's column rules, scoped to one frame: every head and cell of a
 * column at its kind's alignment and face, the flexible columns sharing the
 * spare width (cut to it, never below the identity minimum), every other
 * column hugging its content above its floor, and the low-priority columns
 * the fit hides. A row with a spanning cell (a state, the reserved space, a
 * full-row note) keeps its cells; it spans the shown columns (`useShownSpan`).
 * When the trailing columns hide, the last shown cell takes the end inset.
 */
export function columnRules({
  scope,
  columns,
  hidden,
  selection,
}: Readonly<{
  scope: string;
  columns: readonly DataTableColumn[];
  hidden: readonly number[];
  selection: boolean;
}>): string {
  const offset = selection ? 2 : 1;
  const at = (position: number, rows = 'tr:not([data-table-state])') =>
    `[data-table-scope="${scope}"] ${rows} > :nth-child(${position})`;
  const hiddenSet = new Set(hidden);
  const shown = columns.filter((_, index) => !hiddenSet.has(index));
  const shownGutters = gutters(shown);
  const gutter = new Set(shown.filter((_, index) => shownGutters[index]));
  const share = `${(100 / Math.max(1, shown.filter(isFlexible).length)).toFixed(3)}%`;
  // The select box column is exactly its width, so the pinned identity cell's offset matches it.
  const select = `width:${SELECT_WIDTH};min-width:${SELECT_WIDTH};padding-inline-end:8px`;
  const rules = selection ? [`${at(1)}{${select}}`] : [];
  columns.forEach((column, index) => {
    const cell = at(index + offset);
    const kind = KIND[columnKind(column)];
    const role = COLUMN_WIDTH[widthOf(column)];
    const pad = gutter.has(column)
      ? `padding-inline-start:calc(var(--table-cell-padding-x) + ${GUTTER_PX}px);`
      : '';
    const size =
      role.kind === 'rest'
        ? `width:${share};max-width:0;min-width:var(--data-table-identity-min);`
        : `width:1px;white-space:nowrap;min-width:${steps(role.steps)};`;
    rules.push(`${cell}{text-align:${kind.align};${size}${pad}}`);
    if (kind.tabular)
      rules.push(
        `${at(index + offset, 'tbody > tr:not([data-table-state])')}{font-variant-numeric:tabular-nums}`,
      );
  });
  if (hidden.length) {
    const cells = hidden.map((index) => at(index + offset, 'tr:not(:has(> [colspan]))'));
    rules.push(`${cells.join(',')}{display:none}`);
    const last = shown.at(-1);
    if (last && last !== columns.at(-1))
      rules.push(`${at(columns.indexOf(last) + offset)}{padding-inline-end:16px}`);
  }
  return rules.join('');
}

/** Column sets already warned about, so a table re-rendering warns once. */
const warnedColumnSets = new Set<string>();

/**
 * Development only: a table whose every column hugs leaves its spare width
 * spread over figures. Give the text column `flex` (the default).
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
      `DataTable "${name}" has no flexible column (width "flex"): its spare width spreads over its figures.`,
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
/** A date-time on one line ("Sep 30, 2026, 12:59 PM") with its padding. */
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
 * The width the low-priority fit expects a column to take: its role's floor
 * (a flexible column the identity minimum, a `reading` column its reading
 * width), a date's full width, and never less than its head label.
 */
export function fitFloor(column: DataTableColumn, edge: ColumnEdge): string {
  const role = COLUMN_WIDTH[widthOf(column)];
  const parts = [role.kind === 'steps' ? steps(role.steps) : 'var(--data-table-identity-min)'];
  if (role.kind === 'rest' && 'steps' in role) parts.push(steps(role.steps));
  if (columnKind(column) === 'date') parts.push(steps(DATE_FLOOR_STEPS));
  const label = labelFloor(column, edge);
  if (label) parts.push(label);
  const floor = `max(${parts.join(', ')})`;
  return edge.gutter ? `calc(${floor} + ${GUTTER_PX}px)` : floor;
}

/** Each column with its edge: the select column, when present, is the first edge. */
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

/** The select-all column's width. */
export const SELECT_WIDTH = steps(SELECT_STEPS);

/** The header row, with the select-all column first. */
export function DataTableColumns({
  columns,
  selection,
}: Readonly<{ columns: readonly DataTableColumn[]; selection?: DataTableSelection }>) {
  return (
    <TableHeader>
      <TableRow>
        {selection ? <SelectAllHead selection={selection} /> : null}
        {columns.map((column) => (
          <ColumnHead key={column.key} column={column} />
        ))}
      </TableRow>
    </TableHeader>
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
  const hidden = column.hideLabel || columnKind(column) === 'actions';
  return (
    <TableHead numeric={numeric} desktopOnly={column.desktopOnly} aria-sort={column.order}>
      {hidden ? <span className="sr-only">{column.label || 'Actions'}</span> : column.label}
      {column.order ? <OrderMark order={column.order} /> : null}
      {column.sublabel ? (
        <span className={textRole('caption', 'block')}>{column.sublabel}</span>
      ) : null}
    </TableHead>
  );
}

/** The fixed order's arrow after the label, in ink like an active sort. */
function OrderMark({ order }: Readonly<{ order: 'ascending' | 'descending' }>) {
  const Arrow = order === 'descending' ? ArrowDown : ArrowUp;
  return <Arrow className="ms-1 inline size-3 align-[-1px]" aria-hidden />;
}
