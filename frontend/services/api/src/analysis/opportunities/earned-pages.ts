import { policy } from '../../config.ts';
import { pyCompare } from '../../python/text.ts';
import { rules } from './detectors.ts';
import { brandOf, competitorsOf, earnedPageBrief } from './earned-page-brief.ts';
import type { DetectorHit, EarnedPageEvidence, SourcePageEvidence } from './evidence.ts';
import { linksToOwned, listedInHeadings } from './page-predicates.ts';
import { pageCompetitorPresenceFactor, pageRecurrenceFactor } from './scoring.ts';
const p = policy.opportunity.earned_actions;
const s = policy.opportunity.source_pages;
const relevant = (page: SourcePageEvidence) =>
  page.answer_count >= 1 && page.prompt_indices.length > 0;
const recurrent = (page: SourcePageEvidence, min: number) =>
  Math.max(page.recurrence_count, page.answer_count) >= min;
export function qualification(page: SourcePageEvidence): [boolean, string[]] {
  const missing: string[] = [];
  if (page.inspection_state !== s.INSPECTION_INSPECTED || page.snapshot_id === null)
    missing.push('not_inspected');
  if (!page.sufficient_coverage) missing.push('insufficient_coverage');
  if (!relevant(page)) missing.push('no_tracked_prompt');
  if (!recurrent(page, p.EARNED_PAGE_MIN_RECURRENCE)) missing.push('not_recurrent');
  if (!brandOf(page) || !page.roster_current) missing.push('entity_matching_unresolved');
  if (page.page_format === s.PAGE_FORMAT_UNRESOLVED) missing.push('page_format_unresolved');
  return [!missing.length, missing];
}
function deterioration(page: SourcePageEvidence): string[] {
  const prior = page.prior;
  const brand = brandOf(page);
  if (
    !prior?.brand_present ||
    !brand ||
    ![s.PRESENCE_PRESENT, s.PRESENCE_NOT_DETECTED].includes(brand.presence)
  )
    return [];
  const reasons: string[] = [];
  if (brand.presence === s.PRESENCE_NOT_DETECTED) reasons.push('brand_removed');
  else if (
    prior.content_hash &&
    page.content_hash &&
    prior.content_hash !== page.content_hash &&
    brand.match_count < prior.brand_match_count
  )
    reasons.push('placement_reduced');
  if (
    reasons.length &&
    competitorsOf(page).some((e) => !prior.present_competitors.includes(e.entity_name))
  )
    reasons.push('competitor_added');
  return reasons;
}
function discrepancies(page: SourcePageEvidence, owned: string[]): string[] {
  const brand = brandOf(page);
  if (brand?.presence !== s.PRESENCE_PRESENT) return [];
  const result: string[] = [];
  if (
    p.EARNED_PAGE_INCLUDABLE_FORMATS.includes(page.page_format) &&
    page.headings.length &&
    !listedInHeadings(brand.entity_name, page.headings) &&
    competitorsOf(page).some((e) => listedInHeadings(e.entity_name, page.headings))
  )
    result.push(p.DISCREPANCY_NOT_LISTED_AS_ENTRY);
  if (owned.length && page.outbound_domains.length && !linksToOwned(page.outbound_domains, owned))
    result.push(p.DISCREPANCY_OWNED_DOMAIN_MISSING);
  return result;
}
function selectedAction(
  page: SourcePageEvidence,
  owned: string[],
): [string, Record<string, unknown>] | null {
  const reduced = deterioration(page);
  if (reduced.length)
    return [
      p.RULE_EARNED_PAGE_DEFEND,
      { deterioration: reduced, prior_snapshot_id: page.prior?.snapshot_id ?? null },
    ];
  if (
    p.EARNED_PAGE_INCLUDABLE_FORMATS.includes(page.page_format) &&
    competitorsOf(page).length &&
    brandOf(page)?.presence === s.PRESENCE_NOT_DETECTED
  )
    return [p.RULE_EARNED_PAGE_ACQUIRE, {}];
  const wrong = discrepancies(page, owned);
  return wrong.length ? [p.RULE_EARNED_PAGE_CORRECT, { discrepancies: wrong }] : null;
}
function research(page: SourcePageEvidence): [string, Record<string, unknown>] | null {
  if (!relevant(page)) return null;
  if (
    [s.INSPECTION_NOT_INSPECTED, s.INSPECTION_QUEUED, s.INSPECTION_FAILED].includes(
      page.inspection_state,
    ) &&
    !page.requested
  )
    return null;
  if (!page.requested && !recurrent(page, p.EARNED_PAGE_RESEARCH_MIN_RECURRENCE)) return null;
  return [p.RULE_EARNED_PAGE_RESEARCH, { requested: page.requested }];
}
export function detectEarnedPageOpportunities(evidence: EarnedPageEvidence): DetectorHit[] {
  return [...evidence.pages]
    .sort((a, b) => pyCompare(a.url_hash, b.url_hash))
    .flatMap((page) => {
      const [qualified, missing] = qualification(page);
      const selected = qualified ? selectedAction(page, evidence.owned_domains) : research(page);
      if (!selected || !rules[selected[0]]!.enabled) return [];
      const [rule, extra] = selected;
      const value = pageRecurrenceFactor(page.answer_count, evidence.eligible_answers);
      const gap = pageCompetitorPresenceFactor(competitorsOf(page).length);
      return [
        {
          rule_id: rule,
          target_key: `${p.EARNED_PAGE_TARGET_PREFIX}${page.url_hash}`,
          target_prompt_id: null,
          target_url: page.canonical_url,
          target_theme: page.themes[0] ?? null,
          evidence: {
            content_handoff: earnedPageBrief(rule, page, evidence, qualified, missing, extra),
            priority_factors: {
              page_recurrence_factor: value,
              page_competitor_presence_factor: gap,
            },
          },
          source_analysis_ids: [...page.analysis_ids],
          source_issue_ids: [],
          source_metric_ids: [],
          value_factor: value,
          gap_factor: gap,
          title_override: null,
          remediation_override: null,
        },
      ];
    });
}
