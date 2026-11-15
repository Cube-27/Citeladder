import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import type { ScrollRegionProps } from '@/components/ui/scroll-edges';
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayTimestamp, readableUrl, urlCellText } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Table — the app's data table:
 *  - the head is a `well` band of caption-strong column heads (`scope="col"`),
 *    `ink` while sorted
 *  - `table-row-height` rows (40 in the app) with `rule` lines between them;
 *    every row tints on hover as one piece, pinned cells included
 *    (globals.css "r3 data"); `highlight` marks your own row (one row per
 *    table, never for emphasis); no zebra stripes, no column rules
 *  - every cell is one line: `ClampText` cuts a long value with an ellipsis
 *    and puts the whole of it in a tooltip, so no row is an outlier
 *  - numeric columns align right in tabular figures, under a right-aligned
 *    header, so digits line up place by place; text columns stay left
 *  - `fixed` takes column widths from the header cells, never from the rows
 *    shown, so paging, sorting and loading never move the columns
 * The wrapper scrolls, so the sticky header pins on vertical scroll. On its
 * own in the app it is a card; inside a container or a DataTable it is plain.
 */
const tableHeadClasses = 'text-caption text-ink-2 whitespace-nowrap';
const TABLE_MIN_WIDTH = {
  sm: 'min-w-[var(--table-min-width-sm)]',
  md: 'min-w-[var(--table-min-width-md)]',
  lg: 'min-w-[var(--table-min-width-lg)]',
  xl: 'min-w-[var(--table-min-width-xl)]',
} as const;

export type TableMinWidth = keyof typeof TABLE_MIN_WIDTH;

export function Table({
  children,
  className,
  minWidth,
  fixed = false,
  wrapperClassName,
  wrapperRef,
  region,
  ariaLabel,
  ariaLabelledBy,
}: Readonly<{
  children: ReactNode;
  className?: string;
  /** The table's accessible name, when no visible heading names it. */
  ariaLabel?: string;
  /** The visible heading that names the table. */
  ariaLabelledBy?: string;
  /** Below this width the table scrolls in its frame instead of squeezing. */
  minWidth?: TableMinWidth;
  /**
   * Column widths come from the header cells' widths, never from the rows
   * shown, so paging or filtering cannot shift the columns. Give every
   * header but one (the flexible text column) an explicit width.
   */
  fixed?: boolean;
  wrapperClassName?: string;
  wrapperRef?: Ref<HTMLDivElement>;
  /** The scrolling frame's cue hook and, while it scrolls, its name and tab stop (`ScrollFrame`). */
  region?: ScrollRegionProps;
}>) {
  return (
    <div
      {...region}
      ref={wrapperRef}
      className={cn(
        'table-frame bg-surface relative w-full max-w-full min-w-0 overflow-auto rounded-sheet',
        wrapperClassName,
      )}
    >
      <table
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          'text-body-sm text-ink w-full border-separate border-spacing-0',
          fixed && 'table-fixed',
          minWidth && TABLE_MIN_WIDTH[minWidth],
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  children,
  className,
  ...props
}: Readonly<HTMLAttributes<HTMLTableSectionElement>>) {
  return (
    <thead {...props} className={cn(className)}>
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className,
  ...props
}: Readonly<HTMLAttributes<HTMLTableSectionElement>>) {
  return (
    <tbody {...props} className={cn(className)}>
      {children}
    </tbody>
  );
}

export function TableRow({
  children,
  className,
  highlight,
  ...props
}: Readonly<HTMLAttributes<HTMLTableRowElement> & { highlight?: boolean }>) {
  // The app tints every row's cells on hover and selection (globals.css "r2
  // data"); the website keeps its row-level tint on pressable rows.
  const pressable = props.onClick !== undefined;
  return (
    <tr
      {...props}
      className={cn(
        'h-[var(--table-row-height)] transition-colors duration-[var(--motion-fast)]',
        // Hover and selected are two states: a selected row takes the
        // selected overlay and no hover; the tracked brand's own row takes
        // `accent-soft`, and hover never changes it.
        pressable &&
          !highlight &&
          '[[data-public-surface]_&]:not-aria-selected:hover:overlay-hover',
        '[[data-public-surface]_&]:aria-selected:overlay-selected',
        // The website tints its brand row; the app marks yours with the accent rung (globals.css).
        highlight && '[[data-public-surface]_&]:bg-accent-wash',
        className,
      )}
      data-you={highlight || undefined}
    >
      {children}
    </tr>
  );
}

