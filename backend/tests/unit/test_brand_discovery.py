"""Focused unit contracts for two-pass visibility onboarding."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.connectors.web_evidence.brand_evidence import (
    BrandEvidenceLink,
    BrandEvidencePage,
)
from app.core.config.brand_discovery import (
    _competitor_suggestion_system_prompt,
    _discovery_research_system_prompt,
    brand_discovery_settings,
)
from app.core.config.visibility_prompts import (
    CONFIRMED_OFFERING_SOURCE_REF,
    cohort_system_prompt,
)
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryComplete,
    BrandDiscoveryCreate,
    ConfirmedDiscoveryProfile,
    DiscoveryPromptSuggestion,
    PersistableDiscoveryProfile,
)
from app.domain.projects.offering_harvest import harvest_offerings
from app.domain.projects.onboarding import completion as onboarding_completion
from app.domain.projects.onboarding.normalization import (
    InvalidWebsiteUrl,
    normalize_primary_market,
    normalize_website_url,
)
from app.domain.projects.onboarding.research import _customer_warnings
from app.domain.projects.onboarding.service import (
    BrandDiscoveryError,
    discovery_catalog,
)
from app.domain.projects.onboarding.site_resolution import resolve_site
from app.domain.projects.onboarding.topic_admission import (
    admit_topics,
    confirmed_offering_topics,
)


def _profile() -> dict:
    return {
        "description": "Acme sells family footwear.",
        "positioning": "Affordable shoes.",
        "products_services": ["Footwear"],
        "target_audience": "Families",
        "category": "Footwear",
    }


@pytest.mark.asyncio
async def test_selected_competitor_resolution_has_a_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def hang(_domain: str, _url: str):
        await asyncio.Event().wait()

    monkeypatch.setattr(onboarding_completion, "resolve_site", hang)
    monkeypatch.setattr(
        onboarding_completion, "BRAND_EVIDENCE_TOTAL_TIMEOUT_SECONDS", 0.001
    )
    payload = BrandDiscoveryComplete(
        profile=ConfirmedDiscoveryProfile(category="Retail"),
        domains=["acme.com"],
        competitors=[{"name": "Globex", "domains": ["globex.com"]}],
    )
    with pytest.raises(BrandDiscoveryError, match=r"Globex: globex\.com"):
        await onboarding_completion._resolve_selected_competitors(
            payload, owned_domains={"acme.com"}
        )


@pytest.mark.asyncio
async def test_selected_competitor_sites_are_confirmed_concurrently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Each check waits until both are in flight, so checks run one after
    # another would each exhaust the deadline and fail.
    in_flight = 0
    both_started = asyncio.Event()

    async def resolve(_domain: str, url: str):
        nonlocal in_flight
        in_flight += 1
        if in_flight == 2:
            both_started.set()
        await both_started.wait()
        return SimpleNamespace(registrable_domain=normalize_website_url(url)[1])

    monkeypatch.setattr(onboarding_completion, "resolve_site", resolve)
    monkeypatch.setattr(
        onboarding_completion, "BRAND_EVIDENCE_TOTAL_TIMEOUT_SECONDS", 1
    )
    payload = BrandDiscoveryComplete(
        profile=ConfirmedDiscoveryProfile(category="Retail"),
        domains=["acme.com"],
        competitors=[
            {"name": "Globex", "domains": ["globex.com"]},
            {"name": "Initech", "domains": ["initech.com"]},
        ],
    )
    await onboarding_completion._resolve_selected_competitors(
        payload, owned_domains={"acme.com"}
    )


def test_normalizes_url_and_market() -> None:
    url, domain = normalize_website_url("HTTPS://WWW.Example.COM:443/shop#offers")
    assert url == "https://www.example.com/shop"
    assert domain == "example.com"
    assert normalize_primary_market("in") == "IN"


@pytest.mark.parametrize("value", ["javascript:alert(1)", "file:///tmp/x", "localhost"])
def test_rejects_invalid_public_urls(value: str) -> None:
    with pytest.raises(InvalidWebsiteUrl):
        normalize_website_url(value)


def test_create_contract_requires_market() -> None:
    with pytest.raises(ValidationError):
        BrandDiscoveryCreate(brand_name="Acme", website_url="https://acme.example")


def test_discovery_prompt_contract_normalizes_legacy_unbound_topic() -> None:
    suggestion = DiscoveryPromptSuggestion.model_validate(
        {
            "topic_id": "",
            "text": "is Acme suitable for growing teams",
            "intent": "discovery",
            "cohort": "brand_diagnostic",
        }
    )

    assert suggestion.topic_id is None


@pytest.mark.parametrize(
    "payload",
    [{**_profile(), "category": " "}],
)
def test_confirmed_profile_rejects_blank_category(payload: dict) -> None:
    with pytest.raises(ValidationError):
        ConfirmedDiscoveryProfile(**payload)


def test_generated_profile_rejects_product_too_long_for_project_persistence() -> None:
    generated_payload = ["x" * 256]
    with pytest.raises(ValidationError):
        PersistableDiscoveryProfile(products_services=generated_payload)

    confirmed_payload = {**_profile(), "products_services": ["x" * 256]}
    with pytest.raises(ValidationError):
        ConfirmedDiscoveryProfile(**confirmed_payload)


def test_research_prompt_no_longer_owns_topics() -> None:
    """Topic selection is its own pass; the research prompt must not compete."""
    prompt = _discovery_research_system_prompt()
    assert "TOPICS." not in prompt
    assert "COMPETITORS must be substitutable" in prompt


def test_competitor_prompt_uses_configured_suggestion_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(brand_discovery_settings, "competitor_suggestion_maximum", 3)
    assert "up to 3" in _competitor_suggestion_system_prompt()


def test_prompt_instruction_shows_register_for_the_business_kind() -> None:
    """A law firm's prompts must not be taught with shopping examples."""
    legal = cohort_system_prompt("professional_service")
    retail = cohort_system_prompt("retail")
    assert "employment dispute" in legal
    assert "school clothes" not in legal
    assert "school clothes" in retail
    # An unknown facet still gets a concrete register rather than nothing.
    assert "Which providers should I shortlist" in cohort_system_prompt("")


