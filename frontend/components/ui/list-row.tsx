import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * The one selected-row treatment for a selectable list beside its detail
 * (topic rail, catalog tree, issue list, pressable stats).
 *
 * Four recipes had grown up for the same state — a selected tint with an
 * accent edge, an accent-subtle fill, accent ink alone and an accent-soft
 * wash — so "this is the row you are looking at" looked different on every
 * route, and three of the four spent the action colour on a state.
 *
 * Selected is the raised neutral face the sidebar's current location uses:
 * paper fill, the control elevation ring and primary ink (`selection-raised`
 * is the shared material class). Unselected interactive rows take the neutral
 * hover and pressed tints. The state itself must also be in the markup — the
 * caller sets `aria-current` (navigation-like lists), `aria-selected` (a
 * listbox/grid option) or `aria-pressed` (a toggle); colour is never the only
 * signal.
 *
 * Layout (padding, gap, grid) stays with the caller: rows differ in anatomy,
 * not in state.
 */
export function listRowClasses({
  selected = false,
  interactive = true,
}: Readonly<{ selected?: boolean; interactive?: boolean }> = {}) {
  return cn(
    'rounded-[var(--radius-control)] transition-[background-color,color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
    selected
      ? 'bg-panel selection-raised text-foreground'
      : interactive && 'text-secondary hover:bg-hover hover:text-foreground active:bg-active',
  );
}

/** A plain list item in the selected-row recipe, for lists that are not buttons. */
export function ListRow({
  selected = false,
  interactive = false,
  className,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'li'> & {
    selected?: boolean;
    interactive?: boolean;
  }
>) {
  return (
    <li
      {...props}
      aria-current={props['aria-current'] ?? (selected ? 'true' : undefined)}
      className={cn(listRowClasses({ selected, interactive }), className)}
    />
  );
}
