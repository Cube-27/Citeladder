"""The grounded brief one earned-page task hands to Content.

Travels on the hit as ``evidence.content_handoff``, so it reaches Content
through the projection the Opportunity owner already publishes rather than a
second handoff path.

The output type follows the PAGE, not the publisher. A comparison page needs
comparison copy whoever runs it, and mapping every earned action onto a
generic article is what made the previous briefs interchangeable.

Nothing here can manufacture placement evidence. Every positive claim resolves
to a snapshot and a quoted passage; an absence carries the extraction coverage
and the matching method instead, because no passage can prove one.
"""

from __future__ import annotations

from app.analysis.opportunities.earned_page_evidence import (
    EarnedPageEvidence,
    SourcePageEvidence,
)
from app.core.config.earned_actions import (
    ACTION_PATH_EARNED,
    EARNED_PAGE_DEFAULT_ROLE,
    EARNED_PAGE_DEFAULT_SKILL,
    EARNED_PAGE_MAX_COMPETITORS,
    EARNED_PAGE_MAX_PASSAGES,
    EARNED_PAGE_MAX_PROMPTS,
    EARNED_PAGE_ROLE_BY_FORMAT,
    EARNED_PAGE_SKILL_BY_FORMAT,
    RULE_EARNED_PAGE_RESEARCH,
)
from app.core.config.source_pages import (
    SOURCE_PAGE_FORMAT_VERSION,
    SOURCE_PAGE_INSPECTOR_VERSION,
    SOURCE_PAGE_PRESENCE_VERSION,
)
from app.core.config.source_patterns import CONTENT_HANDOFF_TEMPLATE_VERSION

__all__ = ["earned_page_brief"]

_ABSENCE_LIMITATION = (
    "No passage can demonstrate an absence. This reports how much of the page"
    " was readable and how names were matched, not proof that the brand is"
    " missing."
)
_COOCCURRENCE_LIMITATION = (
    "Competitors named in the answers that cited this page are listed"
    " separately from competitors found ON the page. Only the latter affected"
    " this task's priority."
)
_RESEARCH_LIMITATION = (
    "This is a request to look, not a recommended action. What is unresolved"
    " is listed above."
)
_PLACEMENT_LIMITATION = (
    "Inclusion is a publisher's decision. A placement going live and"
    " visibility moving are separate observations and may disagree."
)


def _entity_rows(page: SourcePageEvidence) -> list[dict]:
    """Every verdict, with its passages, its method and its match count."""
    return [
        {
            "entity_kind": entity.entity_kind,
            "entity_name": entity.entity_name,
            "presence": entity.presence,
            "match_method": entity.match_method,
            "match_count": entity.match_count,
            "passages": list(entity.passages[:EARNED_PAGE_MAX_PASSAGES]),
        }
        for entity in page.entities
    ]


def _limitations(
    *, rule_id: str, page: SourcePageEvidence, evidence: EarnedPageEvidence
) -> list[str]:
    limitations = [_PLACEMENT_LIMITATION, _COOCCURRENCE_LIMITATION]
    brand = page.brand
    if brand is not None and not brand.is_present:
        limitations.append(_ABSENCE_LIMITATION)
    if rule_id == RULE_EARNED_PAGE_RESEARCH:
        limitations.append(_RESEARCH_LIMITATION)
    if not page.roster_current:
        limitations.append(
            "The brand or competitor roster changed after this page was read,"
            " so these verdicts describe an earlier roster."
        )
    if evidence.total_pages and evidence.inspected_pages < evidence.total_pages:
        limitations.append(
            f"{evidence.inspected_pages} of {evidence.total_pages} cited pages"
            " in this project have been inspected; the rest are inventory, not"
            " findings."
        )
    return limitations


