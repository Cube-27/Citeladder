"""Research warning and fallback decisions independent of providers."""

from app.domain.projects.onboarding.research import (
    _customer_warnings,
    _fallback_profile,
)


def test_missing_competitors_and_external_research_remain_distinct() -> None:
    assert _customer_warnings(
        model_available=True,
        competitors_found=False,
        external_state="unavailable",
        qualification_available=True,
    ) == ["external_research_unavailable", "competitors_not_found"]


def test_fallback_profile_keeps_inferred_facets_unknown() -> None:
    profile = _fallback_profile(
        brand_name="Acme", industry="Software", subindustry="Workflow"
    )
    assert profile.category == "Workflow"
    assert profile.business_model is None
    assert profile.market_scope is None
