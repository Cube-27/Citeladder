import { cn } from '@/lib/utils';

/**
 * Segmented track/pill recipes — the `bg-alt` track with a white (panel)
 * active pill used by the Visibility tablist, the trend card's metric switch
 * and the Sources card's Domains/URLs switch.
 *
 * Exported as CLASS RECIPES rather than a component because the call sites
 * need different semantics on the same visual: a `tablist` (Visibility tabs),
 * a `radiogroup` (setup's benchmark mode) and plain buttons (chart switches).
 * Sharing the classes keeps them identical without forcing one ARIA role.
 */
export const segmentedTrackClasses =
  'bg-background-alt inline-flex items-center gap-0.5 rounded-full p-0.5';

export const segmentedItemClasses = (selected: boolean) =>
  cn(
    'focus-ring rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
    selected ? 'bg-panel text-foreground shadow-xs' : 'text-muted hover:text-foreground',
  );