/**
 * Blank rows that hold a paged table at a full page's height, so a short last
 * page does not pull the pager up. Hidden from assistive technology. When
 * real rows are taller than the row floor, pass `spacer`: blank content laid
 * out like a real row's tallest cell, so a filler row matches its height.
 */
export function TableFillerRows({
  count,
  colSpan,
  spacer,
}: Readonly<{ count: number; colSpan: number; spacer?: ReactNode }>) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => (
    <tr // NOSONAR -- a blank filler row with no tabIndex or controls; nothing in it is focusable
      key={index}
      aria-hidden="true"
      className="h-[var(--table-row-height)]"
    >
      <TableCell colSpan={colSpan}>{spacer}</TableCell>
    </tr>
  ));
}

/**
 * A column the narrow layout drops: secondary figures a phone has no width
 * for. The header and every cell of the column carry it, so the column
 * disappears whole.
 */
const desktopOnlyClasses = 'hidden desktop:table-cell';

type CellOptions = { numeric?: boolean; desktopOnly?: boolean };

export function TableHead({
  children,
  className,
  numeric,
  desktopOnly,
  scope = 'col',
  ...props
}: Readonly<ThHTMLAttributes<HTMLTableCellElement> & CellOptions>) {
  return (
    <th
      scope={scope}
      {...props}
      className={cn(
        tableHeadClasses,
        'aria-[sort=ascending]:text-ink aria-[sort=descending]:text-ink',
        // The header is a square `surface-sunken` band, full-bleed like the
        // rows under it; its opaque fill keeps a sticky header over scrolled rows.
        'bg-well sticky top-0 z-10 h-[var(--table-header-height)] px-[var(--table-cell-padding-x)] text-left align-middle',
        numeric && 'tabular-nums text-right',
        desktopOnly && desktopOnlyClasses,
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Plain text content — the cells `TableCell` clamps on its own. */
function isPlainText(children: ReactNode) {
  if (typeof children === 'string' || typeof children === 'number') return true;
  return (
    Array.isArray(children) &&
    children.length > 0 &&
    children.every((part) => typeof part === 'string' || typeof part === 'number')
  );
}

/**
 * The lines a `TableCellLines` title may take: one by default; two only in a
 * `DataTable` of three-line rows (`rowLines={3}`).
 */
export const TableTitleLinesContext = createContext<1 | 2>(1);

/**
 * One shared observer for every cut text, so a table of hundreds of cells
 * costs one observer, not hundreds.
 */
const cutWatchers = new WeakMap<Element, () => void>();
let cutObserver: ResizeObserver | null = null;

function watchCut(node: Element, onChange: () => void) {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  cutObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) cutWatchers.get(entry.target)?.();
  });
  cutWatchers.set(node, onChange);
  cutObserver.observe(node);
  return () => {
    cutWatchers.delete(node);
    cutObserver?.unobserve(node);
  };
}

/**
 * Whether the text in `ref` is cut, kept current as its box resizes. A cut
 * text becomes a tab stop, so its tooltip is reachable by keyboard.
 */
const INTERACTIVE = 'a[href], button, [role="button"], [role="link"], [role="tab"], label';

function useCut(
  ref: RefObject<HTMLElement | null>,
  measure: (node: HTMLElement) => boolean = isTextCut,
) {
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Inside a link or button the control is the tab stop; the text never nests a second one.
    if (node.parentElement?.closest(INTERACTIVE)) return;
    const update = () => setCut(measure(node));
    update();
    return watchCut(node, update);
  }, [ref, measure]);
  return cut;
}

