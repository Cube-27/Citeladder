"""What a page-keyed earned task is allowed to claim, and when it stays silent.

The defects this detector replaces were all of one kind: a confident action
produced from evidence that did not support it. A domain name standing in for
a page, a competitor named in prose raising an unrelated page's priority, and
an unresolved source dropped below the surfacing floor without a trace. The
tests below are mostly about the cases that must produce NOTHING.
"""

from __future__ import annotations

import pytest

from app.analysis.opportunities.earned_page_evidence import (
    EarnedPageEvidence,
    PageEntityEvidence,
    PriorPageEvidence,
    SourcePageEvidence,
)
from app.analysis.opportunities.earned_pages import (
    DISCREPANCY_NOT_LISTED_AS_ENTRY,
    DISCREPANCY_OWNED_DOMAIN_MISSING,
    detect_earned_page_opportunities,
)
from app.analysis.opportunities.scoring import (
    page_competitor_presence_factor,
    priority_score,
)
from app.core.config.earned_actions import (
    RULE_EARNED_PAGE_ACQUIRE,
    RULE_EARNED_PAGE_CORRECT,
    RULE_EARNED_PAGE_DEFEND,
    RULE_EARNED_PAGE_RESEARCH,
)
from app.core.config.opportunities import (
    MIN_PRIORITY_TO_SURFACE,
    OPPORTUNITY_RULES_BY_ID,
    SEVERITY_INFO,
)
from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    ENTITY_KIND_COMPETITOR,
    INSPECTION_BLOCKED,
    INSPECTION_FAILED,
    INSPECTION_INSPECTED,
    INSPECTION_NOT_INSPECTED,
    PAGE_FORMAT_ARTICLE,
    PAGE_FORMAT_COMPARISON,
    PAGE_FORMAT_UNRESOLVED,
    PRESENCE_AMBIGUOUS,
    PRESENCE_MATCH_EXACT_ALIAS,
    PRESENCE_MATCH_NONE,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PARTIAL,
    PRESENCE_PRESENT,
)

_BRAND = "Acme"
_RIVAL = "Globex"


def _brand(presence: str = PRESENCE_PRESENT, *, count: int = 2) -> PageEntityEvidence:
    return PageEntityEvidence(
        entity_kind=ENTITY_KIND_BRAND,
        entity_name=_BRAND,
        presence=presence,
        match_method=(
            PRESENCE_MATCH_EXACT_ALIAS
            if presence == PRESENCE_PRESENT
            else PRESENCE_MATCH_NONE
        ),
        match_count=count if presence == PRESENCE_PRESENT else 0,
        passages=("Acme is a customer platform.",)
        if presence == PRESENCE_PRESENT
        else (),
    )


def _competitor(
    name: str = _RIVAL, presence: str = PRESENCE_PRESENT
) -> PageEntityEvidence:
    return PageEntityEvidence(
        entity_kind=ENTITY_KIND_COMPETITOR,
        entity_name=name,
        presence=presence,
        match_method=(
            PRESENCE_MATCH_EXACT_ALIAS
            if presence == PRESENCE_PRESENT
            else PRESENCE_MATCH_NONE
        ),
        match_count=3 if presence == PRESENCE_PRESENT else 0,
        passages=(f"{name} leads the category.",)
        if presence == PRESENCE_PRESENT
        else (),
    )


def _page(**overrides) -> SourcePageEvidence:
    base = {
        "url_hash": "a" * 64,
        "canonical_url": "https://review.example/best-crm",
        "registrable_domain": "review.example",
        "page_format": PAGE_FORMAT_COMPARISON,
        "page_format_method": "heading_evidence",
        "inspection_state": INSPECTION_INSPECTED,
        "inspection_reason": None,
        "snapshot_id": "snap-1",
        "extracted_chars": 4000,
        "sufficient_coverage": True,
        "title": "Best CRM tools",
        "headings": ("Globex", "Initech"),
        "outbound_domains": ("globex.example",),
        "content_hash": "hash-1",
        "entities": (_brand(PRESENCE_NOT_DETECTED), _competitor()),
        "prior": None,
        "roster_current": True,
        "recurrence_count": 4,
        "answer_count": 3,
        "prompt_indices": (0, 1),
        "themes": ("crm",),
        "analysis_ids": ("analysis-1",),
        "answer_competitors": ("Unrelated Co",),
    }
    return SourcePageEvidence(**{**base, **overrides})


def _evidence(*pages: SourcePageEvidence, **overrides) -> EarnedPageEvidence:
    base = {
        "pages": pages,
        "owned_domains": ("acme.example",),
        "eligible_answers": 6,
        "inspected_pages": len(pages),
        "total_pages": len(pages),
    }
    return EarnedPageEvidence(**{**base, **overrides})


def _rules(hits) -> list[str]:
    return [hit.rule_id for hit in hits]


def test_competitors_present_and_brand_absent_acquires_a_listing():
    hits = detect_earned_page_opportunities(_evidence(_page()))

    assert _rules(hits) == [RULE_EARNED_PAGE_ACQUIRE]
    assert hits[0].target_key == f"earned-page:{'a' * 64}"
    # The page URL, not a domain: this is what makes a declaration reachable.
    assert hits[0].target_url == "https://review.example/best-crm"


