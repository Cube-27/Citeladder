import { cn } from '@/lib/utils';

/**
 * Panel — the bordered, filled box that sits *inside* a Card or a section.
 *
 * Twenty-seven places used to build this by hand, each picking its own fill,
 * border colour, radius and padding, which is why the same evidence box looked
 * different in six screens. `Card` could not absorb them: a Card may not nest
 * inside a Card, and most of these are structure rather than semantic objects.
 *
 * This is a class recipe, not a component, because these boxes land on `div`,
 * `li`, `section` and `dd` alike and the element must stay semantic.
 */
const PANEL_TONE = {
  /** Raised out of the section — the default for a nested object. */
  panel: 'bg-panel',
  /** Recessed — evidence, payloads, quoted source. */
  well: 'bg-well',
  /** Quietly separated, for a row that is chrome rather than content. */
  tonal: 'bg-background-alt',
  /** The caller supplies the fill because it carries a status meaning. */
  none: '',
} as const;

const PANEL_PAD = {
  none: '',
  compact: 'p-[var(--card-padding-compact)]',
  default: 'p-[var(--card-padding)]',
  large: 'p-[var(--card-padding-large)]',
} as const;

/**
 * Panels normally carry their own border and radius. `flush` is for a panel
 * TILED inside another surface — a strip of cards filling a card — where the
 * container already draws the outer edge and a per-tile radius would show as
 * notches along the seams.
 */
const PANEL_EDGE = {
  rounded: 'border-border-subtle rounded-[var(--radius-control)] border',
  flush: '',
} as const;

export type PanelEdge = keyof typeof PANEL_EDGE;
export type PanelTone = keyof typeof PANEL_TONE;
export type PanelPad = keyof typeof PANEL_PAD;

export function panelClasses(
  {
    tone = 'panel',
    pad = 'default',
    edge = 'rounded',
  }: { tone?: PanelTone; pad?: PanelPad; edge?: PanelEdge } = {},
  className?: string,
) {
  return cn(PANEL_EDGE[edge], PANEL_TONE[tone], PANEL_PAD[pad], className);
}