def earned_page_brief(
    *,
    rule_id: str,
    page: SourcePageEvidence,
    evidence: EarnedPageEvidence,
    qualified: bool,
    unmet: tuple[str, ...],
    extra: dict,
) -> dict:
    """The bounded Content handoff for one earned-page task."""
    on_page = [entity.entity_name for entity in page.present_competitors]
    entity_rows = _entity_rows(page)
    # Every bound this brief applies, not just the first two. A reader who
    # acts on a truncated list without being told it was truncated is acting
    # on a partial picture, and which field ran short does not change that.
    truncated = (
        len(page.prompt_indices) > EARNED_PAGE_MAX_PROMPTS
        or len(page.themes) > EARNED_PAGE_MAX_PROMPTS
        or len(page.answer_competitors) > EARNED_PAGE_MAX_COMPETITORS
        or len(on_page) > EARNED_PAGE_MAX_COMPETITORS
        or any(
            len(entity.passages) > EARNED_PAGE_MAX_PASSAGES for entity in page.entities
        )
    )
    return {
        "pathway": ACTION_PATH_EARNED,
        "rule_id": rule_id,
        # The page, and only this page. A format established here never
        # reclassifies the publisher, whose class travels beside it unchanged.
        "target_url": page.canonical_url,
        "url_hash": page.url_hash,
        "canonical_domain": page.registrable_domain,
        "source_class": page.source_class,
        "page_format": page.page_format,
        "page_format_method": page.page_format_method,
        "page_title": page.title,
        "target_theme": next(iter(page.themes), None),
        "suggested_skill_id": EARNED_PAGE_SKILL_BY_FORMAT.get(
            page.page_format, EARNED_PAGE_DEFAULT_SKILL
        ),
        "suggested_role": EARNED_PAGE_ROLE_BY_FORMAT.get(
            page.page_format, EARNED_PAGE_DEFAULT_ROLE
        ),
        # What was actually found, with the evidence for it.
        "snapshot_id": page.snapshot_id,
        "inspection_state": page.inspection_state,
        "inspection_reason": page.inspection_reason,
        "extracted_chars": page.extracted_chars,
        "sufficient_coverage": page.sufficient_coverage,
        "page_entities": entity_rows,
        # The shared handoff field every reader already renders, carrying
        # the competitors found ON THE PAGE -- the ones the action is about.
        # ``answer_competitors`` is the looser answer-level set, kept
        # separate and labelled, and never scored. Collapsing the two is the
        # defect this detector replaces.
        "observed_competitors": on_page[:EARNED_PAGE_MAX_COMPETITORS],
        "answer_competitors": list(page.answer_competitors)[
            :EARNED_PAGE_MAX_COMPETITORS
        ],
        # Why this page matters, from the audit that cited it.
        "affected_prompt_indices": list(page.prompt_indices)[:EARNED_PAGE_MAX_PROMPTS],
        "affected_themes": list(page.themes)[:EARNED_PAGE_MAX_PROMPTS],
        "observed_citation_frequency": {
            "answers_citing_page": page.answer_count,
            "eligible_answers": evidence.eligible_answers,
        },
        "coverage": {
            "inspected_pages": evidence.inspected_pages,
            "total_pages": evidence.total_pages,
        },
        # The shared handoff shape. One page is one cited source, so the
        # representative list has exactly one entry: this page.
        "representative_citations": [{"url": page.canonical_url, "title": page.title}],
        "truncated": truncated,
        "qualified": qualified,
        "unmet_qualification": list(unmet),
        "source_analysis_ids": list(page.analysis_ids),
        "limitations": _limitations(rule_id=rule_id, page=page, evidence=evidence),
        "inspector_version": SOURCE_PAGE_INSPECTOR_VERSION,
        "presence_version": SOURCE_PAGE_PRESENCE_VERSION,
        "page_format_version": SOURCE_PAGE_FORMAT_VERSION,
        "handoff_template_version": CONTENT_HANDOFF_TEMPLATE_VERSION,
        **extra,
    }
