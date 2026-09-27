import { policy } from '../../config.ts';
import type { EarnedPageEvidence, SourcePageEvidence } from './evidence.ts';
const p = policy.opportunity.earned_actions;
const s = policy.opportunity.source_pages;
export const brandOf = (page: SourcePageEvidence) =>
  page.entities.find((e) => e.entity_kind === s.ENTITY_KIND_BRAND);
export const competitorsOf = (page: SourcePageEvidence) =>
  page.entities.filter(
    (e) => e.entity_kind === s.ENTITY_KIND_COMPETITOR && e.presence === s.PRESENCE_PRESENT,
  );
function limitations(
  rule: string,
  page: SourcePageEvidence,
  evidence: EarnedPageEvidence,
): string[] {
  const result = [
    "Inclusion is a publisher's decision. A placement going live and visibility moving are separate observations and may disagree.",
    "Competitors named in the answers that cited this page are listed separately from competitors found ON the page. Only the latter affected this task's priority.",
  ];
  const brand = brandOf(page);
  if (brand && brand.presence !== s.PRESENCE_PRESENT)
    result.push(
      'No passage can demonstrate an absence. This reports how much of the page was readable and how names were matched, not proof that the brand is missing.',
    );
  if (rule === p.RULE_EARNED_PAGE_RESEARCH)
    result.push(
      'This is a request to look, not a recommended action. What is unresolved is listed above.',
    );
  if (!page.roster_current)
    result.push(
      'The brand or competitor roster changed after this page was read, so these verdicts describe an earlier roster.',
    );
  if (evidence.total_pages && evidence.inspected_pages < evidence.total_pages)
    result.push(
      `${evidence.inspected_pages} of ${evidence.total_pages} cited pages in this project have been inspected; the rest are inventory, not findings.`,
    );
  return result;
}
export function earnedPageBrief(
  rule: string,
  page: SourcePageEvidence,
  evidence: EarnedPageEvidence,
  qualified: boolean,
  unmet: string[],
  extra: Record<string, unknown>,
) {
  const onPage = competitorsOf(page).map((e) => e.entity_name);
  const truncated =
    page.prompt_indices.length > p.EARNED_PAGE_MAX_PROMPTS ||
    page.themes.length > p.EARNED_PAGE_MAX_PROMPTS ||
    page.answer_competitors.length > p.EARNED_PAGE_MAX_COMPETITORS ||
    onPage.length > p.EARNED_PAGE_MAX_COMPETITORS ||
    page.entities.some((e) => e.passages.length > p.EARNED_PAGE_MAX_PASSAGES);
  return {
    pathway: p.ACTION_PATH_EARNED,
    rule_id: rule,
    target_url: page.canonical_url,
    url_hash: page.url_hash,
    canonical_domain: page.registrable_domain,
    source_class: page.source_class,
    page_format: page.page_format,
    page_format_method: page.page_format_method,
    page_title: page.title,
    target_theme: page.themes[0] ?? null,
    suggested_skill_id:
      (p.EARNED_PAGE_SKILL_BY_FORMAT as Record<string, string>)[page.page_format] ??
      p.EARNED_PAGE_DEFAULT_SKILL,
    suggested_role:
      (p.EARNED_PAGE_ROLE_BY_FORMAT as Record<string, string>)[page.page_format] ??
      p.EARNED_PAGE_DEFAULT_ROLE,
    snapshot_id: page.snapshot_id,
    inspection_state: page.inspection_state,
    inspection_reason: page.inspection_reason,
    extracted_chars: page.extracted_chars,
    sufficient_coverage: page.sufficient_coverage,
    page_entities: page.entities.map((e) => ({
      entity_kind: e.entity_kind,
      entity_name: e.entity_name,
      presence: e.presence,
      match_method: e.match_method,
      match_count: e.match_count,
      passages: e.passages.slice(0, p.EARNED_PAGE_MAX_PASSAGES),
    })),
    observed_competitors: onPage.slice(0, p.EARNED_PAGE_MAX_COMPETITORS),
    answer_competitors: page.answer_competitors.slice(0, p.EARNED_PAGE_MAX_COMPETITORS),
    affected_prompt_indices: page.prompt_indices.slice(0, p.EARNED_PAGE_MAX_PROMPTS),
    affected_themes: page.themes.slice(0, p.EARNED_PAGE_MAX_PROMPTS),
    observed_citation_frequency: {
      answers_citing_page: page.answer_count,
      eligible_answers: evidence.eligible_answers,
    },
    coverage: { inspected_pages: evidence.inspected_pages, total_pages: evidence.total_pages },
    representative_citations: [{ url: page.canonical_url, title: page.title }],
    truncated,
    qualified,
    unmet_qualification: unmet,
    source_analysis_ids: [...page.analysis_ids],
    limitations: limitations(rule, page, evidence),
    inspector_version: s.SOURCE_PAGE_INSPECTOR_VERSION,
    presence_version: s.SOURCE_PAGE_PRESENCE_VERSION,
    page_format_version: s.SOURCE_PAGE_FORMAT_VERSION,
    handoff_template_version: policy.opportunity.source_patterns.CONTENT_HANDOFF_TEMPLATE_VERSION,
    ...extra,
  };
}