def test_both_brands_present_on_a_healthy_page_produces_no_task():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(_brand(), _competitor()),
                headings=("Acme", "Globex"),
                outbound_domains=("acme.example", "globex.example"),
            )
        )
    )

    assert hits == []


def test_a_placement_that_disappeared_defends_rather_than_acquires():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(_brand(PRESENCE_NOT_DETECTED), _competitor()),
                prior=PriorPageEvidence(
                    snapshot_id="snap-0",
                    brand_present=True,
                    brand_match_count=2,
                    present_competitors=(_RIVAL,),
                    content_hash="hash-0",
                ),
            )
        )
    )

    assert _rules(hits) == [RULE_EARNED_PAGE_DEFEND]
    handoff = hits[0].evidence["content_handoff"]
    assert "brand_removed" in handoff["deterioration"]
    assert handoff["prior_snapshot_id"] == "snap-0"


def test_defence_needs_a_prior_snapshot_to_deteriorate_from():
    """A first inspection finding no brand is an absence, not a loss."""
    hits = detect_earned_page_opportunities(_evidence(_page(prior=None)))

    assert _rules(hits) == [RULE_EARNED_PAGE_ACQUIRE]


def test_a_new_competitor_beside_a_kept_placement_is_not_deterioration():
    """Both present stays the healthy watch state, rival or no rival.

    Otherwise every page a competitor ever joins becomes a task, and the
    thing that supposedly deteriorated is a placement we still hold.
    """
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(_brand(), _competitor(), _competitor("Initech")),
                headings=("Acme", "Globex", "Initech"),
                outbound_domains=("acme.example",),
                prior=PriorPageEvidence(
                    snapshot_id="snap-0",
                    brand_present=True,
                    brand_match_count=2,
                    present_competitors=(_RIVAL,),
                    content_hash="hash-0",
                ),
            )
        )
    )

    assert hits == []


def test_a_new_competitor_qualifies_a_placement_that_did_deteriorate():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(
                    _brand(PRESENCE_NOT_DETECTED),
                    _competitor(),
                    _competitor("Initech"),
                ),
                prior=PriorPageEvidence(
                    snapshot_id="snap-0",
                    brand_present=True,
                    brand_match_count=2,
                    present_competitors=(_RIVAL,),
                    content_hash="hash-0",
                ),
            )
        )
    )

    assert _rules(hits) == [RULE_EARNED_PAGE_DEFEND]
    assert hits[0].evidence["content_handoff"]["deterioration"] == [
        "brand_removed",
        "competitor_added",
    ]


def test_an_unsettled_brand_verdict_is_not_a_removed_placement():
    """A reading that could not settle it is not the publisher taking us down."""
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(_brand(PRESENCE_AMBIGUOUS), _competitor()),
                prior=PriorPageEvidence(
                    snapshot_id="snap-0",
                    brand_present=True,
                    brand_match_count=2,
                    present_competitors=(_RIVAL,),
                    content_hash="hash-0",
                ),
            )
        )
    )

    assert hits == []


def test_brand_present_but_not_an_entry_is_a_correction():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(_brand(), _competitor()),
                headings=("Globex", "Initech"),
                outbound_domains=("acme.example", "globex.example"),
            )
        )
    )

    assert _rules(hits) == [RULE_EARNED_PAGE_CORRECT]
    handoff = hits[0].evidence["content_handoff"]
    assert handoff["discrepancies"] == [DISCREPANCY_NOT_LISTED_AS_ENTRY]


def test_a_listing_that_links_every_rival_but_not_us_is_a_correction():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(_brand(), _competitor()),
                headings=("Acme", "Globex"),
                outbound_domains=("globex.example", "initech.example"),
            )
        )
    )

    handoff = hits[0].evidence["content_handoff"]
    assert handoff["discrepancies"] == [DISCREPANCY_OWNED_DOMAIN_MISSING]


def test_brand_presence_alone_never_produces_a_correction():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(_brand(), _competitor()),
                headings=("Acme", "Globex"),
                outbound_domains=(),
            )
        )
    )

    assert hits == []


def test_an_article_admits_no_new_entrant_so_absence_is_not_an_action():
    """A page ABOUT a company is not a place a second company can be added."""
    hits = detect_earned_page_opportunities(
        _evidence(_page(page_format=PAGE_FORMAT_ARTICLE, headings=("Globex raises",)))
    )

    assert hits == []


@pytest.mark.parametrize(
    ("overrides", "unresolved"),
    [
        ({"page_format": PAGE_FORMAT_UNRESOLVED}, "page_format_unresolved"),
        (
            {"sufficient_coverage": False, "extracted_chars": 80},
            "insufficient_coverage",
        ),
        ({"roster_current": False}, "entity_matching_unresolved"),
    ],
)
def test_an_unqualified_recurring_source_becomes_research_not_an_action(
    overrides, unresolved
):
    hits = detect_earned_page_opportunities(_evidence(_page(**overrides)))

    assert _rules(hits) == [RULE_EARNED_PAGE_RESEARCH]
    assert unresolved in hits[0].evidence["content_handoff"]["unmet_qualification"]