/**
 * TruncatedText — a long value (a URL, a title, an id) on one line, cut with
 * an ellipsis. When it is cut, the whole text is in a tooltip that opens on
 * hover and on keyboard focus, and selecting the text copies all of it.
 * Wrapping is for prose and a record's own page, never a row, a fact or a stat.
 *
 * `lines={2}` survives only for a `TableCellLines` title in a three-line row.
 * `tooltip` overrides the tooltip content, e.g. a full URL behind a path.
 */
export function ClampText({
  children,
  lines = 1,
  tooltip,
  className,
}: Readonly<{
  children: ReactNode;
  lines?: 1 | 2;
  tooltip?: ReactNode;
  className?: string;
}>) {
  const ref = useRef<HTMLSpanElement>(null);
  const cut = useCut(ref);
  // The full text as plain text: styled children (a title role, a caption)
  // would carry their own ink onto the tooltip sheet.
  const [fullText, setFullText] = useState('');
  const openWhenCut = (node: HTMLElement) => {
    if (!isTextCut(node)) return false;
    setFullText(node.textContent ?? '');
    return true;
  };
  return (
    <Tooltip content={tooltip ?? fullText} shouldOpen={openWhenCut}>
      <span
        ref={ref}
        data-truncated={cut || undefined}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a cut value is a tab stop so its full text (the tooltip) is reachable by keyboard.
        tabIndex={cut ? 0 : undefined}
        className={cn(
          'block min-w-0',
          lines === 1 ? 'truncate' : 'line-clamp-2',
          cut && 'rounded-mark',
          className,
        )}
      >
        {children}
      </span>
    </Tooltip>
  );
}

const cellClasses = ({ numeric, desktopOnly }: CellOptions) =>
  cn(
    // Padding 8 and 8: the row hairline is drawn inside the row (globals.css "r2 data").
    'text-body-sm text-ink px-[var(--table-cell-padding-x)] py-[var(--table-cell-padding-y)] text-left align-middle',
    // A value never wraps: "Not measured" split over two lines read as two values.
    // Tabular figures, so a right-aligned column lines up place by place.
    numeric && 'whitespace-nowrap text-right tabular-nums',
    desktopOnly && desktopOnlyClasses,
  );

/**
 * A missing figure (which renders the `Not measured` placeholder) reads muted;
 * a measured one keeps the cell's ink. A score is a figure, not a state, so it
 * never takes a band colour.
 */
export const mutedWhenMissing = (value: number | null) =>
  value === null ? 'text-ink-2' : undefined;

export function TableCell({
  children,
  className,
  numeric,
  desktopOnly,
  nested,
  ...props
}: Readonly<
  TdHTMLAttributes<HTMLTableCellElement> &
    CellOptions & {
      /** The first cell of a row grouped under a group-label row: inset one step. */
      nested?: boolean;
    }
>) {
  return (
    <td
      {...props}
      className={cn(
        cellClasses({ numeric, desktopOnly }),
        nested && 'ps-[calc(var(--table-cell-padding-x)+16px)]',
        className,
      )}
    >
      {!numeric && isPlainText(children) ? <ClampText>{children}</ClampText> : children}
    </td>
  );
}

/**
 * A value over one caption line (a query over its page), each cut to one line
 * with the rest in a tooltip. `title` inks the value as an item title; a blank
 * `secondary` (a non-breaking space) keeps a captionless row two lines tall.
 */
export function TableCellLines({
  primary,
  secondary,
  secondaryTooltip,
  title = false,
}: Readonly<{
  primary: ReactNode;
  secondary?: ReactNode;
  /** The caption's tooltip when it is cut, e.g. the full URL behind a path. */
  secondaryTooltip?: ReactNode;
  title?: boolean;
}>) {
  const titleLines = useContext(TableTitleLinesContext);
  return (
    // The title and its caption are one fact: 4 apart.
    <span data-cell-lines="" className="grid min-w-0 gap-1">
      <ClampText lines={titleLines} className={title ? textRole('body') : undefined}>
        {primary}
      </ClampText>
      {secondary ? (
        <ClampText lines={1} tooltip={secondaryTooltip} className={textRole('caption')}>
          {secondary}
        </ClampText>
      ) : null}
    </span>
  );
}

