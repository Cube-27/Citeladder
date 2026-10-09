/**
 * Reader-side helpers for an earned-page action: competitors are on a cited
 * page and the brand is not. The copy states what was observed on the page
 * rather than how it was derived.
 */
import type { OpportunityDetail } from '@/lib/api/types';
import { formatCount } from '@/lib/format';

type ContentHandoff = OpportunityDetail['content_handoff'];
export type HandoffPageEntity = NonNullable<ContentHandoff['page_entities']>[number];

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
export function coverageSentence(extractedChars: number | undefined): string | null {
  if (!extractedChars) return null;
  return `${formatCount(extractedChars)} characters of this page were readable.`;
}
