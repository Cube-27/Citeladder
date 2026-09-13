"""Direct AEO checklist configuration coverage."""

from __future__ import annotations

import pytest

from app.core.config.site_health_contracts import AEO_READINESS_DIMENSIONS
from app.core.config.site_health_measurement import (
    AEO_CHECK_PILLAR,
    CONTENT_ADDRESSABLE_CHECK_FIELDS,
    CONTENT_ADDRESSABLE_CHECK_IDS,
    READINESS_DIMENSION_WEIGHTS,
    WEB_CHECK_IDS,
    public_check_membership,
)
from app.core.config.site_health_rules import SITE_HEALTH_RULES_BY_ID


def test_direct_checklist_uses_the_seven_weighted_pillars() -> None:
    assert len(READINESS_DIMENSION_WEIGHTS) == 7
    assert set(READINESS_DIMENSION_WEIGHTS) == set(AEO_READINESS_DIMENSIONS)
    assert sum(READINESS_DIMENSION_WEIGHTS.values()) == pytest.approx(1.0)
    assert "provenance" in READINESS_DIMENSION_WEIGHTS
    assert "authority" not in READINESS_DIMENSION_WEIGHTS


def test_every_scored_check_names_a_real_rule_and_one_pillar() -> None:
    assert set(AEO_CHECK_PILLAR.values()) <= set(AEO_READINESS_DIMENSIONS)
    assert set(AEO_CHECK_PILLAR) <= set(SITE_HEALTH_RULES_BY_ID)
    assert WEB_CHECK_IDS <= set(SITE_HEALTH_RULES_BY_ID)


def test_every_pillar_has_at_least_one_check() -> None:
    """A pillar no check feeds can only ever report "Not measured"."""
    covered = set(AEO_CHECK_PILLAR.values())
    assert covered == set(AEO_READINESS_DIMENSIONS)


def test_page_kind_does_not_gate_readiness_membership() -> None:
    """Purpose decides APPLICABILITY, never whether a page can be scored.

    Gating membership by page kind returned a null AEO score for every
    homepage, guide, service and unresolved `other` page — a quarter of a real
    crawl — however much readiness evidence those pages produced.
    """
    for page_kind in ("homepage", "guide", "service", "other", "article"):
        roles, pillar = public_check_membership("aeo.heading_hierarchy", page_kind)
        assert "aeo_readiness" in roles
        assert pillar == "structure"


def test_web_membership_covers_the_checks_the_issues_tab_reports() -> None:
    """A score blind to reported failures cannot move when the site is broken."""
    for rule_id in (
        "technical.canonical_present",
        "technical.meta_description_present",
        "web.accessibility_heading_order",
        "technical.ttfb_band",
    ):
        roles, _pillar = public_check_membership(rule_id, "product")
        assert "web_fundamentals" in roles


def test_content_addressable_flag_is_derived_from_one_config_set() -> None:
    """The catalog flag and the hand-off allowlist cannot drift apart again."""
    assert CONTENT_ADDRESSABLE_CHECK_IDS == set(CONTENT_ADDRESSABLE_CHECK_FIELDS)
    flagged = {
        rule_id
        for rule_id, rule in SITE_HEALTH_RULES_BY_ID.items()
        if rule.content_addressable
    }
    assert flagged == CONTENT_ADDRESSABLE_CHECK_IDS