/** The word on your own row, the rare accent-coloured word. */
export function YouTag() {
  return <span className="type-label text-accent-text shrink-0">You</span>;
}

/** A row's trailing buttons, end-aligned at the button gap (`rowActions` column). */
export function TableActionsCell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <td className={cn(cellClasses({}), 'whitespace-nowrap')}>
      <span className="flex items-center justify-end gap-2">{children}</span>
    </td>
  );
}

/** A selectable row's first cell: its checkbox, named for the row ("Select …"). */
export function TableSelectCell({
  label,
  describedBy,
  checked,
  onCheckedChange,
  disabled,
}: Readonly<{
  label: string;
  /** The id of a fact the row shows (its status) that describes the box. */
  describedBy?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}>) {
  return (
    <td className={cellClasses({})}>
      <Checkbox
        aria-label={label}
        aria-describedby={describedBy}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
    </td>
  );
}

/**
 * The cell that names its row (`<th scope="row">`): a cell's geometry with
 * the item-title ink, so a row header reads as the row's title.
 */
export function TableRowHeader({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <th scope="row" className={cn(cellClasses({}), 'type-body', className)}>
      {isPlainText(children) ? <ClampText>{children}</ClampText> : children}
    </th>
  );
}

/**
 * A URL in a cell, on one line, without the origin its column shares
 * (`sharedOrigin`). When it must cut, it keeps the start of the path and its
 * tail and cuts the middle (`/blog/…/last-segment`), never down to the host
 * alone; the whole address is in the tooltip.
 */
export function UrlText({ url, origin = null }: Readonly<{ url: string; origin?: string | null }>) {
  const text = urlCellText(url, origin);
  const { head, tail } = splitUrlTail(text);
  const ref = useRef<HTMLSpanElement>(null);
  const cut = useCut(ref, anyPartCut);
  return (
    <Tooltip content={readableUrl(url)} shouldOpen={anyPartCut}>
      <span
        ref={ref}
        // The tail never shrinks, so the cut falls in the middle of the path.
        data-url-text=""
        data-truncated={cut || undefined}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a cut address is a tab stop so the whole of it (the tooltip) is reachable by keyboard.
        tabIndex={cut ? 0 : undefined}
        className="rounded-mark flex min-w-0 whitespace-nowrap"
      >
        {/* Read whole; drawn as a head that cuts and a tail that stays. */}
        <span className="sr-only">{text}</span>
        {head ? (
          <span aria-hidden className="min-w-0 truncate">
            {head}
          </span>
        ) : null}
        <span aria-hidden className={cn('min-w-0', head ? 'shrink-0' : 'truncate')}>
          {tail}
        </span>
      </span>
    </Tooltip>
  );
}

function anyPartCut(node: HTMLElement) {
  return [...node.querySelectorAll(':scope > [aria-hidden]')].some(isTextCut);
}

/** The tail is the last path segment (with its query); the head is everything before it. */
function splitUrlTail(text: string): { head: string; tail: string } {
  const cut = text.replace(/\/$/u, '').lastIndexOf('/');
  if (cut <= 0) return { head: '', tail: text };
  const tail = text.slice(cut);
  // A tail longer than half a typical cell keeps the head cut instead.
  if (tail.length > URL_TAIL_MAX) return { head: '', tail: text };
  return { head: text.slice(0, cut), tail };
}

/** Characters of a URL's last segment that stay whole while the head is cut. */
const URL_TAIL_MAX = 32;

/**
 * A date-time in a table's date column, on one line without its zone: the
 * table states the zone once (`TimeZoneNote`).
 */
export function TableTime({
  value,
  fallback = null,
}: Readonly<{ value: string | null | undefined; fallback?: ReactNode }>) {
  const timeZone = useDisplayTimeZone();
  if (!value) return fallback;
  return (
    <time dateTime={value} className="block min-w-0 truncate tabular-nums">
      {formatDisplayTimestamp(value, timeZone)}
    </time>
  );
}
