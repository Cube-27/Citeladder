import {
  useRef,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';

import { Absence } from '@/components/ui/absence';
import { Checkbox } from '@/components/ui/checkbox';
import { ClampText, UrlCutParts, useCut } from '@/components/ui/clamp-text';
import type { ScrollRegionProps } from '@/components/ui/scroll-edges';
import { Tag } from '@/components/ui/tag';
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import {
  type Absent,
  formatDisplayTimestamp,
  isAbsent,
  readableUrl,
  urlCellText,
} from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Table — the app's data table:
 *  - in the app a `rule` frame holds a 32 head band on `raised` (caption
 *    at 500, `scope="col"`, `ink` while sorted) over the panel body
 *  - `table-row-height` rows (40 in the app) with `rule` lines between them;
 *    every row tints on hover as one piece, pinned cells included
 *    (data-table.css); `highlight` marks your own row (one row per
 *    table, never for emphasis); no zebra stripes, no column rules
 *  - every cell is one line: `ClampText` cuts a long value with an ellipsis
 *    and puts the whole of it in a tooltip, so no row is an outlier
 *  - numeric columns align right in tabular figures, under a right-aligned
 *    header, so digits line up place by place; text columns stay left
 *  - `fixed` takes column widths from the header cells, never from the rows
 *    shown, so paging, sorting and loading never move the columns
 * The wrapper scrolls, so the sticky header pins on vertical scroll. On its
 * own in the app it draws the frame; inside a DataTable the DataTable's frame does.
 */
const tableHeadClasses = 'text-caption text-ink-2 whitespace-nowrap';
export function Table({
  children,
  className,
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
        'table-frame bg-surface relative w-full max-w-full min-w-0 overflow-auto rounded-card',
        wrapperClassName,
      )}
    >
      <table
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          'text-body-sm text-ink w-full border-separate border-spacing-0',
          fixed && 'table-fixed',
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
  // The app tints a pressable row's cells on hover, and every row's on
  // selection (globals.css); the website keeps its row-level tint.
  const pressable = props.onClick !== undefined;
  return (
    <tr
      {...props}
      data-pressable={pressable || undefined}
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
        // The website's head is a `surface-sunken` band; the app paints its shell
        // (globals.css). The opaque fill keeps a sticky header over scrolled rows.
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

const cellClasses = ({ numeric, desktopOnly }: CellOptions) =>
  cn(
    // Padding 8 and 8: the row hairline is drawn inside the row (data-table.css).
    'text-body-sm text-ink px-[var(--table-cell-padding-x)] py-[var(--table-cell-padding-y)] text-left align-middle',
    // A value never wraps: a word split over two lines reads as two values.
    // Tabular figures, so a right-aligned column lines up place by place.
    numeric && 'whitespace-nowrap text-right tabular-nums',
    desktopOnly && desktopOnlyClasses,
  );

/** A formatter's absence prints as the Absence mark; text prints as it is. */
function CellContent({
  children,
  numeric,
}: Readonly<{ children: ReactNode | Absent; numeric?: boolean }>) {
  if (isAbsent(children)) return <Absence state={children.absent} />;
  return !numeric && isPlainText(children) ? <ClampText>{children}</ClampText> : children;
}

/**
 * A missing figure (which renders the Absence mark) reads muted;
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
  Omit<TdHTMLAttributes<HTMLTableCellElement>, 'children'> &
    CellOptions & {
      children?: ReactNode | Absent;
      /**
       * The first cell of a row grouped under a group-label row: inset one
       * step; `2` for a row under a group nested in another.
       */
      nested?: boolean | 2;
    }
>) {
  return (
    <td
      {...props}
      className={cn(
        cellClasses({ numeric, desktopOnly }),
        nested === true && 'ps-[calc(var(--table-cell-padding-x)+16px)]',
        nested === 2 && 'ps-[calc(var(--table-cell-padding-x)+32px)]',
        className,
      )}
    >
      <CellContent numeric={numeric}>{children}</CellContent>
    </td>
  );
}

/**
 * A value with its secondary text inline after it in `ink-2` (a query, then
 * its page), on the row's one line. The secondary text gives way first; each
 * part cut keeps its whole text in a tooltip. `title` inks the value as an
 * item title.
 */
export function TableCellLines({
  primary,
  secondary,
  secondaryTooltip,
  title = false,
}: Readonly<{
  primary: ReactNode;
  secondary?: ReactNode;
  /** The secondary text's tooltip when it is cut, e.g. the full URL behind a path. */
  secondaryTooltip?: ReactNode;
  title?: boolean;
}>) {
  return (
    <span data-cell-lines="" className="flex min-w-0 items-baseline gap-2">
      <ClampText rowTitle className={cn('max-w-full shrink-0', title && textRole('body'))}>
        {primary}
      </ClampText>
      {secondary ? (
        <ClampText tooltip={secondaryTooltip} className="text-ink-2">
          {secondary}
        </ClampText>
      ) : null}
    </span>
  );
}

/**
 * The word on your own row: a static tag in `ink` at 500. The row's accent
 * edge and series swatch mark it, so no accent text sits beside red deltas.
 */
export function YouTag() {
  return <Tag className="text-ink font-medium">You</Tag>;
}

/** A row's trailing buttons, end-aligned at the button gap (`rowActions` column). */
/**
 * Whether a click on a pressable row landed on the row itself rather than on
 * one of its controls (a link, a button, the select or actions cell). React
 * bubbles portal clicks (an open menu's items) through the row: those don't count.
 */
export function isRowSurfaceClick(event: MouseEvent<HTMLTableRowElement>): boolean {
  const row = event.currentTarget;
  if (!(event.target instanceof Element) || !row.contains(event.target)) return false;
  for (let node: Element | null = event.target; node && node !== row; node = node.parentElement)
    if (node.matches(ROW_CONTROL)) return false;
  return true;
}

const ROW_CONTROL =
  'a, button, input, label, [role="button"], [role="checkbox"], [role="switch"], [data-row-control]';

export function TableActionsCell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <td data-row-control="" className={cn(cellClasses({}), 'whitespace-nowrap')}>
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
  /** `range` is true for a shift-click (or shift-Space): select from the last row clicked. */
  onCheckedChange: (checked: boolean, range: boolean) => void;
  disabled?: boolean;
}>) {
  // The box's click toggles it; the cell sees that click first, with its shift key.
  const range = useRef(false);
  return (
    <td
      data-row-control=""
      className={cellClasses({})}
      onClickCapture={(event) => {
        range.current = event.shiftKey;
      }}
    >
      <Checkbox
        aria-label={label}
        aria-describedby={describedBy}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true, range.current)}
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
      {isPlainText(children) ? <ClampText rowTitle>{children}</ClampText> : children}
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
        <UrlCutParts text={text} />
      </span>
    </Tooltip>
  );
}

function anyPartCut(node: HTMLElement) {
  return [...node.querySelectorAll(':scope > span')].some(isTextCut);
}

/**
 * A date-time in a table's date column, on one line without its zone: a
 * DataTable with a `date` column states the zone once in its footer.
 */
export function TableTime({
  value,
  fallback = null,
}: Readonly<{ value: string | null | undefined; fallback?: ReactNode }>) {
  const timeZone = useDisplayTimeZone();
  if (!value) return fallback;
  // A date cut by a narrow column keeps its whole text in ClampText's tooltip.
  return (
    <ClampText className="tabular-nums">
      <time dateTime={value}>{formatDisplayTimestamp(value, timeZone)}</time>
    </ClampText>
  );
}