def _candidate(name: str, refs: list[str] | None = None) -> dict:
    return {"name": name, "description": "", "source_refs": refs or ["nav-1"]}


def _admit(names: list[str], **kwargs) -> list[str]:
    topics = admit_topics(
        [_candidate(name) for name in names],
        known_refs=kwargs.get("known_refs", {"nav-1"}),
        forbidden_terms=kwargs.get("forbidden_terms", ["Acme"]),
    )
    return [topic.name for topic in topics]


def test_forbidden_terms_match_complete_tokens_and_phrases() -> None:
    assert _admit(
        ["Hair Care", "Air Purifiers", "Nail Care", "AI", "Enterprise AI Tools"],
        forbidden_terms=["AI"],
    ) == ["Hair Care", "Air Purifiers", "Nail Care"]


def test_admission_rejects_the_topics_that_shipped_to_a_real_customer() -> None:
    """The exact five-row output that made this contract necessary."""
    assert (
        _admit(
            [
                "Online Retail",
                "Ecommerce Marketplace",
                "Online General Merchandise",
                "Online Department Store",
                "Consumer Goods Online Store",
            ]
        )
        == []
    )


def test_provider_rule_only_rejects_names_that_are_wholly_provider_words() -> None:
    """Substring containment rejected real departments on real retailers."""
    assert _admit(["School Uniforms", "Bank Holidays", "Online Payments"]) == [
        "School Uniforms",
        "Bank Holidays",
        "Online Payments",
    ]


def test_admission_keeps_what_customers_actually_shop_for() -> None:
    assert _admit(
        ["Kids Clothing", "Air Conditioners", "Knee Replacement", "Payment Links"]
    ) == ["Kids Clothing", "Air Conditioners", "Knee Replacement", "Payment Links"]


def test_admission_allows_buyer_qualifiers_the_old_contract_banned() -> None:
    """Cheap, affordable and price bounds are how demand is really expressed."""
    names = _admit(
        ["Mobile Phones Under 25000", "Affordable Winter Jackets", "Emergency Plumbing"]
    )
    assert len(names) == 3


