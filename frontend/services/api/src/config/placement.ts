/** Placement and visibility are separate observations. Unavailable never means unmet.
 * Retry only coverage/missing-verdict results; changed rosters require a new baseline.
 */
export const placement = {
  PLACEMENT_CHECK_KIND: 'placement',
  PLACEMENT_CHANGE_BRAND_LISTED: 'brand_listed',
  PLACEMENT_CHANGE_DISCREPANCY_RESOLVED: 'discrepancy_resolved',
  PLACEMENT_CHANGE_PLACEMENT_RESTORED: 'placement_restored',
  PLACEMENT_CHANGE_SOURCE_RESOLVED: 'source_resolved',
  PLACEMENT_STATE_SATISFIED: 'satisfied',
  PLACEMENT_STATE_UNMET: 'unmet',
  PLACEMENT_STATE_UNAVAILABLE: 'unavailable',
  PLACEMENT_REASON_NO_BASELINE: 'no_frozen_baseline',
  PLACEMENT_REASON_ROSTER_CHANGED: 'roster_changed',
  PLACEMENT_REASON_COVERAGE: 'insufficient_coverage',
  PLACEMENT_REASON_NO_VERDICT: 'no_brand_verdict',
  PLACEMENT_REASON_UNKNOWN_CHANGE: 'unknown_expected_change',
  PLACEMENT_REASON_EXHAUSTED: 'recheck_attempts_exhausted',
  PLACEMENT_RETRYABLE_REASONS: ['insufficient_coverage', 'no_brand_verdict'],
  PLACEMENT_RECHECK_AFTER_HOURS: 72,
  PLACEMENT_RECHECK_INTERVAL_HOURS: 168,
  PLACEMENT_RECHECK_MAX_ATTEMPTS: 4,
  PLACEMENT_DUE_PAGES_MAX: 100,
};
