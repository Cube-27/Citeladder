import { cn } from '@/lib/utils';

/**
 * ADS underline tablist recipes — the one tab treatment for the app
 * (docs/design.md calls these "underline tabs"; the pill segmented look they
 * replaced never matched that name). Shared by the Visibility workspace
 * tabs, the Products nested tablists, and the Settings sections, which each
 * render `role=tablist` with roving tabindex on top of these classes.
 *
 * Anatomy (ADS `tab-list` compiled CSS):
 *  - the tablist carries a 1px full-width rule along its block end (the
 *    `before:`), which is what makes a row of text read as "tabs"
 *  - `[role=tab]` is font.body (14/20) at weight 500 in `text-secondary`
 *    (ADS `color.text.subtle`); hover gets the neutral-subtle fill
 *  - the selected tab flips to `text-accent-text` (ADS `color.text.selected`)
 *    and draws a 2px accent underline inset 8px on both inline edges (the
 *    `after:`), which sits on top of the tablist rule
 *  - the row stays single-line and scrolls horizontally at narrow widths —
 *    `overflow-x-auto` + `flex-nowrap` are part of the contract and are
 *    pinned by e2e/visibility.spec.ts
 *
 * Exported as CLASS RECIPES rather than a component: the three call sites own
 * slightly different ARIA wiring and panel mounting (one panel vs all panels
 * mounted), and sharing the classes keeps them identical without forcing one
 * structure.
 */
export const tabListClasses =
  "relative flex w-full max-w-full flex-nowrap gap-1 overflow-x-auto [scrollbar-width:none] before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border before:content-[''] [&::-webkit-scrollbar]:hidden";

export const tabItemClasses = (selected: boolean) =>
  cn(
    'focus-ring relative shrink-0 rounded-t-md px-3 pt-1.5 pb-2 text-sm font-medium whitespace-nowrap transition-colors',
    selected
      ? "text-accent-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent after:content-['']"
      : 'text-secondary hover:bg-background-alt hover:text-foreground',
  );
