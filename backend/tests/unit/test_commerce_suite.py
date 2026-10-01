from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.connectors import commerce_competitors as competitor_connector
from app.connectors.commerce_competitors import CompetitorProviderUnavailable
from app.domain.commerce import competitors
from app.domain.commerce.competitors import (
    _discovery_query,
    _host,
    _validated_results,
)
from app.domain.commerce.schemas import (
    CommerceTarget,
)


@pytest.mark.asyncio
async def test_tavily_connector_uses_bounded_locale_aware_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict = {}

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"results": [{"url": "https://rival.test/p"}]}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, url: str, *, json: dict, headers: dict) -> Response:
            seen.update(url=url, json=json, headers=headers)
            return Response()

    monkeypatch.setattr(
        competitor_connector.commerce_settings, "tavily_api_key", "secret"
    )
    monkeypatch.setattr(competitor_connector.httpx, "AsyncClient", lambda **_: Client())

    results = await competitor_connector.tavily_search("trail shoes", locale="en-AU")

    assert results == [{"url": "https://rival.test/p"}]
    assert seen["json"]["query"] == "trail shoes en-AU"
    assert seen["json"]["max_results"] == 10
    assert seen["headers"] == {"Authorization": "Bearer secret"}


@pytest.mark.asyncio
async def test_tavily_connector_is_explicitly_optional(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(competitor_connector.commerce_settings, "tavily_api_key", "")
    with pytest.raises(CompetitorProviderUnavailable):
        await competitor_connector.tavily_search("trail shoes", locale="en-AU")


@pytest.mark.asyncio
async def test_marketplace_hosts_are_never_competitors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Poshmark and Stylight listings were returned as competing brands."""

    async def verify(url: str, fetcher: object, *, target_kind: str) -> bool:
        assert target_kind == "product"
        return True

    monkeypatch.setattr(competitors, "_verify_url", verify)
    results = [
        {"url": "https://poshmark.com/listing/tee", "title": "Daydreamer | Poshmark"},
        {"url": "https://www.stylight.com/red-clothing", "title": "Red Clothing"},
        {"url": "https://rival.test/p", "title": "Rival"},
    ]

    outcomes, survivors = await _validated_results(
        results, owned_hosts={"owned.test"}, target_kind="product"
    )

    assert [row[0] for row in survivors] == ["https://rival.test/p"]
    assert [row["validation_outcome"] for row in outcomes] == [
        "excluded_marketplace",
        "excluded_marketplace",
        "accepted",
    ]


@pytest.mark.asyncio
async def test_competitor_validation_is_bounded_and_records_outcomes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def verify(url: str, fetcher: object, *, target_kind: str) -> bool:
        assert target_kind == "product"
        return "dead" not in url

    monkeypatch.setattr(competitors, "_verify_url", verify)
    results = [
        {"url": "https://owned.test/p", "title": "Owned"},
        {"url": "https://rival.test/blog/guide", "title": "Guide"},
        {"url": "https://rival.test/dead", "title": "Dead"},
        {"url": "https://rival.test/p", "title": "Rival"},
        {"url": "https://rival.test/p", "title": "Duplicate"},
    ]

    outcomes, survivors = await _validated_results(
        results, owned_hosts={"owned.test"}, target_kind="product"
    )

    assert [row[0] for row in survivors] == ["https://rival.test/p"]
    assert [row["validation_outcome"] for row in outcomes] == [
        "excluded_owned_domain",
        "excluded_editorial",
        "excluded_unavailable",
        "accepted",
        "excluded_duplicate",
    ]


@pytest.mark.asyncio
async def test_category_discovery_verifies_category_pages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[tuple[str, str]] = []

    async def verify(url: str, fetcher: object, *, target_kind: str) -> bool:
        seen.append((url, target_kind))
        return target_kind == "category"

    monkeypatch.setattr(competitors, "_verify_url", verify)

    outcomes, survivors = await _validated_results(
        [{"url": "https://rival.test/shoes", "title": "Shoes"}],
        owned_hosts=set(),
        target_kind="category",
    )

    assert seen == [("https://rival.test/shoes", "category")]
    assert [row[0] for row in survivors] == ["https://rival.test/shoes"]
    assert outcomes[0]["validation_outcome"] == "accepted"


@pytest.mark.asyncio
async def test_category_verifier_accepts_a_structural_category_only_for_category_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Fetcher:
        async def fetch(self, *_: object, **__: object) -> SimpleNamespace:
            return SimpleNamespace(
                status_code=200,
                content_type="text/html",
                body=b"<html></html>",
                final_url="https://rival.test/shoes",
                charset="utf-8",
            )

    monkeypatch.setattr(competitors, "extract_page_facts", lambda *_args, **_kwargs: {})
    monkeypatch.setattr(
        competitors,
        "classify",
        lambda *_args, **_kwargs: SimpleNamespace(page_kind="category"),
    )

    assert await competitors._verify_url(
        "https://rival.test/shoes",
        Fetcher(),
        target_kind="category",  # type: ignore[arg-type]
    )
    assert not await competitors._verify_url(
        "https://rival.test/shoes",
        Fetcher(),
        target_kind="product",  # type: ignore[arg-type]
    )


def test_owned_host_normalization_accepts_urls_and_bare_domains() -> None:
    assert _host("https://www.Example.com/catalog") == "example.com"
    assert _host("WWW.Example.com") == "example.com"


def test_discovery_queries_distinguish_product_and_category_targets() -> None:
    target_id = uuid.uuid4()
    product = CommerceTarget(kind="product", id=target_id)
    category = CommerceTarget(kind="category", id=target_id)
    # Merchant intent, not ranking intent: "leading X brands" is the phrasing
    # that returned "The 5 Best ... Tested & Reviewed" as a competitor.
    assert _discovery_query(product, "Trail Runner") == "buy Trail Runner online store"
    assert _discovery_query(category, "Running shoes") == (
        "buy Running shoes online store"
    )
    assert (
        _discovery_query(
            product,
            "Trail Runner",
            {
                "attributes": {"product_type": "trail shoe", "colour": "blue"},
                "price": 129.0,
                "currency": "AUD",
            },
        )
        == "buy Trail Runner trail shoe blue price AUD 75 to 200 online store"
    )


@pytest.mark.asyncio
async def test_a_failed_verification_does_not_consume_an_accept_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verification runs concurrently, but the limit still counts acceptances."""

    async def verify(url: str, fetcher: object, *, target_kind: str) -> bool:
        assert target_kind == "product"
        return "dead" not in url

    monkeypatch.setattr(competitors, "_verify_url", verify)
    results = [{"url": "https://rival.test/dead", "title": "Dead"}] + [
        {"url": f"https://rival{index}.test/p", "title": f"Rival {index}"}
        for index in range(6)
    ]

    outcomes, survivors = await _validated_results(
        results, owned_hosts=set(), target_kind="product"
    )

    assert len(survivors) == 5
    assert [row["validation_outcome"] for row in outcomes] == [
        "excluded_unavailable",
        *["accepted"] * 5,
        "excluded_limit",
    ]


def test_a_review_listicle_is_never_a_competitor_candidate() -> None:
    """The exact result that shipped Serious Eats as a cookware competitor.

    The only editorial gate was four path tokens (`/blog/`, `/news/`,
    `/article/`, `/search`), and a review URL need contain none of them.
    """
    from app.domain.commerce.competitors import _precheck_result

    listicle = {
        "url": "https://www.seriouseats.com/best-stainless-steel-cookware-sets-11800000",
        "title": "The 5 Best Stainless Steel Cookware Sets of 2026, Tested & Reviewed",
        "content": "We tested 21 sets.",
    }
    checked, outcome = _precheck_result(listicle, owned_hosts=set())
    assert checked is None
    assert outcome == "excluded_editorial"


def test_a_merchant_page_survives_the_editorial_gate() -> None:
    """The pattern must not swallow a shop that happens to say "best sellers"."""
    from app.domain.commerce.competitors import _precheck_result

    merchant = {
        "url": "https://www.all-clad.com/cookware-sets",
        "title": "Best Sellers | Premium Pot & Pan Sets by All-Clad",
        "content": "Shop cookware sets.",
    }
    checked, outcome = _precheck_result(merchant, owned_hosts=set())
    assert outcome == "eligible"
    assert checked is not None


def test_merchant_review_and_recommendation_routes_are_not_editorial() -> None:
    """A shop's own reviews tab or recommendations shelf is still a shop.

    The patterns match the canonical URL AND the title, so the bare words
    `review` and `recommendations` excluded every merchant carrying either.
    """
    from app.domain.commerce.competitors import _precheck_result

    for url, title in (
        ("https://www.all-clad.com/reviews", "Customer Reviews | All-Clad"),
        (
            "https://www.all-clad.com/product-recommendations",
            "Recommendations for you | All-Clad",
        ),
        ("https://www.lodgecastiron.com/skillets", "Cast Iron Skillets | Lodge"),
    ):
        checked, outcome = _precheck_result(
            {"url": url, "title": title, "content": "Shop."}, owned_hosts=set()
        )
        assert outcome == "eligible", (url, title)
        assert checked is not None


def test_editorial_phrases_still_exclude_a_listicle() -> None:
    from app.domain.commerce.competitors import _precheck_result

    for title in (
        "The 5 Best Stainless Steel Cookware Sets of 2026, Tested & Reviewed",
        "Best Meat Thermometers: Reviews and Buying Guide",
        "Our Expert Picks for Kitchen Thermometers",
        "We Tested 21 Cookware Sets",
    ):
        checked, outcome = _precheck_result(
            {"url": "https://www.example-magazine.com/x", "title": title},
            owned_hosts=set(),
        )
        assert outcome == "excluded_editorial", title
        assert checked is None
