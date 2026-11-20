import { cn } from '@/lib/utils';

/**
 * The boxes of the app (2.4). Content sits on the page surface; a box is
 * earned. A card never sits in a card: inside a container a slip steps down
 * to an inset (globals.css).
 *
 *   Frame — the one framed surface: a `rule` edge at radius 8 (`FRAME_FACE`),
 *           on the `panel` with its ink when it holds content (`SLIP_FACE`:
 *           a slip, a framed section, a table's or a chart's frame).
 *   Well  — quoted or raw material (an answer passage, code, a fact list in a
 *           drawer, a fieldset): `well`, the control radius, no edge.
 *   Sheet — anything that floats: a 1px `rule` edge, its radius and shadow
 *           (`SHEET_FACE` modal on the panel, `POP_FACE` small).
 */
export const FRAME_FACE = 'border border-rule rounded-card';

export const SLIP_FACE = cn('bg-surface text-ink', FRAME_FACE);

/** A slip, for a semantic element that is not a `div` (a list item, a fieldset). */
export function slipClasses(className?: string) {
  return cn('surface-slip p-[var(--card-padding)]', SLIP_FACE, className);
}

/** A reply's tool-step group: a slip 12 down and 16 across, apart from the prose on the ground. */
export const STEP_SLIP = cn('surface-slip min-w-0 px-4 py-3', SLIP_FACE);

/** A well, on whatever element the material needs (`blockquote`, `pre`, `dl`, `fieldset`). */
export function wellClasses(className?: string) {
  return cn('surface-well bg-well rounded-control p-[var(--card-padding)]', className);
}

/** A modal sheet (dialog, drawer, command palette): radius 12, `shadow-sheet`, on the scrim. */
export const SHEET_FACE = 'bg-surface text-ink border-rule rounded-overlay border shadow-sheet';

/** A small overlay (menu, popover, tooltip, toast): radius 8, `shadow-pop`. */
export const POP_FACE = 'bg-raised text-ink border-rule rounded-card border shadow-pop';
