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

/**
 * Underline tabs — the v2 primary-navigation-within-a-screen pattern (the
 * Visibility dashboard's filter bar). Distinct from the segmented control
 * above, which stays a pill track: segmented switches a *view of the same
 * data* (metric, Domains/URLs), underline tabs switch *which data* is on
 * screen and sit at a higher level of the page.
 *
 * Also exported as recipes, for the same reason — the call sites need
 * `tablist`/`radiogroup`/plain-button semantics over one visual.
 *
 * The track's bottom hairline runs the full width and each item overlaps it
 * with its own 2px accent border, so the selected tab reads as continuous with
 * the content below it rather than as a floating pill.
 */
export const underlineTabsTrackClasses = 'border-border-subtle flex items-center gap-4 border-b';

export const underlineTabItemClasses = (selected: boolean) =>
  cn(
    'focus-ring -mb-px border-b-2 px-0.5 pb-2 text-sm font-medium whitespace-nowrap transition-colors',
    selected
      ? 'border-accent text-foreground'
      : 'text-muted hover:text-foreground border-transparent',
  );
