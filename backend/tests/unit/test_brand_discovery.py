"""Unit coverage for the greenfield brand-discovery boundary."""

import pytest
from pydantic import ValidationError

from app.connectors.web_evidence.brand_evidence import BrandEvidencePage
from app.connectors.web_evidence.firecrawl import FirecrawlPage
from app.domain.projects import discovery as discovery_domain
from app.domain.projects.brand_evidence import BrandEvidence
from app.domain.projects.discovery import (
    BrandDiscoveryError,
    _candidate_name,
    _collect_owned_site,
    _confirmed_competitors,
    _normalized_url,
    _validated_prompt_suggestions,
    discovery_catalog,
)
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryConfirm,
    BrandDiscoveryCreate,
    DiscoveryProfile,
    DiscoverySynthesis,
)
from app.domain.projects.schemas import CompetitorInput
from app.models.discovery import BrandDiscovery


def test_discovery_catalog_declares_required_inputs_and_evidence_methods() -> None:
    catalog = discovery_catalog()

    assert catalog["required_fields"] == ["brand_name", "website_url"]
    assert catalog["business_types"] == ["b2b", "b2c", "both"]
    assert set(catalog["capture_methods"]) == {
        "secure_crawler",
        "firecrawl_rendered",
        "firecrawl_search",
        "user_input",
    }


def test_discovery_requires_the_official_website_anchor() -> None:
    with pytest.raises(ValidationError):
        BrandDiscoveryCreate(brand_name="Acme")


@pytest.mark.asyncio
async def test_owned_site_collection_crawls_the_user_supplied_website(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    crawled_urls: list[str] = []

    async def approve(url: str) -> None:
        crawled_urls.append(f"approved:{url}")

    async def collect(url: str) -> BrandEvidence:
        crawled_urls.append(f"secure:{url}")
        return BrandEvidence(
            pages=(
                BrandEvidencePage(
                    url=url,
                    title="Acme",
                    meta_description="Analytics for marketing teams",
                    text="First-party product evidence",
                ),
            )
        )

    async def render(url: str) -> FirecrawlPage:
        crawled_urls.append(f"firecrawl:{url}")
        return FirecrawlPage(url=url, title="Acme", text="Rendered product evidence")

    monkeypatch.setattr(discovery_domain, "_approve_vendor_url", approve)
    monkeypatch.setattr(discovery_domain, "collect_brand_evidence", collect)
    monkeypatch.setattr(discovery_domain, "rendered_scrape", render)
    row = BrandDiscovery(
        input_data={"brand_name": "Acme", "website_url": "www.acme.example/products"}
    )

    result = await _collect_owned_site(row, row.input_data)

    assert result.homepage.startswith("https://www.acme.example/products")
    assert result.owned_domain == "acme.example"
    assert crawled_urls == [
        f"approved:{result.homepage}",
        f"secure:{result.homepage}",
        f"firecrawl:{result.homepage}",
    ]
    assert "First-party product evidence" in result.captured_text
    assert "Rendered product evidence" in result.captured_text


@pytest.mark.parametrize(
    "value",
    [
        "localhost",
        "http://127.0.0.1",
        "http://10.0.0.8",
        "http://172.16.0.1",
        "http://192.168.1.1",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]",
        "http://[fc00::1]",
        "file:///etc/passwd",
        "not a valid host",
    ],
)
def test_normalized_url_rejects_malformed_and_non_public_targets(value: str) -> None:
    with pytest.raises(BrandDiscoveryError):
        _normalized_url(value)


def test_normalized_url_canonicalizes_and_derives_owned_domain() -> None:
    url, domain = _normalized_url("WWW.Example.COM/products/?utm_source=test")

    assert url.startswith("https://www.example.com/products")
    assert domain == "example.com"


def test_candidate_name_uses_title_then_domain_without_inventing_identity() -> None:
    assert _candidate_name("Acme | Official Website", "acme.example") == "Acme"
    assert _candidate_name("", "shop.example.com") == "Shop"


def test_discovery_prompt_validation_enforces_core_and_comparison_identity() -> None:
    synthesis = DiscoverySynthesis.model_validate(
        {
            "profile": {"business_type": "b2b"},
            "competitors": [],
            "topics": ["Analytics"],
            "prompts": [
                {
                    "text": "Which analytics platforms support marketing attribution?",
                    "theme": "Analytics",
                    "intent": "discovery",
                    "cohort": "core",
                },
                {
                    "text": "Is Acme a good analytics platform?",
                    "theme": "Analytics",
                    "intent": "discovery",
                    "cohort": "core",
                },
                {
                    "text": "How does Acme compare with Globex for attribution?",
                    "theme": "Analytics",
                    "intent": "comparison",
                    "cohort": "comparison",
                },
                {
                    "text": "How does Acme compare with other platforms?",
                    "theme": "Analytics",
                    "intent": "comparison",
                    "cohort": "comparison",
                },
            ],
        }
    )

    prompts = _validated_prompt_suggestions(
        synthesis,
        brand_name="Acme",
        competitors=[{"name": "Globex", "aliases": [], "domains": ["globex.com"]}],
    )

    assert [prompt["text"] for prompt in prompts] == [
        "Which analytics platforms support marketing attribution?",
        "How does Acme compare with Globex for attribution?",
    ]


def _confirmation(competitor: CompetitorInput) -> BrandDiscoveryConfirm:
    return BrandDiscoveryConfirm(
        profile=DiscoveryProfile(
            industry="Retail", business_type="b2c", description="Confirmed"
        ),
        domains=["acme.example"],
        competitors=[competitor],
        prompts=[
            {
                "text": "Which products solve this need?",
                "theme": "General",
                "intent": "discovery",
                "cohort": "core",
            }
        ],
    )


def test_confirmed_competitors_reject_brand_identity_and_owned_domain() -> None:
    with pytest.raises(BrandDiscoveryError, match="tracked brand"):
        _confirmed_competitors(
            _confirmation(CompetitorInput(name="Acme", domains=["other.example"])),
            brand_name="Acme",
            owned_domains=["acme.example"],
        )
    with pytest.raises(BrandDiscoveryError, match="owned domain"):
        _confirmed_competitors(
            _confirmation(CompetitorInput(name="Globex", domains=["acme.example"])),
            brand_name="Acme",
            owned_domains=["acme.example"],
        )


def test_confirmed_competitors_normalize_domains_and_reject_duplicates() -> None:
    confirmed = _confirmed_competitors(
        _confirmation(
            CompetitorInput(
                name="Globex",
                domains=["https://www.globex.example/pricing", "globex.example"],
            )
        ),
        brand_name="Acme",
        owned_domains=["acme.example"],
    )
    assert confirmed[0]["domains"] == ["globex.example"]
