import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from 'react';

import {
  columnFloor,
  isFlexible,
  SELECT_WIDTH,
  withEdges,
  type DataTableColumn,
} from '@/components/ui/data-table-columns';

/** A column as the fit sees it: its floor in px, whether it takes the rest, whether it may hide. */
export type FitColumn = Readonly<{ floor: number; flexible: boolean; low: boolean }>;

/**
 * The narrowest the table may be, in px: the fixed floors and the select
 * column, plus each flexible column at the widest flexible floor (a fixed
 * layout splits what is left evenly).
 */
export function tableFloor(columns: readonly FitColumn[], select: number): number {
  const flexible = columns.filter((column) => column.flexible);
  const fixed = columns.reduce((sum, column) => sum + (column.flexible ? 0 : column.floor), select);
  const widest = Math.max(0, ...flexible.map((column) => column.floor));
  return fixed + flexible.length * widest;
}

/**
 * The indices of the low-priority columns to hide so the table fits its
 * frame: the last low column first, until the floors fit or none is left.
 */
export function hiddenLowColumns({
  columns,
  select,
  frame,
}: Readonly<{ columns: readonly FitColumn[]; select: number; frame: number }>): number[] {
  const hidden = new Set<number>();
  const lowFromEnd = columns.flatMap((column, index) => (column.low ? [index] : [])).reverse();
  for (const index of lowFromEnd) {
    const shown = columns.filter((_, at) => !hidden.has(at));
    if (tableFloor(shown, select) <= frame) break;
    hidden.add(index);
  }
  return [...hidden].sort((a, b) => a - b);
}

/**
 * The keys of the columns a table shows, for a row whose cell spans columns:
 * a spanning row keeps every cell (its positions are not the columns'), so
 * its span counts only the shown columns. Undefined outside a DataTable.
 */
export const ShownColumnsContext = createContext<ReadonlySet<string> | undefined>(undefined);

/** How many of `keys` the table shows: a spanning cell's `colSpan`. */
export function useShownSpan(keys: readonly string[]): number {
  const shown = useContext(ShownColumnsContext);
  return shown ? keys.filter((key) => shown.has(key)).length : keys.length;
}

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Which low-priority columns the frame has no room for. A hidden probe
 * resolves every column's CSS floor to px inside the frame, and a resize
 * observer re-fits as the frame changes, before paint.
 */
export function useFittedColumns({
  columns,
  selection,
}: Readonly<{ columns: readonly DataTableColumn[]; selection: boolean }>) {
  const scope = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<readonly number[]>([]);
  const hasLow = columns.some((column) => column.priority === 'low');

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const probe = probeRef.current;
    if (!hasLow || !frame || !probe || typeof ResizeObserver === 'undefined') {
      setHidden((previous) => (previous.length ? [] : previous));
      return;
    }
    const update = () => {
      const width = frame.getBoundingClientRect().width;
      if (width === 0) return;
      const [select = 0, ...floors] = [...probe.children].map(
        (child) => child.getBoundingClientRect().width,
      );
      const next = hiddenLowColumns({
        columns: columns.map((column, index) => ({
          floor: floors[index] ?? 0,
          flexible: isFlexible(column),
          low: column.priority === 'low',
        })),
        select: selection ? select : 0,
        frame: width,
      });
      setHidden((previous) => (sameList(previous, next) ? previous : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
    // A page's column list is often a new array each render; the equal-list guard ends the cycle.
  }, [columns, hasLow, selection]);

  const hiddenSet = new Set(hidden);
  const shown = columns.filter((_, index) => !hiddenSet.has(index));
  const positions = hidden.map((index) => index + (selection ? 2 : 1));
  return {
    frameRef,
    shown,
    shownKeys: new Set(shown.map((column) => column.key)),
    /** The frame's scope for the hiding rule; undefined while nothing hides. */
    fitScope: positions.length ? scope : undefined,
    probe: hasLow ? (
      <>
        <FloorProbe ref={probeRef} columns={columns} selection={selection} />
        {positions.length ? <style>{hidingRule(scope, positions)}</style> : null}
      </>
    ) : null,
  };
}

/**
 * Hides the head and cells at the given 1-based positions in one table. A
 * row with a spanning cell (a state, the reserved space, a full-row note)
 * keeps its cells; it spans the shown columns (`useShownSpan`).
 */
function hidingRule(scope: string, positions: readonly number[]): string {
  const cells = positions.map(
    (position) => `[data-fit="${scope}"] tr:not(:has(> [colspan])) > :nth-child(${position})`,
  );
  return `${cells.join(',')}{display:none}`;
}

/**
 * One zero-height box per column at its CSS floor, the select column first;
 * a `desktopOnly` column measures zero where the narrow layout drops it.
 */
function FloorProbe({
  ref,
  columns,
  selection,
}: Readonly<{
  ref: Ref<HTMLDivElement>;
  columns: readonly DataTableColumn[];
  selection: boolean;
}>) {
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none invisible absolute h-0 overflow-hidden"
    >
      <div style={{ width: SELECT_WIDTH }} />
      {withEdges(columns, selection).map(({ column, edge }) => (
        <div
          key={column.key}
          className={column.desktopOnly ? 'desktop:block hidden' : undefined}
          style={{ width: columnFloor(column, edge) }}
        />
      ))}
    </div>
  );
}
