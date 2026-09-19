"""Focused unit contracts for two-pass visibility onboarding."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.connectors.web_evidence.brand_evidence import (
    BrandEvidenceLink,
    BrandEvidencePage,
)
from app.core.config.brand_discovery import _discovery_research_system_prompt
from app.core.config.visibility_prompts import (
    CONFIRMED_OFFERING_SOURCE_REF,
    cohort_system_prompt,
)
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryCreate,
    ConfirmedDiscoveryProfile,
    DiscoveryPromptSuggestion,
    PersistableDiscoveryProfile,
)
from app.domain.projects.offering_harvest import harvest_offerings
from app.domain.projects.onboarding.normalization import (
    InvalidWebsiteUrl,
    normalize_primary_market,
    normalize_website_url,
)
from app.domain.projects.onboarding.research import _customer_warnings
from app.domain.projects.onboarding.service import discovery_catalog
from app.domain.projects.onboarding.site_resolution import resolve_site
from app.domain.projects.onboarding.topic_admission import (
    admit_topics,
    confirmed_offering_topics,
)
from app.domain.prompts.portfolio_validation import (
    PortfolioValidator,
    brand_terms,
    ordered_portfolio,
)
from app.domain.prompts.style import words as _words


def _profile() -> dict:
    return {
        "description": "Acme sells family footwear.",
        "positioning": "Affordable shoes.",
        "products_services": ["Footwear"],
        "target_audience": "Families",
        "category": "Footwear",
    }


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


def test_prompt_instruction_shows_register_for_the_business_kind() -> None:
    """A law firm's prompts must not be taught with shopping examples."""
    legal = cohort_system_prompt("professional_service")
    retail = cohort_system_prompt("retail")
    assert "employment dispute" in legal
    assert "cheap baby clothes in bulk" not in legal
    assert "Cheap baby clothes in bulk" in retail
    # An unknown facet still gets a concrete register rather than nothing.
    assert "Which providers should I shortlist" in cohort_system_prompt("")


def _candidate(name: str, refs: list[str] | None = None) -> dict:
    return {"name": name, "description": "", "source_refs": refs or ["nav-1"]}


def _admit(names: list[str], **kwargs) -> list[str]:
    topics = admit_topics(
        [_candidate(name) for name in names],
        known_refs=kwargs.get("known_refs", {"nav-1"}),
        forbidden_terms=kwargs.get("forbidden_terms", ["Acme"]),
        business_terms=kwargs.get("business_terms", []),
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
            business_terms=[],
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
        business_terms=[],
    )
    assert [topic.name for topic in topics] == ["Bags", "Hats"]


def test_category_restatement_rule_yields_to_a_single_offering_business() -> None:
    """A mattress brand whose category IS mattresses must keep the topic."""
    assert _admit(["Mattresses"], business_terms=["mattresses"]) == ["Mattresses"]
    # When a specific topic survives, the provider-category restatement drops.
    names = _admit(
        ["Mattresses", "Pillows", "Bed Frames"],
        business_terms=["mattresses"],
    )
    assert "Mattresses" not in names


def test_confirmed_offerings_are_a_simple_provenanced_recovery_path() -> None:
    topics = confirmed_offering_topics(
        [" Analytics Software ", "analytics software", "Process Mining"]
    )
    assert [topic.name for topic in topics] == ["Analytics Software", "Process Mining"]
    assert {ref for topic in topics for ref in topic.source_refs} == {
        CONFIRMED_OFFERING_SOURCE_REF
    }


def _validator(**kwargs) -> PortfolioValidator:
    return PortfolioValidator(
        topic_ids=kwargs.get("topic_ids", frozenset({"t1", "t2"})),
        brand_terms=kwargs.get("brand_terms", ["Acme"]),
        competitor_terms=kwargs.get("competitor_terms", ["Rival"]),
    )


def _offer(validator: PortfolioValidator, text: str, **kwargs) -> str:
    return validator.offer(
        {
            "topic_id": kwargs.get("topic_id", "t1"),
            "text": text,
            "intent": kwargs.get("intent", "discovery"),
        },
        cohort=kwargs.get("cohort", "core"),
    )


def test_buyer_language_is_accepted() -> None:
    validator = _validator()
    assert _offer(validator, "I want to buy cheap baby clothes in bulk") == ""
    assert (
        _offer(
            validator,
            "Looking for kids school shoes before term starts",
            topic_id="t2",
        )
        == ""
    )
    assert len(validator.accepted) == 2


def test_repeated_openings_do_not_reject_distinct_needs() -> None:
    validator = _validator()
    assert _offer(validator, "best running shoes for flat feet") == ""
    assert (
        _offer(validator, "best running shoes under 5000 rupees", topic_id="t2") == ""
    )
    assert _offer(validator, "best running shoes for wide toes") == ""


