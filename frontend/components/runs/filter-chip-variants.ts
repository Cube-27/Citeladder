import { cn } from '@/lib/utils';

/**
 * Filter-chip class recipe — a pill button with a hairline border; the active
 * chip takes the accent-soft fill + accent text (blue stays reserved for active
 * states).
 *
 * Lives beside the component rather than inside it (matching
 * `components/ui/*-variants.ts`) because two call sites need the classes on
 * different semantics: the runs status filters render `FilterChip` itself
 * (aria-pressed), while the launch dialog's engine chips need `role=checkbox`
 * on their own element. A component file that also exports a plain function
 * costs Fast Refresh the ability to preserve state on edit, so the recipe is a
 * module of its own.
 */
export function filterChipClasses(active: boolean): string {
  return cn(
    'focus-ring inline-flex h-[var(--control-height-sm)] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-[background-color,color,border-color]',
    active
      ? 'border-accent-border bg-accent-soft text-accent-text'
      : 'border-border bg-panel text-secondary hover:border-border-strong hover:text-foreground',
  );
}
