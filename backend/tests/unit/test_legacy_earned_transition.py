"""What a retired domain decision may and may not do to the pages under it.

A domain-level judgement does not distribute across pages. Marking a
publisher in progress because someone is contacting the author of one article
says nothing about five other articles on that domain, and dismissing one
vague domain suggestion does not dismiss every future inclusion on it. So the
carry is narrow on purpose, and most of these assert that it stayed narrow.
"""

from __future__ import annotations

import uuid

from app.analysis.opportunities.detectors import DetectorHit
from app.core.config.earned_actions import (
    RULE_EARNED_PAGE_ACQUIRE,
    RULE_EARNED_PAGE_CORRECT,
    RULE_EARNED_PAGE_RESEARCH,
    RULE_EARNED_SOURCE_RECURS,
)
from app.core.config.opportunities import (
    OPPORTUNITY_RULES_BY_ID,
    STATUS_DISMISSED,
    STATUS_IN_PROGRESS,
    STATUS_OPEN,
)
from app.domain.opportunities.legacy_earned import bridge_legacy_earned
from app.models.opportunity import Opportunity

_DOMAIN = "review.example"


def _legacy(status: str, *, domain: str = _DOMAIN) -> Opportunity:
    return Opportunity(
        id=uuid.uuid4(),
        rule_id=RULE_EARNED_SOURCE_RECURS,
        target_key=f"earned-source:review_marketplace:{domain}",
        status=status,
    )


def _hit(
    url_hash: str,
    *,
    rule_id: str = RULE_EARNED_PAGE_ACQUIRE,
    domain: str = _DOMAIN,
) -> DetectorHit:
    return DetectorHit(
        rule_id=rule_id,
        target_key=f"earned-page:{url_hash}",
        target_prompt_id=None,
        target_url=f"https://{domain}/{url_hash[:4]}",
        target_theme=None,
        evidence={"content_handoff": {"canonical_domain": domain}},
        source_analysis_ids=(),
        source_issue_ids=(),
        source_metric_ids=(),
        value_factor=1.0,
        gap_factor=1.0,
    )


def _scored(*hits: DetectorHit) -> list[tuple[DetectorHit, float]]:
    return [(hit, 30.0) for hit in hits]


def test_one_page_on_the_domain_inherits_the_decision():
    legacy = _legacy(STATUS_IN_PROGRESS)
    hit = _hit("a" * 64)

    bridges = bridge_legacy_earned(live_rows=[legacy], scored=_scored(hit))

    bridge = bridges[hit.target_key]
    assert bridge.carried is True
    assert bridge.legacy_status == STATUS_IN_PROGRESS
    assert bridge.legacy_opportunity_id == str(legacy.id)


def test_two_pages_on_one_domain_inherit_context_but_not_the_status():
    """The acceptance case: a domain decision never marks several pages."""
    legacy = _legacy(STATUS_IN_PROGRESS)
    first, second = _hit("a" * 64), _hit("b" * 64)

    bridges = bridge_legacy_earned(live_rows=[legacy], scored=_scored(first, second))

    assert len(bridges) == 2
    assert not any(bridge.carried for bridge in bridges.values())
    assert all(
        bridge.legacy_opportunity_id == str(legacy.id) for bridge in bridges.values()
    )


def test_another_qualified_page_on_the_domain_blocks_the_carry():
    """One page to join and another to correct is not an unambiguous match.

    Only the acquire hit can inherit, but the correction proves the domain
    resolved to more than one page, so the decision stays where it was made.
    """
    legacy = _legacy(STATUS_IN_PROGRESS)
    acquire = _hit("a" * 64)
    correct = _hit("b" * 64, rule_id=RULE_EARNED_PAGE_CORRECT)

    bridges = bridge_legacy_earned(live_rows=[legacy], scored=_scored(acquire, correct))

    assert list(bridges) == [acquire.target_key]
    assert bridges[acquire.target_key].carried is False


def test_an_unresolved_source_beside_one_page_does_not_block_the_carry():
    """Research is not a qualified page; it is the absence of one."""
    legacy = _legacy(STATUS_IN_PROGRESS)
    acquire = _hit("a" * 64)
    research = _hit("b" * 64, rule_id=RULE_EARNED_PAGE_RESEARCH)

    bridges = bridge_legacy_earned(
        live_rows=[legacy], scored=_scored(acquire, research)
    )

    assert bridges[acquire.target_key].carried is True


def test_a_different_action_intent_does_not_inherit():
    """The retiring rule proposed inclusion; research is a different task."""
    legacy = _legacy(STATUS_DISMISSED)
    hit = _hit("a" * 64, rule_id=RULE_EARNED_PAGE_RESEARCH)

    assert bridge_legacy_earned(live_rows=[legacy], scored=_scored(hit)) == {}


def test_a_different_domain_does_not_inherit():
    legacy = _legacy(STATUS_DISMISSED, domain="other.example")
    hit = _hit("a" * 64)

    assert bridge_legacy_earned(live_rows=[legacy], scored=_scored(hit)) == {}


def test_an_untouched_legacy_row_carries_nothing_to_inherit():
    """``open`` is not a decision, so there is nothing to preserve."""
    legacy = _legacy(STATUS_OPEN)
    hit = _hit("a" * 64)

    assert (
        bridge_legacy_earned(live_rows=[legacy], scored=_scored(hit))[
            hit.target_key
        ].carried
        is False
    )


def test_a_legacy_row_with_no_successor_page_is_simply_retired():
    legacy = _legacy(STATUS_DISMISSED)

    assert bridge_legacy_earned(live_rows=[legacy], scored=[]) == {}


def test_the_domain_keyed_rule_no_longer_generates():
    """Retired in one cutover; it does not run alongside its replacement."""
    assert OPPORTUNITY_RULES_BY_ID[RULE_EARNED_SOURCE_RECURS].enabled is False
    assert all(
        OPPORTUNITY_RULES_BY_ID[rule_id].enabled
        for rule_id in (RULE_EARNED_PAGE_ACQUIRE, RULE_EARNED_PAGE_RESEARCH)
    )
