import { cn } from '@/lib/utils';

/**
 * The three boxes of the app. Nothing at rest has a
 * shadow, a slip never nests in a slip, and a section is not a box at all.
 *
 *   Slip  — one actionable object (an Action in a queue, an integration, a
 *           plan, a skill, a widget): `surface`, a hairline, radius 4.
 *   Well  — quoted or raw material (an answer passage, code, a fact list in a
 *           drawer, a fieldset): `well`, radius 4, no edge.
 *   Sheet — anything that floats: `raised`, a hairline, radius 8 (set by the
 *           sheet itself) and the one shadow.
 */
export const SLIP_FACE = 'bg-surface text-ink border-rule rounded-control border';

/** A slip, for a semantic element that is not a `div` (a list item, a fieldset, a link). */
export function slipClasses(className?: string) {
  return cn('surface-slip p-[var(--card-padding)]', SLIP_FACE, className);
}

/** A well, on whatever element the material needs (`blockquote`, `pre`, `dl`, `fieldset`). */
export function wellClasses(className?: string) {
  return cn('surface-well bg-well rounded-control p-[var(--card-padding)]', className);
}

export const SHEET_FACE = 'bg-raised text-ink border-rule border shadow-sheet';
