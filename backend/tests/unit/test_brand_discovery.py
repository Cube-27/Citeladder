"""Unit coverage for the greenfield brand-discovery boundary."""

import pytest

from app.domain.projects.discovery import (
    BrandDiscoveryError,
    _candidate_name,
    _confirmed_competitors,
    _normalized_url,
    discovery_catalog,
)
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryConfirm,
    DiscoveryProfile,
)
from app.domain.projects.schemas import CompetitorInput


def test_discovery_catalog_declares_required_inputs_and_evidence_methods() -> None:
    catalog = discovery_catalog()

    assert catalog["required_fields"] == [
        "brand_name",
        "website_url",
        "industry",
        "business_type",
    ]
    assert catalog["business_types"] == ["b2b", "b2c", "both"]
    assert set(catalog["capture_methods"]) == {
        "secure_crawler",
        "firecrawl_rendered",
        "firecrawl_search",
        "user_input",
    }


@pytest.mark.parametrize(
    "value",
    [
        "localhost",
        "http://127.0.0.1",
        "http://10.0.0.8",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]",
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


def _confirmation(competitor: CompetitorInput) -> BrandDiscoveryConfirm:
    return BrandDiscoveryConfirm(
        profile=DiscoveryProfile(
            industry="Retail", business_type="b2c", description="Confirmed"
        ),
        domains=["acme.example"],
        competitors=[competitor],
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
