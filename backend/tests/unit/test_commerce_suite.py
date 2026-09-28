from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.connectors import commerce_competitors as competitor_connector
from app.connectors.agent.gateway import FakeModelGateway
from app.connectors.commerce_competitors import CompetitorProviderUnavailable
from app.domain.commerce import competitors
from app.domain.commerce.audit_context import (
    CommerceContextError,
    freeze_commerce_context,
)
from app.domain.commerce.competitors import (
    _discovery_query,
    _host,
    _precheck,
    _validated_results,
)
from app.domain.commerce.schemas import (
    CommerceTarget,
    RecommendationSpan,
)
from app.domain.commerce.shelf import (
    _ai_observed_candidate,
    _frozen_catalog,
    _frozen_target_ids,
    _match_product,
    _merchant,
    _price,
    _resolve_span,
    _resolved_product_url,
    _ResolvedRecommendation,
    _spans,
)
from app.domain.commerce.shelf_metrics import _first_position_rate


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
async def test_audit_context_batches_target_evidence_queries() -> None:
    workspace_id = uuid.uuid4()
    project_id = uuid.uuid4()
    product_id = uuid.uuid4()
    category_id = uuid.uuid4()
    product_target = SimpleNamespace(
        id=uuid.uuid4(), target_kind="product", target_id=product_id
    )
    category_target = SimpleNamespace(
        id=uuid.uuid4(), target_kind="category", target_id=category_id
    )
    product = SimpleNamespace(
        id=product_id,
        canonical_url="https://shop.test/p",
        name="Trail Runner",
        brand="Acme",
        sku=None,
        gtin=None,
        mpn=None,
        price=None,
        currency="",
        attributes={},
        field_sources={},
    )
    category = SimpleNamespace(id=category_id, name="Running shoes")
    candidate = SimpleNamespace(
        id=uuid.uuid4(),
        target_kind="category",
        target_id=category_id,
        canonical_url="https://rival.test/p",
        product_name="Rival Runner",
        brand_name="Rival",
    )

    class Rows:
        def __init__(self, rows: list) -> None:
            self.rows = rows

        def all(self) -> list:
            return self.rows

        def __iter__(self):
            return iter(self.rows)

    class Session:
        def __init__(self) -> None:
            self.scalar_results = iter(
                [
                    Rows([product_target, category_target]),
                    Rows([product]),
                    Rows([category]),
                    Rows([candidate]),
                ]
            )
            self.scalar_calls = 0
            self.execute_calls = 0

        async def scalars(self, *_: object) -> Rows:
            self.scalar_calls += 1
            return next(self.scalar_results)

        async def execute(self, *_: object) -> Rows:
            self.execute_calls += 1
            return Rows([(category_id, product)])

    session = Session()

    context = await freeze_commerce_context(
        session,  # type: ignore[arg-type]
        workspace_id=workspace_id,
        project_id=project_id,
        prompt_ids=[uuid.uuid4(), uuid.uuid4()],
    )

    assert session.scalar_calls == 4
    assert session.execute_calls == 1
    assert context["targets"][0]["products"][0]["id"] == str(product_id)
    assert context["targets"][1]["category"]["name"] == "Running shoes"


@pytest.mark.asyncio
async def test_audit_context_rejects_a_target_without_frozen_product_evidence() -> None:
    target = SimpleNamespace(
        id=uuid.uuid4(), target_kind="product", target_id=uuid.uuid4()
    )

    class Rows:
        def __init__(self, rows: list) -> None:
            self.rows = rows

        def all(self) -> list:
            return self.rows

        def __iter__(self):
            return iter(self.rows)

    class Session:
        def __init__(self) -> None:
            self.results = iter((Rows([target]), Rows([]), Rows([])))

        async def scalars(self, *_: object) -> Rows:
            return next(self.results)

    with pytest.raises(CommerceContextError, match="no active product evidence"):
        await freeze_commerce_context(
            Session(),  # type: ignore[arg-type]
            workspace_id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            prompt_ids=[uuid.uuid4()],
        )


def test_recommendation_parser_preserves_order_observability() -> None:
    spans = _spans("1. Acme One $19 https://shop.test/one\n- Rival Two")
    assert [(row.rank, row.order_observable) for row in spans] == [
        (1, True),
        (None, False),
    ]
    assert _price(spans[0].text) == (19.0, "")
    assert _price(spans[0].text, locale="en-US") == (19.0, "USD")
    assert _merchant(spans[0].text) == (
        "https://shop.test/one",
        "shop.test",
    )


def test_unstructured_answer_remains_an_unordered_observation_span() -> None:
    assert _spans("Acme One is a useful option") == [
        type(_spans("")[0])(
            text="Acme One is a useful option",
            rank=None,
            order_observable=False,
        )
    ]


def test_unstructured_answer_is_split_into_bounded_unordered_spans() -> None:
    spans = _spans("Acme One is useful. Rival Two is cheaper; Third is compact.")

    assert [row.text for row in spans] == [
        "Acme One is useful.",
        "Rival Two is cheaper",
        "Third is compact.",
    ]
    assert all(row.rank is None and not row.order_observable for row in spans)


