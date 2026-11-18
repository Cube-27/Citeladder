import { useState } from 'react';

/** The ticked prompt ids, and the row a shift-click ranges from. */
export type RowSelection = Readonly<{ ids: ReadonlySet<string>; anchor: string | null }>;

const EMPTY: RowSelection = { ids: new Set(), anchor: null };

/**
 * Tick or untick one row. With `range`, every row from the anchor to it in
 * `order` takes its new state; without an anchor still in `order`, just the row.
 */
export function toggleRow(
  selection: RowSelection,
  change: Readonly<{ order: readonly string[]; id: string; checked: boolean; range: boolean }>,
): RowSelection {
  const { order, id, checked, range } = change;
  const from = range && selection.anchor !== null ? order.indexOf(selection.anchor) : -1;
  const to = order.indexOf(id);
  const span =
    from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
  const ids = new Set(selection.ids);
  for (const each of span) {
    if (checked) ids.add(each);
    else ids.delete(each);
  }
  return { ids, anchor: id };
}

/** Tick or untick every row on the page; the anchor stays. */
export function togglePage(
  selection: RowSelection,
  pageIds: readonly string[],
  checked: boolean,
): RowSelection {
  const ids = new Set(selection.ids);
  for (const id of pageIds) {
    if (checked) ids.add(id);
    else ids.delete(id);
  }
  return { ids, anchor: selection.anchor };
}

/**
 * A table's row selection over the rows it shows, in their order. Only shown
 * rows count as selected, so a row a refresh removed is never acted on.
 */
export function useRowSelection<T extends { id: string }>(rows: readonly T[]) {
  const [selection, setSelection] = useState<RowSelection>(EMPTY);
  const selected = rows.filter((row) => selection.ids.has(row.id));
  return {
    ids: selection.ids,
    selected,
    toggle: (id: string, checked: boolean, range: boolean) =>
      setSelection((current) =>
        toggleRow(current, { order: rows.map((row) => row.id), id, checked, range }),
      ),
    togglePage: (pageIds: readonly string[], checked: boolean) =>
      setSelection((current) => togglePage(current, pageIds, checked)),
    clear: () => setSelection(EMPTY),
  };
}

export type RowSelectionState = ReturnType<typeof useRowSelection>;