def test_research_scores_above_the_surfacing_floor():
    """``low``, not ``info``: an info hit at base factors is silently dropped.

    This is the exact defect the page-keyed rules exist to remove, so the
    arithmetic is asserted rather than trusted to the catalog.
    """
    rule = OPPORTUNITY_RULES_BY_ID[RULE_EARNED_PAGE_RESEARCH]
    assert rule.severity != SEVERITY_INFO
    assert (
        priority_score(severity=rule.severity, value_factor=1.0, gap_factor=1.0)
        >= MIN_PRIORITY_TO_SURFACE
    )
    assert (
        priority_score(severity=SEVERITY_INFO, value_factor=1.0, gap_factor=1.0)
        < MIN_PRIORITY_TO_SURFACE
    )


def test_a_routine_fetch_failure_is_a_source_state_not_an_opportunity():
    """It will be retried; a state the next run clears is not a human's task."""
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                inspection_state=INSPECTION_FAILED,
                inspection_reason="transport_error",
                snapshot_id=None,
                entities=(),
            )
        )
    )

    assert hits == []


def test_an_uninspected_page_alone_earns_nothing_unless_asked_for():
    uninspected = {
        "inspection_state": INSPECTION_NOT_INSPECTED,
        "snapshot_id": None,
        "entities": (_brand(), _competitor()),
        "page_format": PAGE_FORMAT_COMPARISON,
    }
    silent = detect_earned_page_opportunities(_evidence(_page(**uninspected)))
    asked = detect_earned_page_opportunities(
        _evidence(_page(**uninspected, requested=True))
    )

    assert silent == []
    assert _rules(asked) == [RULE_EARNED_PAGE_RESEARCH]


def test_an_incidental_single_citation_is_inventory_not_a_task():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                recurrence_count=1,
                answer_count=1,
                page_format=PAGE_FORMAT_UNRESOLVED,
            )
        )
    )

    assert hits == []


def test_a_blocked_publisher_page_is_research_because_it_never_self_resolves():
    """Unlike a retryable failure, a refusal stands until a person acts."""
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                inspection_state=INSPECTION_BLOCKED,
                inspection_reason="robots_disallowed",
                snapshot_id="snap-1",
                entities=(),
            )
        )
    )

    assert _rules(hits) == [RULE_EARNED_PAGE_RESEARCH]
    assert hits[0].evidence["content_handoff"]["inspection_state"] == INSPECTION_BLOCKED


def test_only_on_page_presence_moves_the_priority():
    """A competitor named in an answer must not raise an unrelated page."""
    on_page = detect_earned_page_opportunities(_evidence(_page()))[0]
    in_answers_only = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(_brand(PRESENCE_NOT_DETECTED),),
                answer_competitors=("Globex", "Initech", "Hooli"),
            )
        )
    )

    assert on_page.gap_factor == page_competitor_presence_factor(1)
    # No competitor found ON the page, so no acquisition and no boost.
    assert in_answers_only == []


def test_an_ambiguous_match_is_not_presence():
    """A normalized-text match has no quotable window, so it proves nothing."""
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                entities=(
                    _brand(PRESENCE_NOT_DETECTED),
                    _competitor(presence=PRESENCE_AMBIGUOUS),
                )
            )
        )
    )

    assert hits == []


def test_a_partial_read_never_reports_an_absence_as_an_action():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(
                sufficient_coverage=False,
                extracted_chars=120,
                entities=(_brand(PRESENCE_PARTIAL), _competitor()),
            )
        )
    )

    assert _rules(hits) == [RULE_EARNED_PAGE_RESEARCH]


def test_the_brief_separates_on_page_competitors_from_answer_competitors():
    handoff = detect_earned_page_opportunities(_evidence(_page()))[0].evidence[
        "content_handoff"
    ]

    assert handoff["observed_competitors"] == [_RIVAL]
    assert handoff["answer_competitors"] == ["Unrelated Co"]
    assert handoff["suggested_skill_id"] == "comparison"
    assert handoff["snapshot_id"] == "snap-1"


def test_the_brief_qualifies_an_absence_with_its_coverage():
    handoff = detect_earned_page_opportunities(_evidence(_page()))[0].evidence[
        "content_handoff"
    ]
    brand = next(
        row
        for row in handoff["page_entities"]
        if row["entity_kind"] == ENTITY_KIND_BRAND
    )

    assert brand["passages"] == []
    assert handoff["extracted_chars"] == 4000
    assert any("absence" in note for note in handoff["limitations"])


def test_two_pages_on_one_domain_produce_two_tasks():
    hits = detect_earned_page_opportunities(
        _evidence(
            _page(),
            _page(
                url_hash="b" * 64,
                canonical_url="https://review.example/crm-alternatives",
            ),
        )
    )

    assert len(hits) == 2
    assert {hit.target_key for hit in hits} == {
        f"earned-page:{'a' * 64}",
        f"earned-page:{'b' * 64}",
    }
