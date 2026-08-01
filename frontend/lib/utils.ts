import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge classifies an unrecognised `text-*` class as a COLOUR, so the
 * website type scale (`text-mkt-sm`, `text-mkt-h2`, …) landed in the same
 * conflict group as `text-mkt-ink` and silently dropped whichever came first —
 * which is how a primary button ended up with black text on a black fill.
 * Teaching the merger which names are sizes keeps size and colour independent.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            // App ladder rungs beyond the default t-shirt sizes (§7) —
            // without these, `text-hero` + `text-score-high-text` would
            // collapse to the colour and the numeral would lose its size.
            '2xs',
            'hero',
            'heading-xs',
            'heading-sm',
            'display-1',
            'display-2',
            // Website ladder (text-mkt-*) — docs/website-design-system.md §2.
            // EVERY rung must be listed: a missing name is not a styling nit,
            // it silently deletes the size wherever a colour sits beside it,
            // which is how every subpage headline once fell back to 14px.
            'mkt-dxl',
            'mkt-d404',
            'mkt-h1',
            'mkt-h2',
            'mkt-h3',
            'mkt-h4',
            'mkt-h5',
            'mkt-h6',
            'mkt-h2sm',
            'mkt-h3sm',
            'mkt-h4sm',
            'mkt-hsm',
            'mkt-lead',
            'mkt-body',
            'mkt-button',
            'mkt-nav',
            'mkt-sm',
            'mkt-xs',
            'mkt-xsb',
            'mkt-xl-display',
          ],
        },
      ],
    },
  },
});

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Two-letter avatar initials from an email address, taken from the local part
 * (before the `@`) and upper-cased. Falls back to the raw value when there is
 * no `@`, and yields `''` for an empty string. Shared by the sidebar user menu
 * and the Settings account card so both avatars stay in sync.
 */
export function emailInitials(email: string) {
  const local = email.split('@')[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

/**
 * Title-case a snake_case lifecycle/status token for display
 * (`partially_completed` → `Partially Completed`). Shared by the run/execution
 * and Site Health status view-models so their labels stay byte-identical.
 */
export function titleCaseStatus(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