def test_admission_collapses_restatements_of_one_topic() -> None:
    names = _admit(["Air Conditioners", "Air Conditioner", "Footwear", "Homewares"])
    assert names == ["Air Conditioners", "Footwear", "Homewares"]


def test_topics_require_supplied_evidence_references() -> None:
    assert (
        admit_topics(
            [
                _candidate("Running Shoes", ["missing"]),
                _candidate("Football Boots", []),
                _candidate("Training Apparel", ["missing"]),
            ],
            known_refs=set(),
            forbidden_terms=[],
        )
        == []
    )


def test_admission_keeps_departments_that_merely_look_alike() -> None:
    """Character similarity would merge these; token identity must not."""
    names = _admit(["Women's Footwear", "Men's Footwear", "Kids' Footwear"])
    assert len(names) == 3


def test_admission_drops_brand_and_unbound_evidence_without_padding() -> None:
    assert _admit(["Acme Footwear", "Footwear", "Bags"]) == ["Footwear", "Bags"]
    topics = admit_topics(
        [
            _candidate("Footwear", ["missing"]),
            _candidate("Bags"),
            _candidate("Hats"),
        ],
        known_refs={"nav-1"},
        forbidden_terms=[],
    )
    assert [topic.name for topic in topics] == ["Bags", "Hats"]


def test_category_offering_remains_when_other_offerings_exist() -> None:
    assert _admit(["Mattresses", "Pillows", "Bed Frames"]) == [
        "Mattresses",
        "Pillows",
        "Bed Frames",
    ]


def test_confirmed_offerings_are_a_simple_provenanced_recovery_path() -> None:
    topics = confirmed_offering_topics(
        [" Analytics Software ", "analytics software", "Process Mining"]
    )
    assert [topic.name for topic in topics] == ["Analytics Software", "Process Mining"]
    assert {ref for topic in topics for ref in topic.source_refs} == {
        CONFIRMED_OFFERING_SOURCE_REF
    }


def _page(links: list[tuple[str, str]]) -> BrandEvidencePage:
    return BrandEvidencePage(
        url="https://acme.com/",
        title="",
        meta_description="",
        text="text",
        navigation_links=tuple(
            BrandEvidenceLink(url=f"https://acme.com{path}", label=label)
            for label, path in links
        ),
    )


def _harvest(
    links: list[tuple[str, str]], *, brand_terms: list[str] | None = None
) -> list[str]:
    harvest = harvest_offerings((_page(links),), brand_terms=brand_terms or ["Acme"])
    return [node.label for node in harvest.nodes]


def test_harvest_keeps_offerings_and_drops_chrome() -> None:
    assert _harvest(
        [
            ("Login", "/account/login"),
            ("Cart", "/viewcart"),
            ("Investor Relations", "/investors"),
            ("Dr. Jane Roe", "/team/jane-roe"),
            ("Kids Clothing", "/kids-clothing"),
            ("Air Conditioners", "/air-conditioners"),
            ("Shop now", "/new-arrivals"),
            ("Deutsch", "/de"),
            ("Acme Originals", "/originals"),
        ]
    ) == ["Kids Clothing", "Air Conditioners"]


def test_harvest_caps_a_city_index_so_it_cannot_flood_the_budget() -> None:
    labels = _harvest(
        [("Plumbing", "/plumbing"), ("Carpentry", "/carpentry")]
        + [(f"Plumber in City{index}", f"/city{index}") for index in range(30)]
    )
    assert labels[:2] == ["Plumbing", "Carpentry"]
    assert sum(1 for label in labels if label.startswith("Plumber in")) <= 3


def test_harvest_keeps_possessive_departments_apart() -> None:
    """ "Men's Shoes" and "Women's Shoes" both carry a bare "s" token."""
    labels = _harvest(
        [
            ("Men's Shoes", "/mens-shoes"),
            ("Women's Shoes", "/womens-shoes"),
            ("Kids' Shoes", "/kids-shoes"),
            ("Men's Shirts", "/mens-shirts"),
        ]
    )
    assert len(labels) == 4


def test_harvest_reports_empty_when_no_readable_list_is_published() -> None:
    page = _page([("Login", "/account/login")])
    assert not harvest_offerings((page,), brand_terms=["Acme"]).is_ready