@pytest.mark.asyncio
async def test_structured_resolver_is_bounded_and_malformed_output_abstains() -> None:
    span = _spans("A retailer recommends Rival Runner.")[0]
    gateway = FakeModelGateway(
        '{"recommendations":[{"title":"Rival Runner","brand":"Rival",'
        '"product_url":"https://rival.test/products/runner",'
        '"merchant_url":"https://merchant.test/buy"}]}'
    )

    resolved = await _resolve_span(span, gateway=gateway)

    assert resolved is not None
    assert resolved[0].product_url == "https://rival.test/products/runner"
    assert resolved[0].merchant_url == "https://merchant.test/buy"
    assert gateway.calls[0]["schema_name"] == "commerce_recommendation_resolution"
    assert await _resolve_span(span, gateway=FakeModelGateway("not-json")) is None
    assert await _resolve_span(span, gateway=None) is None


@pytest.mark.asyncio
async def test_merchant_only_resolution_never_creates_a_competitor() -> None:
    resolved = _ResolvedRecommendation(
        title="Rival Runner", merchant_url="https://merchant.test/buy"
    )
    target = SimpleNamespace()

    assert (
        await _ai_observed_candidate(
            SimpleNamespace(),  # type: ignore[arg-type]
            target=target,  # type: ignore[arg-type]
            resolved=resolved,
            span=_spans("Rival Runner at a merchant")[0],
            citations=[],
        )
        is None
    )


def test_social_or_citation_url_cannot_become_competitor_identity() -> None:
    citation = SimpleNamespace(url="https://publisher.test/reviews/runner")

    assert _resolved_product_url("https://reddit.com/r/shoes/123", citations=[]) is None
    assert (
        _resolved_product_url(
            "https://publisher.test/reviews/runner",
            citations=[citation],  # type: ignore[list-item]
        )
        is None
    )


def test_matching_uses_frozen_measurement_product_evidence() -> None:
    product_id = uuid.uuid4()
    products, candidates = _frozen_catalog(
        {
            "products": [
                {
                    "id": str(product_id),
                    "canonical_url": "https://owned.test/frozen-runner",
                    "name": "Frozen Runner",
                    "brand": "Acme",
                    "sku": "FROZEN-1",
                    "attributes": {"colour": "blue"},
                }
            ],
            "approved_competitors": [],
        }
    )

    matched, confidence = _match_product("Try Frozen Runner", products)

    assert candidates == []
    assert matched is not None
    assert matched.id == product_id
    assert confidence == 1.0


def test_recommendation_spans_retain_continuation_lines() -> None:
    spans = _spans(
        "1. Trail Runner\nPrice $1.234,56 at https://shop.test/runner\n"
        "- City Runner\nAvailable in blue"
    )
    assert spans[0].text.endswith("https://shop.test/runner")
    assert spans[1].text.endswith("Available in blue")


@pytest.mark.parametrize(
    ("text", "locale", "expected"),
    [
        ("€1.234,56", "de-DE", (1234.56, "EUR")),
        ("USD 1,234.56", "en-US", (1234.56, "USD")),
        ("$1.234", "en-AU", (1234.0, "AUD")),
        ("$19.99", "en-CA", (19.99, "CAD")),
        ("$19.99", "en-GB", (19.99, "")),
        ("USD 12,34,56", "en-US", (None, "USD")),
    ],
)
def test_price_parsing_is_locale_safe(
    text: str, locale: str, expected: tuple[float | None, str]
) -> None:
    assert _price(text, locale=locale) == expected


def test_rank_is_present_exactly_when_order_is_observable() -> None:
    RecommendationSpan(title="One", rank=1, order_observable=True)
    RecommendationSpan(title="One", rank=None, order_observable=False)
    with pytest.raises(ValidationError):
        RecommendationSpan(title="One", rank=1, order_observable=False)
    with pytest.raises(ValidationError):
        RecommendationSpan(title="One", rank=None, order_observable=True)


def test_nested_collection_product_url_is_not_excluded() -> None:
    checked = _precheck(
        {
            "url": "https://rival.test/collections/shoes/products/trail-runner",
            "title": "Trail Runner",
        },
        owned_hosts=set(),
    )

    assert checked is not None


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


def test_first_position_win_requires_an_explicit_rank_one() -> None:
    owned_at_two = SimpleNamespace(rank=2, classification="owned")
    owned_at_one = SimpleNamespace(rank=1, classification="owned")
    assert _first_position_rate([[owned_at_two], [owned_at_one]]) == 0.5


def test_frozen_target_ids_ignore_malformed_values() -> None:
    valid = "7d071880-9984-4c80-8596-f8f946030429"
    assert _frozen_target_ids({"prompt_target_ids": [valid, "bad", None]}) == [
        uuid.UUID(valid)
    ]


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
