import type { LucideIcon } from 'lucide-react';

/**
 * The one derivation every sortable table header shares.
 *
 * Three tables grew their own `SortableHead` — sources, performance
 * dimensions, site-health pages — and each worked out the header's icon and
 * its `aria-sort` separately, from the same two facts, as two nested
 * ternaries. They agreed, but nothing made them agree: `aria-sort` is the half
 * a sighted reviewer never sees, so a table whose arrow and announcement drift
 * apart still looks correct.
 *
 * The layouts genuinely differ (one centres over numbers, one stacks a
 * sublabel, one sits left of the label) and so does the inactive glyph, so
 * what is shared here is the derivation, not the component.
 */

export type SortIndicator = Readonly<{
  /** Goes on the `th`, not the button inside it. Absent unless active. */
  ariaSort: 'ascending' | 'descending' | undefined;
  icon: LucideIcon;
}>;

/** `descending` is read only when `active`; an inactive column has no order. */
export function sortIndicator(
  active: boolean,
  descending: boolean,
  icons: Readonly<{ ascending: LucideIcon; descending: LucideIcon; inactive: LucideIcon }>,
): SortIndicator {
  if (!active) return { ariaSort: undefined, icon: icons.inactive };
  if (descending) return { ariaSort: 'descending', icon: icons.descending };
  return { ariaSort: 'ascending', icon: icons.ascending };
}
