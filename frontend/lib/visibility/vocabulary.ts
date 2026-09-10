/**
 * The one place a backend token becomes something a customer reads.
 *
 * Every visibility surface used to print its own enums: `comparison.status`
 * reached the page through `replaceAll('_', ' ')` and rendered as "no baseline",
 * source rows printed `third_party` and `source-taxonomy-2`, and prompt rows
 * printed their score fields by name. That is the model's vocabulary, not the
 * reader's, and no amount of layout work fixes it.
 *
 * Rules for anything added here:
 *   - An unmapped token renders as NOTHING, never as the raw token. A missing
 *     translation is a gap in this file, not something to leak to the customer.
 *   - Copy states what the reader observes, never how it was computed. The
 *     denominator ("3 of 10 answers") is the reader's; the numerator's SQL is
 *     not.
 *   - Where NOTHING in a selection is comparable, the change column is not
 *     rendered at all; where one row among many lacks a change, it uses the
 *     shared availability vocabulary. Never a placeholder sentence per cell.
 */

import { sourceClassLabel, type SourceClass } from '@/lib/opportunities/source-pattern';

/**
 * A change in percentage points, or `null` when there is none to show.
 *
 * Returning `null` rather than a sentence is the point: the old
 * "No comparable change" string was rendered inside numeric table cells, where
 * it wrapped across three lines and buried the numbers it sat beside. Callers
 * decide how absence reads — usually by not drawing the column.
 */
export function changeLabel(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  // Decide the sign from the value the reader will SEE. Signing the raw number
  // rendered a movement of +0.04pp as "+0.0 pp", which claims a direction the
  // displayed figure does not support.
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} pp`;
}

/**
 * What the reader is told when a measurement produced no observations at all —
 * distinct from an observed zero, which stays `0%` (design.md, availability
 * vocabulary).
 */
export function observationLabel(state: string | null | undefined): string | null {
  return state === 'no_observations' ? 'Not measured' : null;
}

/**
 * The kind of site, reusing the labels the opportunities surface already
 * publishes. An unrecognised class is dropped rather than shown raw — which is
 * how `editorial_third_party` and `source-taxonomy-2` reached the screen.
 */
export function sourceCategoryLabels(values: readonly string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => {
          try {
            return sourceClassLabel(value as SourceClass);
          } catch {
            return undefined;
          }
        })
        .filter((label): label is string => Boolean(label)),
    ),
  ];
}