def test_harvest_rejects_query_identified_detail_pages() -> None:
    assert _harvest(
        [
            ("Kids Clothing", "/kids-clothing"),
            ("Air Conditioners", "/air-conditioners"),
            ("Mobile Phones", "/mobile-phones"),
            ("One Phone", "/product?pid=123"),
        ]
    ) == ["Kids Clothing", "Air Conditioners", "Mobile Phones"]


def test_harvest_matches_brand_names_as_complete_phrases() -> None:
    assert _harvest(
        [
            ("Party Supplies", "/party-supplies"),
            ("Art Originals", "/art-originals"),
            ("Home Decor", "/home-decor"),
            ("Gifts", "/gifts"),
        ],
        brand_terms=["Art"],
    ) == ["Party Supplies", "Home Decor", "Gifts"]


def test_catalog_exposes_only_stored_visibility_cohorts() -> None:
    assert discovery_catalog()["prompt_cohorts"] == [
        "core",
        "brand_diagnostic",
        "comparison",
    ]


def test_customer_warnings_only_report_material_gaps() -> None:
    assert _customer_warnings(model_available=True, competitors_found=True) == []
    assert _customer_warnings(model_available=False, competitors_found=False) == [
        "research_degraded",
        "competitors_not_found",
    ]


@pytest.mark.asyncio
async def test_https_to_http_redirect_is_not_used_as_research(monkeypatch) -> None:
    response = SimpleNamespace(
        status_code=200,
        final_url="http://acme.com/",
        body=b"<html><body>Brand text</body></html>",
        charset="utf-8",
    )

    class Fetcher:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def fetch(self, _request):
            return response

    monkeypatch.setattr(
        "app.domain.projects.onboarding.site_resolution.SecureFetcher",
        lambda **_kwargs: Fetcher(),
    )
    site = await resolve_site("acme.com", "https://acme.com/")
    assert site.page is None
    assert site.warning == "research_degraded"


def test_a_resolved_conflict_does_not_warn_the_user_to_review_it() -> None:
    """The status flag alone told users to re-check a 0.97-confident profile.

    The identity model is instructed that an unresolved conflict "must use
    status conflicting_evidence AND lower confidence". One real brand set the
    flag while reporting 0.95-0.97 on its category, description, positioning
    and business model -- it had reconciled the sources and said so in the
    numbers. Onboarding still showed "Sources disagreed about this business.
    Review the suggested positioning carefully", which is advice with nothing
    behind it and trains people to skip the warning that does matter.
    """
    from app.domain.projects.onboarding.identity_research import (
        IdentityResearchEnvelope,
    )
    from app.domain.projects.onboarding.research import _identity_conflicts

    def envelope(status: str, confidence: dict[str, float]):
        return IdentityResearchEnvelope(
            status=status,
            profile=PersistableDiscoveryProfile(field_confidence=confidence),
        )

    confident = {
        "category": 0.97,
        "description": 0.97,
        "positioning": 0.97,
        "products_services": 0.95,
        "business_model": 0.95,
    }
    assert not _identity_conflicts(envelope("conflicting_evidence", confident))

    # A conflict the model really could not resolve still warns.
    assert _identity_conflicts(
        envelope("conflicting_evidence", {**confident, "category": 0.4})
    )
    # No confidence reported is the ABSENCE of corroboration, not reassurance.
    assert _identity_conflicts(envelope("conflicting_evidence", {}))
    assert not _identity_conflicts(envelope("ready", {"category": 0.4}))


def test_admission_rejects_an_unsplit_bundle_but_keeps_real_departments() -> None:
    """ "Womenswear including plus size" is two departments wearing one name.

    It reached a customer's portfolio and became "What is womenswear including
    plus size?" -- a question nobody types. A bare "and" stays legal, because
    "Footwear and Accessories" is a department people really do shop.
    """
    assert _admit(["Womenswear including plus size"]) == []
    assert _admit(["Beauty, Toys and More"]) == []
    assert _admit(["Beauty, Toys &amp; More"]) == []
    assert _admit(["Footwear and Accessories"]) == ["Footwear and Accessories"]
    assert _admit(["School Uniforms"]) == ["School Uniforms"]
