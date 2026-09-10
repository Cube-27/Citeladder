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
 *   - "No comparison is possible" is one page-level sentence, not a phrase
 *     repeated in every cell that lacks a delta. Where NOTHING in a selection
 *     is comparable, the change column is not rendered at all; where one row
 *     among many lacks a change, it uses the shared availability vocabulary.
 */

import { sourceClassLabel, type SourceClass } from '@/lib/opportunities/source-pattern';

type ComparisonCopy = {
  /** Page-level sentence. `null` where the state needs no explanation. */
  readonly note: (baselineAt: string | null) => string | null;
  /** Whether per-metric deltas are meaningful at all in this state. */
  readonly hasDeltas: boolean;
};

const COMPARISON: Record<string, ComparisonCopy> = {
  no_baseline: {
    note: () => 'First run — there is nothing to compare against yet.',
    hasDeltas: false,
  },
  identity_unavailable: {
    note: () => 'Change since the previous run is unavailable.',
    hasDeltas: false,
  },
  changed_context: {
    note: () =>
      'Your prompts or models changed since the last run, so the two runs are not directly comparable.',
    hasDeltas: false,
  },
  comparable: {
    note: (at) => (at ? `Compared with ${at}.` : null),
    hasDeltas: true,
  },
  matched_subset: {
    note: (at) =>
      at
        ? `Compared with ${at}, across the prompts and models both runs share.`
        : 'Compared across the prompts and models both runs share.',
    hasDeltas: true,
  },
  partial_coverage: {
    note: (at) =>
      at ? `Compared with ${at}. Part of this period has no measurements.` : null,
    hasDeltas: true,
  },
};

/**
 * One sentence explaining what the change figures mean — or `null` when the
 * state is ordinary enough to need no sentence at all. Callers render this once
 * per page, under the headline, never per metric.
 */
export function comparisonNote(
  status: string | null | undefined,
  baselineAt: string | null = null,
): string | null {
  if (!status) return null;
  return COMPARISON[status]?.note(baselineAt) ?? null;
}

/** True when this comparison state produces deltas worth showing at all. */
export function hasComparableChange(status: string | null | undefined): boolean {
  return status ? (COMPARISON[status]?.hasDeltas ?? false) : false;
}

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

/** Tone for a change figure. Neutral when there is no change to speak of. */
export function changeTone(value: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (value === null || value === undefined) return 'neutral';
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return 'neutral';
  return rounded > 0 ? 'positive' : 'negative';
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
 * Who runs a cited site, in the reader's terms.
 *
 * The Sources table printed these tokens verbatim — a row read
 * "Ownership: third_party". It is a category of website, and it has a name.
 */
const OWNERSHIP: Record<string, string> = {
  owned: 'Your site',
  brand_owned: 'Your site',
  competitor: 'Competitor site',
  competitor_owned: 'Competitor site',
  third_party: 'Independent site',
};

export function ownershipLabels(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => OWNERSHIP[value]).filter(Boolean))];
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

/**
 * How many answers revealed the searches behind them.
 *
 * The Query Fanout header rendered this map by key, producing
 * "queries available: 8 responses · no search: 2 responses". The states are
 * real and worth knowing; their storage names are not.
 */
const FANOUT_COVERAGE: Record<string, (count: number) => string> = {
  queries_available: (count) => `${count} showed the searches they ran`,
  count_only: (count) => `${count} searched without revealing the wording`,
  no_search: (count) => `${count} answered without searching`,
};

export function fanoutCoverageSentence(
  coverage: Record<string, number> | null | undefined,
): string | null {
  const parts = Object.entries(coverage ?? {})
    .filter(([state, count]) => count > 0 && FANOUT_COVERAGE[state])
    .map(([state, count]) => FANOUT_COVERAGE[state](count));
  if (!parts.length) return null;
  const total = Object.values(coverage ?? {}).reduce((sum, count) => sum + count, 0);
  return `Of ${total} ${total === 1 ? 'answer' : 'answers'}: ${parts.join(', ')}.`;
}
