/**
 * Reading a verification result without overstating it.
 *
 * The backend reports a placement observation in its own `placement` section,
 * beside — never inside — the comparable movement legs. This module turns that
 * section into sentences and keeps the four persisted states apart:
 *
 *   satisfied    the declared change is on the page
 *   unmet        the page was read and the change is not there
 *   pending      nobody has read the page since the declaration
 *   unavailable  the page could not be compared against its frozen baseline
 *
 * The last two are the ones a careless reading collapses into the second. "We
 * could not look" is not "it did not happen", and reporting it as such is the
 * same error as calling an unread page a confirmed absence.
 *
 * `result` is a persisted blob the API declares as an open record, so the
 * section is PARSED rather than cast. An unrecognised shape yields no claim at
 * all, which is the honest outcome — a cast would keep printing confident copy
 * over a payload whose fields had been renamed.
 */
import { z } from 'zod';

import { COVERAGE_TOO_THIN } from '@/lib/visibility/source-pages';

/** The persisted result payload, as loosely as the API declares it. */
export type VerificationResult = Record<string, unknown>;

const placementSectionSchema = z.object({
  state: z.string(),
  expected_change: z.string().optional(),
  reason: z.string().nullish(),
  attempts: z.number().optional(),
  max_attempts: z.number().optional(),
  due_at: z.string().nullish(),
});

type PlacementSection = z.infer<typeof placementSectionSchema>;

export type PlacementReport = { headline: string; detail: string | null };

/** The persisted check states, in the words a reader gets. */
const STATE_SATISFIED = 'satisfied';
const STATE_UNMET = 'unmet';
const STATE_PENDING = 'pending';

const CHANGE_HEADLINES: Record<string, string> = {
  brand_listed: 'You are listed on the page.',
  discrepancy_resolved: 'The page no longer says what was wrong.',
  placement_restored: 'Your placement on the page is back.',
  source_resolved: 'The source has been read and resolved.',
};

const UNAVAILABLE_REASONS: Record<string, string> = {
  no_frozen_baseline: 'Nothing had been read from this page when the work was declared.',
  roster_changed:
    'The brand or competitor roster changed since the baseline, so the two readings do not answer the same question.',
  insufficient_coverage: COVERAGE_TOO_THIN,
  no_brand_verdict: 'The reading produced no verdict for your brand.',
  unknown_expected_change: 'What was declared cannot be checked from the page itself.',
};

function section(result: VerificationResult | undefined): PlacementSection | null {
  const parsed = placementSectionSchema.safeParse(result?.placement);
  return parsed.success ? parsed.data : null;
}

function notObserved(placement: PlacementSection): PlacementReport {
  const more = placement.due_at !== null && placement.due_at !== undefined;
  const attempts =
    placement.attempts && placement.max_attempts
      ? ` Read ${placement.attempts} of ${placement.max_attempts} times.`
      : '';
  return {
    headline: 'The declared change is not on the page.',
    detail: more
      ? `The page will be read again.${attempts}`
      : `The page was read as often as it will be.${attempts}`,
  };
}

/**
 * The placement observation as a reader should be told it, or `null` when the
 * declaration has no placement to report — which is every owned-page action.
 */
export function placementReport(result: VerificationResult | undefined): PlacementReport | null {
  const placement = section(result);
  if (!placement) return null;
  if (placement.state === STATE_SATISFIED) {
    return {
      headline:
        CHANGE_HEADLINES[placement.expected_change ?? ''] ?? 'The declared change is on the page.',
      detail: 'A placement going live and visibility moving are separate observations.',
    };
  }
  if (placement.state === STATE_UNMET) return notObserved(placement);
  if (placement.state === STATE_PENDING) {
    return {
      headline: 'The page has not been read since this was declared.',
      detail: null,
    };
  }
  return {
    headline: 'This placement could not be confirmed.',
    detail: UNAVAILABLE_REASONS[placement.reason ?? ''] ?? null,
  };
}
