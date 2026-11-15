import { cn } from '@/lib/utils';

/**
 * The boxes of the app (2.4). A card never sits in a card: inside a card
 * section a slip steps down to an inset (globals.css).
 *
 *   Slip  — one actionable object (an Action in a queue, an integration, a
 *           plan, a skill, a widget): a card, `surface`, a 1px `rule` edge,
 *           the card radius and `shadow-card`. A slip that opens on click
 *           shows it at rest (a chevron or an underlined title); on hover its
 *           edge takes `control-line` and it lifts to `shadow-pop`
 *           (`slipClasses(…, { opens: true })`).
 *   Well  — quoted or raw material (an answer passage, code, a fact list in a
 *           drawer, a fieldset): `well`, the control radius, no edge.
 *   Sheet — anything that floats: `raised`, a 1px `rule` edge, its radius
 *           and shadow (`SHEET_FACE` modal, `POP_FACE` small).
 */
export const SLIP_FACE = 'bg-surface text-ink border-rule rounded-card shadow-card border';

/** A slip that opens on click: the hover edge and lift. */
const OPENS_ON_CLICK =
  'transition-[border-color,box-shadow] duration-[var(--motion-fast)] hover:border-control-line hover:shadow-pop';

/**
 * A slip, for a semantic element that is not a `div` (a list item, a fieldset,
 * a link). `opens`: the whole slip opens something on click.
 */
export function slipClasses(className?: string, { opens = false }: { opens?: boolean } = {}) {
  return cn('surface-slip p-[var(--card-padding)]', SLIP_FACE, opens && OPENS_ON_CLICK, className);
}

/** A well, on whatever element the material needs (`blockquote`, `pre`, `dl`, `fieldset`). */
export function wellClasses(className?: string) {
  return cn('surface-well bg-well rounded-control p-[var(--card-padding)]', className);
}

/** A modal sheet (dialog, drawer, command palette): radius 12, `shadow-sheet`, on the scrim. */
export const SHEET_FACE = 'bg-raised text-ink border-rule rounded-overlay border shadow-sheet';

/** A small overlay (menu, popover, tooltip, toast): radius 8, `shadow-pop`. */
export const POP_FACE = 'bg-raised text-ink border-rule rounded-card border shadow-pop';
