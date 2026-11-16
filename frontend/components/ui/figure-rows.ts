import { useEffect, useRef, useState } from 'react';

/**
 * How a FigureStrip breaks its figures into rows, apart from the strip so the
 * loading shapes (skeleton-block.tsx, on the boot path) place their figure
 * cards in the same rows without carrying the strip.
 */

/** The narrowest a figure's cell may be before the strip takes fewer per row. */
export const FIGURE_MIN_WIDTH = 160;
/** Three plain figures share one row down to this cell width, their labels on two lines. */
const PLAIN_THREE_MIN_WIDTH = 128;
/** Below this strip width a row holds at most two figures. */
const NARROW_STRIP = 480;
/** The gap between figures, in both directions. */
const FIGURE_GAP = 16;

/** Most figures one row holds when the strip does not fit on one row. */
function rowCap(count: number): number {
  return count <= 6 ? 3 : 4;
}

/** `count` figures in rows of at most `cap`, the fuller rows first. */
function balancedRows(count: number, cap: number): number[] {
  const rows = Math.ceil(count / cap);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < extra ? 1 : 0));
}

export const cellWidth = (width: number, perRow: number) =>
  (width - FIGURE_GAP * (perRow - 1)) / perRow;

type StripFit = Readonly<{ count: number; width: number; lead?: boolean }>;

/**
 * The figures per row for `count` figures in a strip `width` px wide. Columns
 * come from the count, never the width alone: 2 to 4, and 5 or 6 when each
 * cell keeps 160px, sit on one row; otherwise 5 are 3 + 2, 6 are 3 + 3, 7 are
 * 4 + 3 and 8 are 4 + 4, and narrower cells take fewer (4 become 2 + 2, 3
 * stack). Three plain figures stay on one row while each keeps 128px (a strip
 * of 416px); three with an icon tile or a ring (`lead`) keep the 160 minimum.
 * Below a 480px strip a row holds at most two and an odd last figure takes the
 * full row; wider, no row holds one figure alone unless three stack.
 */
export function figureRows({ count, width, lead = false }: StripFit): number[] {
  if (count <= 0) return [];
  const fits = (perRow: number) => cellWidth(width, perRow) >= FIGURE_MIN_WIDTH;
  if (count <= 2) return [count];
  if (count === 3) return rowsOfThree(width, lead);
  if (width < NARROW_STRIP) return balancedPairs(count);
  if (count <= 6 && fits(count)) return [count];
  for (let cap = rowCap(count); cap >= 3; cap -= 1) {
    if (fits(cap)) return balancedRows(count, cap);
  }
  const pairs = balancedPairs(count);
  // An odd figure joins the row before it rather than standing alone.
  if (pairs.at(-1) === 1) {
    pairs.pop();
    pairs[pairs.length - 1] = 3;
  }
  return [...pairs].sort((a, b) => b - a);
}

/** Three figures: one row while each cell keeps its minimum, else stacked (2 + 1 in a narrow strip with room for two). */
function rowsOfThree(width: number, lead: boolean): number[] {
  if (cellWidth(width, 3) >= (lead ? FIGURE_MIN_WIDTH : PLAIN_THREE_MIN_WIDTH)) return [3];
  if (width < NARROW_STRIP && cellWidth(width, 2) >= FIGURE_MIN_WIDTH) return balancedPairs(3);
  return [1, 1, 1];
}

/** Rows of two, an odd figure last on its own. */
function balancedPairs(count: number): number[] {
  return Array.from({ length: Math.ceil(count / 2) }, (_, index) => Math.min(2, count - index * 2));
}

/** Each figure's row size, in order: the `--row` its cell's flex-basis reads (globals.css). */
export function figureRowSizes(fit: StripFit): number[] {
  return figureRows(fit).flatMap((size) => Array.from({ length: size }, () => size));
}

/** A strip's width, kept current; wide until measured. */
export function useStripWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
