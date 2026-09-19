"""Business context retains reviewed facts without inventing missing facets."""

from types import SimpleNamespace

from app.domain.projects.business_context import BusinessContext
from app.domain.projects.discovery_schemas import ConfirmedDiscoveryProfile


def test_unknown_facets_remain_unknown() -> None:
    context = BusinessContext.from_onboarding(
        ConfirmedDiscoveryProfile(
            category="Workflow analytics",
            positioning="Analytics for operations teams",
            products_services=["Workflow reports"],
            target_audience="Operations teams",
        )
    )
    assert context.business_model is None
    assert context.market_scope is None
    assert context.buyer_type is None
    assert "business_model" not in context.for_generation()


def test_reviewed_fields_override_inference_and_survive_project_roundtrip() -> None:
    confirmed = ConfirmedDiscoveryProfile(
        category="Implementation services",
        positioning="Commerce implementation",
        products_services=["Store implementation"],
        target_audience="Retail teams",
        business_type="b2b",
        market_scope="global",
        business_model="professional_service",
    )
    context = BusinessContext.from_onboarding(
        confirmed,
        inferred={
            "category": "Software",
            "business_type": "b2c",
            "buyer_type": "b2c",
            "market_scope": "local",
        },
    )
    project = SimpleNamespace(
        brand=SimpleNamespace(
            profile=SimpleNamespace(business_context=context.persisted())
        )
    )
    loaded = BusinessContext.from_project(project)
    assert loaded.category == "Implementation services"
    assert loaded.buyer_type == "b2b"
    assert loaded.for_generation()["buyer_type"] == "b2b"
    assert "business_type" not in loaded.persisted()
    assert loaded.market_scope == "global"
    assert loaded.business_model == "professional_service"
    assert loaded.field_sources["category"] == "reviewed"
    assert loaded.field_sources["buyer_type"] == "reviewed"
    assert loaded.field_sources["business_model"] == "inferred"
    assert "field_sources" not in loaded.for_generation()


def test_invalid_legacy_facet_does_not_break_valid_persisted_context() -> None:
    raw = {
        "business_model": "agency",
        "category": "Analytics services",
        "jobs_to_be_done": ["Find workflow bottlenecks"],
        "field_sources": {"category": "reviewed", "business_model": "reviewed"},
    }
    project = SimpleNamespace(
        brand=SimpleNamespace(profile=SimpleNamespace(business_context=raw))
    )
    loaded = BusinessContext.from_project(project)
    assert loaded.business_model is None
    assert loaded.category == "Analytics services"
    assert loaded.jobs_to_be_done == ["Find workflow bottlenecks"]
    assert loaded.field_sources["category"] == "reviewed"
    assert "business_model" not in loaded.field_sources


def test_legacy_reviewed_business_type_wins_over_stale_buyer_type() -> None:
    loaded = BusinessContext.from_persisted(
        {
            "business_type": "b2b",
            "buyer_type": "b2c",
            "field_sources": {"business_type": "reviewed", "buyer_type": "inferred"},
        }
    )
    assert loaded.for_generation()["buyer_type"] == "b2b"
    assert "business_type" not in loaded.persisted()
    assert loaded.field_sources["buyer_type"] == "reviewed"


def test_current_reviewed_buyer_type_survives_stale_legacy_value() -> None:
    loaded = BusinessContext.from_persisted(
        {
            "business_type": "b2b",
            "buyer_type": "b2c",
            "field_sources": {"business_type": "inferred", "buyer_type": "reviewed"},
        }
    )
    assert loaded.for_generation()["buyer_type"] == "b2c"
    assert loaded.field_sources == {"buyer_type": "reviewed"}


def test_missing_reviewed_buyer_type_does_not_keep_stale_inference() -> None:
    context = BusinessContext.from_onboarding(
        ConfirmedDiscoveryProfile(category="Retail"),
        inferred={"buyer_type": "b2b"},
    )
    assert context.buyer_type is None
    assert "buyer_type" not in context.for_generation()


def test_project_manual_profile_edit_overrides_inferred_field_provenance() -> None:
    project = SimpleNamespace(
        brand=SimpleNamespace(
            profile=SimpleNamespace(
                business_context={"field_sources": {"positioning": "inferred"}},
                positioning="Edited position",
                sources={"positioning": {"review_state": "edited"}},
            )
        ),
        country_code="AU",
        language_code="en-AU",
    )
    loaded = BusinessContext.from_project(project)
    assert loaded.positioning == "Edited position"
    assert loaded.field_sources["positioning"] == "reviewed"
    assert loaded.for_generation()["language_code"] == "en-AU"


def test_project_market_falls_back_when_country_code_is_blank() -> None:
    project = SimpleNamespace(country_code="", primary_market="AU", language_code="en")
    assert (
        BusinessContext.from_project(project).for_generation()["primary_market"] == "AU"
    )
