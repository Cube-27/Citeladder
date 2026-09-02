import { cn } from '@/lib/utils';

/**
 * The chip geometry, shared by every chip-shaped control. `radio-group` renders
 * the same shape from Radix data attributes rather than a boolean, so it takes
 * the base and its own state classes instead of restating the recipe.
 */
export const chipBaseClasses =
  'focus-ring inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-[background-color,color,border-color] duration-[250ms] ease-standard';

export const chipRestingClasses =
  'border-border bg-panel text-secondary hover:border-border-strong hover:text-foreground';

const chipSelectedClasses = 'border-accent-border bg-accent-subtle text-accent-text';

/** Shared multi-select/filter chip recipe. */
export function filterChipClasses(active: boolean): string {
  return cn(chipBaseClasses, active ? chipSelectedClasses : chipRestingClasses);
}

/**
 * Tag — the small inline chip that labels a value: a provenance marker, a
 * count, a property name. Six of these were hand-rolled with three different
 * fills, so the same marker read differently on each screen. It is not a
 * control: no height, no focus ring, no hover.
 */
const TAG_TONE = {
  well: 'bg-well text-secondary',
  outline: 'bg-panel border-border-subtle text-secondary border',
  accent: 'bg-accent-subtle text-accent-text',
} as const;

export type TagTone = keyof typeof TAG_TONE;

export function tagClasses(tone: TagTone = 'well', className?: string) {
  return cn(
    'inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-xs',
    TAG_TONE[tone],
    className,
  );
}
