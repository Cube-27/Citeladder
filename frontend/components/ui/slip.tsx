import { cn } from '@/lib/utils';

/**
 * The boxes of the app (2.4). A card never sits in a card: inside a card
 * section a slip steps down to an inset (globals.css).
 *
 *   Slip  — one actionable object (an Action in a queue, an integration, a
 *           plan, a widget): a card, `surface`, no edge, the card radius and
 *           `shadow-card`. A card that opens on click is an `IconCard`
 *           (icon-card.tsx), which adds the `control-edge`.
 *   Well  — quoted or raw material (an answer passage, code, a fact list in a
 *           drawer, a fieldset): `well`, the control radius, no edge.
 *   Sheet — anything that floats: `raised`, a 1px `rule` edge, its radius
 *           and shadow (`SHEET_FACE` modal, `POP_FACE` small).
 */
export const SLIP_FACE = 'bg-surface text-ink rounded-card shadow-card';

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
export const SHEET_FACE = 'bg-raised text-ink border-rule rounded-overlay border shadow-sheet';

/** A small overlay (menu, popover, tooltip, toast): radius 8, `shadow-pop`. */
export const POP_FACE = 'bg-raised text-ink border-rule rounded-card border shadow-pop';
