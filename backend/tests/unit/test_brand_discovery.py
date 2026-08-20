"""Focused unit contracts for two-pass visibility onboarding."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.connectors.web_evidence.brand_evidence import BrandEvidencePage
from app.core.config.brand_discovery import (
    DISCOVERY_PROMPT_MAX_WORDS,
    _discovery_research_system_prompt,
    _onboarding_portfolio_system_prompt,
)
from app.domain.projects.brand_evidence import BrandEvidence
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryCreate,
    CompetitorQualification,
    ConfirmedDiscoveryProfile,
    DiscoveryCompetitorSuggestion,
)
from app.domain.projects.onboarding.normalization import (
    InvalidWebsiteUrl,
    normalize_primary_market,
    normalize_website_url,
)
from app.domain.projects.onboarding.portfolio_generation import _parsed_prompts
from app.domain.projects.onboarding.prompt_validation import select_portfolio
from app.domain.projects.onboarding.research import (
    ResearchEnvelope,
    ResearchTopic,
    _admitted_topics,
    _customer_warnings,
    _is_peer_company,
)
from app.domain.projects.onboarding.service import discovery_catalog
from app.domain.projects.onboarding.site_resolution import resolve_site


def _profile() -> dict:
    return {
        "description": "Acme sells family footwear.",
        "positioning": "Affordable shoes.",
        "products_services": ["Footwear"],
        "target_audience": "Families",
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


@pytest.mark.parametrize(
    "payload",
    [
        {**_profile(), "positioning": " "},
        {**_profile(), "target_audience": " "},
        {**_profile(), "products_services": [" "]},
    ],
)
def test_confirmed_profile_rejects_blank_required_fields(payload: dict) -> None:
    with pytest.raises(ValidationError):
        ConfirmedDiscoveryProfile(**payload)


def _competitor(model: str | None) -> DiscoveryCompetitorSuggestion:
    return DiscoveryCompetitorSuggestion(
        name="Peer",
        domains=["peer.example"],
        business_model=model,
        qualification=CompetitorQualification(
            product_substitutability=1,
            customer_use_case_overlap=1,
            geographic_relevance=1,
            question_visibility=1,
        ),
    )


def test_services_firm_does_not_accept_product_vendor_as_peer() -> None:
    assert not _is_peer_company(
        _competitor("b2b_saas"), brand_model="professional_service"
    )
    assert _is_peer_company(
        _competitor("professional_service"), brand_model="professional_service"
    )
    assert _is_peer_company(_competitor(None), brand_model="professional_service")


def test_research_prompt_owns_three_to_five_evidence_backed_topics() -> None:
    prompt = _discovery_research_system_prompt()
    assert "three to five" in prompt
    assert "fewer than three" in prompt
    assert "Evidence ref" in prompt
    assert "Do not generate search prompts" in prompt


def test_portfolio_prompt_requires_short_buyer_queries() -> None:
    prompt = _onboarding_portfolio_system_prompt()

    assert f"2 to {DISCOVERY_PROMPT_MAX_WORDS} words" in prompt
    assert "shortest query" in prompt
    assert "Never paste the target audience" in prompt


def _evidence() -> BrandEvidence:
    return BrandEvidence(
        pages=(
            BrandEvidencePage(
                url="https://acme.example",
                title="Acme",
                meta_description="",
                text="Shoes, clothing, and bags for families.",
                role="commercial",
            ),
        )
    )


def _research(topics: list[ResearchTopic], status: str = "ready") -> ResearchEnvelope:
    return ResearchEnvelope(
        status=status,
        profile=_profile(),
        topics=topics,
    )


def test_pass_one_admits_three_to_five_topics_and_assigns_uuid() -> None:
    topics = [
        ResearchTopic(name=name, evidence_refs=["page-1"])
        for name in ("Footwear", "Family Clothing", "Travel Bags")
    ]

    admitted = _admitted_topics(_research(topics), _evidence(), brand_name="Acme")

    assert [topic.name for topic in admitted] == [
        "Footwear",
        "Family Clothing",
        "Travel Bags",
    ]
    assert all(isinstance(topic.topic_id, uuid.UUID) for topic in admitted)


def test_pass_one_rejects_too_few_or_unbound_topics_without_padding() -> None:
    too_few = [
        ResearchTopic(name="Footwear", evidence_refs=["page-1"]),
        ResearchTopic(name="Bags", evidence_refs=["page-1"]),
    ]
    bad_ref = [
        ResearchTopic(name=name, evidence_refs=["missing"])
        for name in ("Footwear", "Clothing", "Bags")
    ]

    assert not _admitted_topics(_research(too_few), _evidence(), brand_name="Acme")
    assert not _admitted_topics(_research(bad_ref), _evidence(), brand_name="Acme")


def test_pass_one_skips_invalid_candidates_when_three_grounded_topics_remain() -> None:
    topics = [
        ResearchTopic(name="Acme Footwear", evidence_refs=["page-1"]),
        ResearchTopic(name="Footwear", evidence_refs=["page-1"]),
        ResearchTopic(name="Family Clothing", evidence_refs=["missing"]),
        ResearchTopic(name="Travel Bags", evidence_refs=["page-1"]),
        ResearchTopic(name="Family Clothing", evidence_refs=["page-1"]),
    ]

    admitted = _admitted_topics(_research(topics), _evidence(), brand_name="Acme")

    assert [topic.name for topic in admitted] == [
        "Footwear",
        "Travel Bags",
        "Family Clothing",
    ]


def test_pass_one_topic_schema_forbids_prompt_owned_fields() -> None:
    with pytest.raises(ValidationError):
        ResearchTopic.model_validate(
            {
                "name": "Footwear",
                "evidence_refs": ["page-1"],
                "customer_need": "Buy shoes",
            }
        )


def test_pass_two_drops_rows_that_try_to_output_a_theme() -> None:
    assert not _parsed_prompts(
        {
            "prompts": [
                {
                    "topic_id": str(uuid.uuid4()),
                    "text": "best walking shoes",
                    "intent": "discovery",
                    "cohort": "organic",
                    "theme": "model invented topic",
                }
            ]
        }
    )


def _portfolio_candidates(topic_ids: list[str]) -> list[dict]:
    organic_texts = (
        "what should I look for when choosing everyday footwear",
        "which family clothing options work well across seasons",
        "how do I choose a durable bag for frequent travel",
        "what footwear is comfortable for long days of walking",
        "which clothing materials are easiest for families to maintain",
        "what features matter most in cabin luggage",
        "where can I find supportive shoes for daily commuting",
        "how should I compare clothing quality before buying online",
        "which travel bags balance low weight and useful storage",
        "what makes a shoe suitable for both work and weekends",
    )
    prompts = []
    for index, text in enumerate(organic_texts):
        prompts.append(
            {
                "topic_id": topic_ids[index % len(topic_ids)],
                "text": text,
                "cohort": "organic",
                "intent": "discovery" if index % 2 == 0 else "purchase",
            }
        )
    prompts.extend(
        [
            {
                "topic_id": topic_ids[0],
                "text": "is Acme good for everyday use",
                "cohort": "brand_context",
                "intent": "discovery",
            },
            {
                "topic_id": topic_ids[-1],
                "text": "should I buy this from Acme",
                "cohort": "brand_context",
                "intent": "purchase",
            },
        ]
    )
    return prompts


def test_pass_two_selects_eight_organic_and_two_brand_context() -> None:
    topic_ids = [str(uuid.uuid4()) for _ in range(3)]
    result = select_portfolio(
        _portfolio_candidates(topic_ids),
        topic_ids=topic_ids,
        brand_terms=["Acme"],
        competitor_terms=[],
    )

    assert not result.errors
    assert len(result.accepted) == 10
    assert sum(row["cohort"] == "core" for row in result.accepted) == 8
    assert sum(row["cohort"] == "brand_diagnostic" for row in result.accepted) == 2
    assert {row["topic_id"] for row in result.accepted} == set(topic_ids)


def test_pass_two_rejects_wrong_identity_rules() -> None:
    topic_ids = [str(uuid.uuid4()) for _ in range(3)]
    candidates = _portfolio_candidates(topic_ids)
    candidates[0]["text"] = "is Acme good for this"
    candidates[-1]["text"] = "is this brand good for me"

    result = select_portfolio(
        candidates,
        topic_ids=topic_ids,
        brand_terms=["Acme"],
        competitor_terms=[],
    )

    assert not result.accepted
    assert "prompt[0].tracked_name" in result.errors
    assert "prompt[11].missing_brand_name" in result.errors


def test_pass_two_rejects_profile_prose_that_exceeds_buyer_query_length() -> None:
    topic_ids = [str(uuid.uuid4()) for _ in range(3)]
    candidates = _portfolio_candidates(topic_ids)
    candidates[0]["text"] = " ".join(["which"] * (DISCOVERY_PROMPT_MAX_WORDS + 1))

    result = select_portfolio(
        candidates,
        topic_ids=topic_ids,
        brand_terms=["Acme"],
        competitor_terms=[],
    )

    assert result.accepted
    assert all(
        len(prompt["text"].split()) <= DISCOVERY_PROMPT_MAX_WORDS
        for prompt in result.accepted
    )


def test_catalog_exposes_only_stored_visibility_cohorts() -> None:
    assert discovery_catalog()["prompt_cohorts"] == ["core", "brand_diagnostic"]


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