def test_words_tokenize_every_script_not_just_ascii() -> None:
    assert _words("सस्ते बच्चों के कपड़े") == ["सस्ते", "बच्चों", "के", "कपड़े"]
    assert _words("Men's Shoes under 5000!") == ["men", "s", "shoes", "under", "5000"]


def test_named_brand_rows_reject_an_unknown_topic_id() -> None:
    """An invented id is a rejection, not a silently detached prompt."""
    validator = _validator()
    assert (
        _offer(
            validator,
            "is Acme any good for school shoes",
            topic_id="not-a-real-topic",
            cohort="brand_diagnostic",
        )
        == "topic_id"
    )
    # A canonical id is kept, so the row stays bound to the topic it names.
    assert (
        _offer(
            validator,
            "is Acme any good for school shoes",
            topic_id="t1",
            cohort="brand_diagnostic",
        )
        == ""
    )
    assert validator.accepted[0]["topic_id"] == "t1"
    # Naming no topic at all remains valid for this cohort.
    assert (
        _offer(
            validator,
            "does Acme sell wide fit kids trainers",
            topic_id="",
            cohort="brand_diagnostic",
        )
        == ""
    )
    assert validator.accepted[1]["topic_id"] == ""


def test_market_can_be_named_in_multiple_queries_per_topic() -> None:
    validator = _validator()
    assert _offer(validator, "where to buy school shoes in India cheaply") == ""
    assert _offer(validator, "which Indian store sells kids winter jackets") == ""
    assert _offer(validator, "best Indian sites for baby clothes", topic_id="t2") == ""


def test_unbound_brand_diagnostics_preserve_distinct_queries() -> None:
    validator = _validator()
    assert (
        _offer(
            validator,
            "is Acme reliable for buyers in India",
            topic_id="",
            cohort="brand_diagnostic",
        )
        == ""
    )
    assert (
        _offer(
            validator,
            "does Acme support customers across India",
            topic_id="",
            cohort="brand_diagnostic",
        )
        == ""
    )


def test_short_form_of_a_multi_word_brand_is_still_the_brand() -> None:
    """ "Best Apollo hospital for..." shipped as an ORGANIC prompt."""
    terms = brand_terms("Apollo Hospitals", [])
    assert "Apollo Hospitals" in terms
    assert "apollo" in terms
    # The provider word is not the brand and must stay usable by everyone.
    assert "hospitals" not in terms
    validator = _validator(brand_terms=terms)
    assert (
        _offer(validator, "Best Apollo hospital for kidney stone treatment")
        == "tracked_name"
    )


def test_identity_rules_per_cohort() -> None:
    assert _offer(_validator(), "is Acme good for kids shoes") == "tracked_name"
    assert (
        _offer(_validator(), "best shop for kids shoes", cohort="brand_diagnostic")
        == "missing_brand_name"
    )
    assert (
        _offer(
            _validator(),
            "how does Acme compare for kids shoes",
            cohort="comparison",
            intent="comparison",
        )
        == "missing_competitor_name"
    )
    assert (
        _offer(
            _validator(),
            "Acme or Rival for kids school shoes",
            cohort="comparison",
            intent="comparison",
        )
        == ""
    )


def test_technical_length_bound_accepts_short_queries() -> None:
    assert _offer(_validator(), "x" * 301) == "length"
    assert _offer(_validator(), "") == "length"
    assert _offer(_validator(), "cheap shoes") == ""


def test_portfolio_is_ordered_round_robin_so_activation_covers_every_topic() -> None:
    prompts = [
        {"topic_id": "t1", "text": "a", "intent": "discovery", "cohort": "core"},
        {"topic_id": "t1", "text": "b", "intent": "discovery", "cohort": "core"},
        {"topic_id": "t2", "text": "c", "intent": "discovery", "cohort": "core"},
        {
            "topic_id": "x",
            "text": "d",
            "intent": "discovery",
            "cohort": "brand_diagnostic",
        },
    ]
    ordered = ordered_portfolio(prompts, topic_ids=["t1", "t2"])
    assert [item["text"] for item in ordered] == ["a", "c", "b", "d"]


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


def test_brand_named_after_its_category_keeps_the_category_word_usable() -> None:
    """Red Dress banned "dress" and shipped a portfolio of two branded prompts.

    Every organic dress query was rejected as `tracked_name`, the core cohort
    emptied, and the only survivors were the two mandatory brand-diagnostic
    prompts -- which are required to name the brand.
    """
    terms = brand_terms("Red Dress", [], ["Dresses", "Women's clothing"])
    assert "Red Dress" in terms
    assert "dress" not in terms
    validator = _validator(brand_terms=terms)
    assert _offer(validator, "best summer dresses for a beach wedding") == ""
    # The full name is still the brand and still cannot appear organically.
    assert _offer(validator, "is Red Dress good for petite sizing") == "tracked_name"


