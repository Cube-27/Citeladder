import { policy } from '../../config.ts';
import { linksToOwned, listedInHeadings } from './page-predicates.ts';
const p = policy.opportunity.placement;
const e = policy.opportunity.earned_actions;
export type PlacementReading = {
  snapshot_id: string;
  roster_version: string;
  extracted_chars: number;
  brand_presence: string | null;
  brand_present: boolean;
  brand_match_count: number;
  outbound_domains: string[];
  headings: string[];
};
export type PlacementExpectation = {
  expected_change: string;
  brand_name: string;
  owned_domains: string[];
  discrepancies: string[];
};
const unavailable = (reason: string) => ({ state: p.PLACEMENT_STATE_UNAVAILABLE, reason });
const settled = (yes: boolean) => ({
  state: yes ? p.PLACEMENT_STATE_SATISFIED : p.PLACEMENT_STATE_UNMET,
  reason: null,
});
function correction(
  code: string,
  expectation: PlacementExpectation,
  obs: PlacementReading,
): boolean | null {
  if (code === e.DISCREPANCY_NOT_LISTED_AS_ENTRY)
    return obs.headings.length ? listedInHeadings(expectation.brand_name, obs.headings) : null;
  if (code === e.DISCREPANCY_OWNED_DOMAIN_MISSING)
    return obs.outbound_domains.length && expectation.owned_domains.length
      ? linksToOwned(obs.outbound_domains, expectation.owned_domains)
      : null;
  return null;
}
export function evaluatePlacement(
  expectation: PlacementExpectation,
  baseline: PlacementReading | null,
  observation: PlacementReading,
) {
  if (!baseline) return unavailable(p.PLACEMENT_REASON_NO_BASELINE);
  if (baseline.roster_version !== observation.roster_version)
    return unavailable(p.PLACEMENT_REASON_ROSTER_CHANGED);
  if (observation.extracted_chars < policy.opportunity.source_pages.SOURCE_PAGE_MIN_COVERAGE_CHARS)
    return unavailable(p.PLACEMENT_REASON_COVERAGE);
  if (observation.brand_presence === null) return unavailable(p.PLACEMENT_REASON_NO_VERDICT);
  switch (expectation.expected_change) {
    case p.PLACEMENT_CHANGE_BRAND_LISTED:
      return settled(observation.brand_present);
    case p.PLACEMENT_CHANGE_PLACEMENT_RESTORED:
      return settled(
        observation.brand_present && observation.brand_match_count >= baseline.brand_match_count,
      );
    case p.PLACEMENT_CHANGE_SOURCE_RESOLVED:
      return settled(true);
    case p.PLACEMENT_CHANGE_DISCREPANCY_RESOLVED: {
      const outcomes = expectation.discrepancies.map((code) =>
        correction(code, expectation, observation),
      );
      return !outcomes.length || outcomes.includes(null)
        ? unavailable(p.PLACEMENT_REASON_UNKNOWN_CHANGE)
        : settled(outcomes.every(Boolean));
    }
    default:
      return unavailable(p.PLACEMENT_REASON_UNKNOWN_CHANGE);
  }
}
