/**
 * Reader-side vocabulary for an earned-page action.
 *
 * The backend names what it found in its own tokens — `earned_page_acquire_
 * listing`, `not_listed_as_entry`, `brand_removed`. This is the one place they
 * become sentences, on the same terms as the rest of the visibility
 * vocabulary: an unmapped token renders as nothing rather than leaking, and
 * the copy states what was observed rather than how it was derived.
 */
import type { OpportunityDetail } from '@/lib/api/types';

type ContentHandoff = OpportunityDetail['content_handoff'];
export type HandoffPageEntity = NonNullable<ContentHandoff['page_entities']>[number];

/** What the human is being asked to do, per rule. */
const RULE_INTENT: Record<string, string> = {
  earned_page_acquire_listing: 'Get listed on this page. Competitors are on it and you are not.',
  earned_page_correct_listing:
    'Correct what this page says about you. You are on it, and something specific is wrong.',
  earned_page_defend_listing:
    'Your placement on this page got worse. Find out what changed and put it right.',
  earned_page_research_source:
    'Look at this source. It comes up often enough to matter and something about it is unresolved.',
};

/** A named, checkable disagreement between the page and reviewed brand facts. */
const DISCREPANCY_LABELS: Record<string, string> = {
  not_listed_as_entry:
    'You are described in the body but have no entry of your own, while rivals do.',
  owned_domain_missing: 'The page links out to rivals and to none of your domains.',
};

/** How a placement we held got worse since the last usable reading. */
const DETERIORATION_LABELS: Record<string, string> = {
  brand_removed: 'You were on this page at the last reading and are not now.',
  placement_reduced: 'The page changed and you are mentioned less than you were.',
  competitor_added: 'A competitor appeared beside you that was not there before.',
};

/** Why an action could not be qualified — what the research task asks about. */
const UNMET_LABELS: Record<string, string> = {
  not_inspected: 'Nobody has read this page yet.',
  insufficient_coverage: 'Too little of the page was readable to judge it.',
  no_tracked_prompt: 'No prompt you track led to this page.',
  not_recurrent: 'This page has not come up often enough to act on.',
  entity_matching_unresolved: 'The brand and competitor roster changed since this page was read.',
  page_format_unresolved: 'What kind of page this is could not be established.',
};

function labelsFor(map: Record<string, string>, tokens: readonly string[] | undefined): string[] {
  return (tokens ?? [])
    .map((token) => map[token])
    .filter((label): label is string => Boolean(label));
}

export function ruleIntent(ruleId: string | undefined): string | null {
  return ruleId ? (RULE_INTENT[ruleId] ?? null) : null;
}

export function discrepancyLabels(tokens: readonly string[] | undefined): string[] {
  return labelsFor(DISCREPANCY_LABELS, tokens);
}

export function deteriorationLabels(tokens: readonly string[] | undefined): string[] {
  return labelsFor(DETERIORATION_LABELS, tokens);
}

export function unmetLabels(tokens: readonly string[] | undefined): string[] {
  return labelsFor(UNMET_LABELS, tokens);
}

/**
 * The rivals found ON the page, with the quoted line behind each.
 *
 * Read from the presence verdicts rather than from `observed_competitors`,
 * which carries the names only. A name whose passage was dropped is the claim
 * this feature exists to stop making.
 */
export function onPageCompetitors(entities: readonly HandoffPageEntity[] | undefined) {
  return (entities ?? []).filter(
    (entity) => entity.entity_kind !== 'brand' && entity.presence === 'present',
  );
}

/** The brand's own verdict on the page, when one was taken. */
export function brandVerdict(
  entities: readonly HandoffPageEntity[] | undefined,
): HandoffPageEntity | null {
  return (entities ?? []).find((entity) => entity.entity_kind === 'brand') ?? null;
}

/**
 * How thoroughly the page was read, stated wherever a finding is stated.
 *
 * Returns `null` when nothing was read: there is no coverage to report, and
 * printing "0 characters" beside a verdict would imply a reading that never
 * happened.
 */
export function coverageSentence(
  extractedChars: number | undefined,
  sufficient: boolean | undefined,
): string | null {
  if (!extractedChars) return null;
  const read = `${extractedChars.toLocaleString()} characters of this page were readable`;
  return sufficient === false
    ? `${read} — not enough to treat an absence as evidence.`
    : `${read}.`;
}