def test_brand_named_with_ordinary_english_keeps_that_word_usable() -> None:
    """ "I Love Dooney" banned "love" and left a portfolio of brand prompts.

    The same collapse as the Red Dress case, from the other side: "love" is
    not category language, so no confirmed category could ever unban it, yet
    it appears in a large share of ordinary apparel queries. Every one of them
    was rejected as `tracked_name`, the core cohort emptied, and the fixed
    brand-diagnostic and comparison prompts became the whole portfolio. It
    looked brand-specific because it depended on the brand's own name.
    """
    terms = brand_terms("I Love Dooney", ["ilovedooney"], ["Handbags", "Purses"])
    assert "I Love Dooney" in terms
    assert "love" not in terms
    # The distinctive token is still the brand and is still banned.
    assert "dooney" in terms
    validator = _validator(brand_terms=terms)
    assert _offer(validator, "leather handbags i would love for everyday work") == ""
    assert _offer(validator, "are Dooney bags worth the price") == "tracked_name"
    # The site's own spelling is one word and is never a token of the name, so
    # it has to be banned as an alias.
    assert _offer(validator, "is ilovedooney a legit place to buy bags") == (
        "tracked_name"
    )


def test_category_vocabulary_never_unbans_a_real_brand_token() -> None:
    terms = brand_terms("Apollo Hospitals", [], ["Cardiac care", "Hospitals"])
    assert "apollo" in terms
    validator = _validator(brand_terms=terms)
    assert (
        _offer(validator, "Best Apollo hospital for kidney stone treatment")
        == "tracked_name"
    )


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


def test_brand_owning_its_category_vocabulary_stays_banned() -> None:
    """An outlet for ONE label writes that label all over its own category.

    ilovedooney.com confirmed a category of "Designer handbag & accessories
    outlet (Dooney & Bourke official clearance)" with terms like "dooney
    outlet" and "discounted dooney handbags". Reading every token of that
    vocabulary as category language unbanned "dooney", so nothing rejected an
    organic prompt that named the tracked brand: the shipped portfolio ran
    20 core prompts of which nearly every one said "Dooney", and measured no
    unbranded demand at all -- the only demand an outlet can actually win.

    The head of each phrase is what the phrase IS. "Dooney" is never one.
    """
    vocabulary = [
        "Designer handbag & accessories outlet (Dooney & Bourke official clearance)",
        "Dooney & Bourke handbags (satchels, totes, crossbodies)",
        "dooney outlet",
        "discounted dooney handbags",
        "Small leather goods (wallets, wristlets)",
        "Bags",
        "Shoes",
    ]
    terms = brand_terms("I Love Dooney", ["ilovedooney"], vocabulary)
    assert "dooney" in terms

    validator = _validator(brand_terms=terms)
    assert _offer(validator, "Which Dooney satchel is the best value under 200") == (
        "tracked_name"
    )
    # The unbranded category demand the portfolio existed to measure is still
    # admissible -- every head noun of that vocabulary stays usable.
    assert _offer(validator, "affordable leather tote for work under 200") == ""
    outlet_query = "authenticated designer handbag outlet with clearance prices"
    assert _offer(validator, outlet_query) == ""


def test_category_head_noun_still_unbans_a_brand_named_for_what_it_sells() -> None:
    """The Red Dress hatch survives the narrowing, via the phrase head.

    "dress" is the head of "Maxi dresses", so it is what the phrase IS and
    stays usable. This is the case the escape hatch exists for, and narrowing
    it to heads must not take it away.
    """
    terms = brand_terms(
        "Red Dress", ["reddress"], ["Maxi dresses", "Women's dresses and clothing"]
    )
    assert "dress" not in terms
    validator = _validator(brand_terms=terms)
    assert _offer(validator, "best affordable maxi dress for a summer wedding") == ""
    assert _offer(validator, "is Red Dress good for petite sizing") == "tracked_name"


def test_one_unreadable_row_no_longer_voids_its_whole_batch() -> None:
    """An unknown slot is dropped without discarding a valid planned row."""
    import json

    from app.domain.prompts.generation_contract import parse_planned_output
    from app.domain.prompts.query_patterns import build_prompt_slots

    slots = build_prompt_slots(
        topics=[{"id": "t1", "name": "Linen Dresses", "description": ""}],
        count=2,
        cohort="core",
    )

    raw = json.dumps(
        {
            "prompts": [
                {
                    "buyer_stage": "consideration",
                    "prompt_intent": "recommend",
                    "slot_id": "q1",
                    "text": "Best linen dresses for a summer wedding",
                },
                {
                    "slot_id": "unknown",
                    "text": "Linen dresses under 200 online",
                    "buyer_stage": "decision",
                    "prompt_intent": "buy",
                },
            ]
        }
    )
    rows, dropped = parse_planned_output(raw, slots=slots)

    assert [row.text for row in rows] == ["Best linen dresses for a summer wedding"]
    assert dropped == 1


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
