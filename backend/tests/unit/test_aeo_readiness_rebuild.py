"""Direct AEO checklist configuration coverage."""

from __future__ import annotations

import pytest

from app.core.config.site_health_contracts import AEO_READINESS_DIMENSIONS
from app.core.config.site_health_measurement import (
    AEO_CHECK_PILLAR,
    READINESS_DIMENSION_WEIGHTS,
    SUPPORTED_AEO_CHECKS_BY_PAGE_KIND,
)
from app.core.config.site_health_rules import SITE_HEALTH_RULES_BY_ID


def test_direct_checklist_uses_the_seven_weighted_pillars() -> None:
    assert len(READINESS_DIMENSION_WEIGHTS) == 7
    assert set(READINESS_DIMENSION_WEIGHTS) == set(AEO_READINESS_DIMENSIONS)
    assert sum(READINESS_DIMENSION_WEIGHTS.values()) == pytest.approx(1.0)
    assert "provenance" in READINESS_DIMENSION_WEIGHTS
    assert "authority" not in READINESS_DIMENSION_WEIGHTS


def test_supported_profiles_reference_one_pillar_per_existing_check() -> None:
    assert set(AEO_CHECK_PILLAR.values()) <= set(AEO_READINESS_DIMENSIONS)
    for checks in SUPPORTED_AEO_CHECKS_BY_PAGE_KIND.values():
        assert checks <= set(SITE_HEALTH_RULES_BY_ID)
        assert all(check_id in AEO_CHECK_PILLAR for check_id in checks)


def test_unsupported_purposes_have_no_hidden_aeo_profile() -> None:
    assert set(SUPPORTED_AEO_CHECKS_BY_PAGE_KIND) == {
        "article",
        "product",
        "category",
        "faq",
        "docs",
    }
