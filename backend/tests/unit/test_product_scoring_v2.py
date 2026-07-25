"""Analyzer v2 unit tests (M2a, invariant 9).

Pins the §5 semantics owned by ``core/config/commerce.py``: win rate
(enumeration-gated denominator), price relation direction, the shared
line-clipped extraction window (no neighbor theft, original offsets),
category-keyed attribute dimensions, buyer-destination extraction +
classification + mix ordering, competitor co-placement (ordering + cap),
and byte-level determinism. Pure functions only — no DB.

Complements ``test_product_scoring.py`` (M1), which pins the
v1-compatible surface this version extends.
"""

from __future__ import annotations

import json
import uuid

import pytest

from app.analysis.product_scoring import (
    CompetitorProductEntry,
    ProductEntry,
    ProductScoringConfig,
    aggregate_product_run,
    classify_destination,
    extract_destination_urls,
    price_matches_catalog,
    price_relation,
    score_product_execution,
)
from app.core.config.commerce import (
    ATTRIBUTE_DIMENSION_GROUPS,
    ATTRIBUTE_DIMENSIONS,
    CO_PLACEMENT_MAX_PAIRS,
)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _own_entry(
    entry_id: str = "p1",
    *,
    category: str = "",
    price: float | None = 2499.0,
    currency: str = "USD",
) -> ProductEntry:
    return ProductEntry(
        id=entry_id,
        sku="VC-500",
        name="VoltCity Commuter 500",
        aliases=("VoltCity Commuter 500", "VoltCity 500"),
        price=price,
        currency=currency,
        attributes={"category": category} if category else {},
        category=category,
    )


def _competitor_entry(
    entry_id: str = "c1",
    *,
    competitor: str = "RideCore",
    name: str = "RideCore CityCommuter 450",
    price: float | None = 2399.0,
) -> CompetitorProductEntry:
    return CompetitorProductEntry(
        id=entry_id,
        competitor=competitor,
        name=name,
        aliases=(name,),
        price=price,
        currency="USD",
    )


def _config(
    *,
    products: tuple[ProductEntry, ...] = (_own_entry(),),
    competitor_products: tuple[CompetitorProductEntry, ...] = (_competitor_entry(),),
    owned_domains: tuple[str, ...] = ("acme.com",),
) -> ProductScoringConfig:
    return ProductScoringConfig(
        products=products,
        competitor_products=competitor_products,
        owned_domains=owned_domains,
    )


def _signals(
    entry_id: str,
    *,
    competitor: bool = False,
    mentioned: bool = True,
    rank: int | None = 1,
    relation: str | None = None,
    matches: bool | None = None,
    price: float | None = 2499.0,
    attributes: list[dict] | None = None,
    merchants: list[dict] | None = None,
) -> dict:
    key = "competitor_product_id" if competitor else "product_id"
    return {
        key: entry_id,
        "mentioned": mentioned,
        "first_offset": 3 if mentioned else None,
        "rank_position": rank,
        "price_text": "$2,499.00" if price is not None else "",
        "price_value": price,
        "price_currency": "USD" if price is not None else "",
        "price_matches_catalog": matches,
        "price_relation": relation,
        "attribute_mentions": list(attributes or []),
        "merchant_mentions": list(merchants or []),
    }


def _score(
    *,
    own: list[dict] | None = None,
    competitor: list[dict] | None = None,
    mentioned_ids: list[str] | None = None,
) -> dict:
    own_rows = list(own or [])
    competitor_rows = list(competitor or [])
    if mentioned_ids is None:
        mentioned_ids = [
            *[r["product_id"] for r in own_rows if r["mentioned"]],
            *[r["competitor_product_id"] for r in competitor_rows if r["mentioned"]],
        ]
    return {
        "products": own_rows,
        "competitor_products": competitor_rows,
        "own_product_mention_count": sum(1 for r in own_rows if r["mentioned"]),
        "competitor_product_mention_count": sum(
            1 for r in competitor_rows if r["mentioned"]
        ),
        "products_with_price_match": 0,
        "mentioned_entry_ids": mentioned_ids,
    }


# ---------------------------------------------------------------------------
# Win rate (PRODUCT_WIN_REQUIRES_ENUMERATION denominator)
# ---------------------------------------------------------------------------
def test_win_rate_rank_one_win_and_ranked_non_win() -> None:
    config = _config()
    # One rank-1 win + one rank-2 non-win over two executions -> 0.5.
    scores = [
        _score(own=[_signals("p1", rank=1)]),
        _score(own=[_signals("p1", rank=2)]),
    ]
    aggregates = aggregate_product_run(scores, config)
    assert aggregates["p1"]["win_rate"] == 0.5
    # A lone rank-1 mention is a perfect rate; a lone rank-2 is an exact 0.0
    # (not null — the denominator is non-zero).
    assert aggregate_product_run(scores[:1], config)["p1"]["win_rate"] == 1.0
    assert aggregate_product_run(scores[1:], config)["p1"]["win_rate"] == 0.0


def test_win_rate_null_without_ranked_mention() -> None:
    config = _config()
    # Mentioned in prose only (no enumeration) -> no ranked rows -> null.
    scores = [_score(own=[_signals("p1", rank=None)])]
    aggregates = aggregate_product_run(scores, config)
    assert aggregates["p1"]["mention_count"] == 1
    assert aggregates["p1"]["win_rate"] is None


def test_win_rate_competitor_only_enumeration_not_a_loss() -> None:
    config = _config()
    # The execution enumerates ONLY the competitor: the SKU is absent, which
    # is invisible to win rate (null), never a 0.0 loss.
    scores = [
        _score(
            own=[_signals("p1", mentioned=False, rank=None, price=None)],
            competitor=[_signals("c1", competitor=True, rank=1)],
        )
    ]
    aggregates = aggregate_product_run(scores, config)
    assert aggregates["p1"]["mention_count"] == 0
    assert aggregates["p1"]["win_rate"] is None


def test_win_rate_competitor_sku_parity() -> None:
    config = _config()
    # Competitor entries follow the same enumeration-gated math.
    scores = [
        _score(competitor=[_signals("c1", competitor=True, rank=1)]),
        _score(competitor=[_signals("c1", competitor=True, rank=None)]),
    ]
    aggregates = aggregate_product_run(scores, config)
    competitor = aggregates["c1"]
    assert competitor["mention_count"] == 2
    # Only the ranked row enters the denominator -> 1/1 = 1.0.
    assert competitor["win_rate"] == 1.0


# ---------------------------------------------------------------------------
# Price relation (direction + compatibility bool)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("mentioned", "catalog", "expected_relation", "expected_bool"),
    [
        (2499.0, 2499.0, "match", True),  # exact
        (2623.95, 2499.0, "match", True),  # exactly at the 5% tolerance edge
        (2498.0, 2499.0, "match", True),  # inside the $1 absolute floor
        (3000.0, 2499.0, "higher", False),
        (2000.0, 2499.0, "lower", False),
    ],
)
def test_price_relation_direction_and_compat_bool(
    mentioned: float,
    catalog: float,
    expected_relation: str,
    expected_bool: bool,
) -> None:
    entry = _own_entry(price=catalog)
    assert price_relation(mentioned, "USD", entry) == expected_relation
    # The legacy compatibility boolean keeps being written beside it.
    assert price_matches_catalog(mentioned, "USD", entry) is expected_bool


def test_price_relation_unverifiable_cases() -> None:
    # Absent catalog price -> null direction AND null bool.
    no_price = _own_entry(price=None, currency="")
    assert price_relation(2499.0, "USD", no_price) is None
    assert price_matches_catalog(2499.0, "USD", no_price) is None
    # Conflicting currencies -> unverifiable, never a mismatch direction.
    usd_entry = _own_entry(price=2499.0, currency="USD")
    assert price_relation(2499.0, "EUR", usd_entry) is None
    assert price_matches_catalog(2499.0, "EUR", usd_entry) is None


# ---------------------------------------------------------------------------
# Shared line-clipped window (original offsets; no neighbor theft)
# ---------------------------------------------------------------------------
def test_window_stays_on_the_mention_line() -> None:
    # Item 1 has NO evidence of its own; every signal on item 2's line must
    # stay with item 2 even though the raw 160/200-char windows overlap.
    text = (
        "1. VoltCity Commuter 500\n"
        "2. RideCore CityCommuter 450 — $2,399.00 with free shipping, "
        "see https://walmart.com/ridecore"
    )
    score = score_product_execution(answer_text=text, config=_config())
    own = score["products"][0]
    assert own["mentioned"] is True
    assert own["price_value"] is None
    assert own["price_text"] == ""
    assert own["price_relation"] is None
    assert own["attribute_mentions"] == []
    assert own["merchant_mentions"] == []

    competitor = score["competitor_products"][0]
    assert competitor["price_value"] == 2399.0
    # Offsets are in ORIGINAL-text absolute coordinates (not segment-local).
    assert competitor["price_text"] == "$2,399.00"
    assert text.index("$2,399.00") > text.index("\n")
    # "free shipping" fires the phrase itself AND the bare "shipping" token
    # inside it (distinct offsets -> two observations of one dimension).
    attributes = competitor["attribute_mentions"]
    assert [(a["dimension"], a["text"]) for a in attributes] == [
        ("shipping", "free shipping"),
        ("shipping", "shipping"),
    ]
    for attribute in attributes:
        end = attribute["offset"] + len(attribute["text"])
        assert text[attribute["offset"] : end] == attribute["text"]
    [merchant] = competitor["merchant_mentions"]
    assert merchant["merchant_name"] == "Walmart"
    assert merchant["merchant_domain"] == "walmart.com"
    assert merchant["merchant_kind"] == "retailer"
    assert merchant["destination_url"] == "https://walmart.com/ridecore"
    # The first same-line price rides along as merchant price evidence.
    assert merchant["price_value"] == 2399.0
    assert merchant["price_currency"] == "USD"


def test_window_offsets_are_absolute_and_extraction_is_symmetric() -> None:
    # The mirror image: item 1 carries the evidence, item 2 stays clean.
    text = (
        "1. VoltCity Commuter 500 — $2,499.00 with free shipping\n"
        "2. RideCore CityCommuter 450"
    )
    score = score_product_execution(answer_text=text, config=_config())
    own = score["products"][0]
    assert own["price_value"] == 2499.0
    assert own["price_relation"] == "match"
    attributes = own["attribute_mentions"]
    assert [(a["dimension"], a["text"]) for a in attributes] == [
        ("shipping", "free shipping"),
        ("shipping", "shipping"),
    ]
    assert attributes[0]["offset"] == text.index("free shipping")
    assert attributes[1]["offset"] == text.index("free shipping") + len("free ")
    competitor = score["competitor_products"][0]
    assert competitor["price_value"] is None
    assert competitor["attribute_mentions"] == []
    assert competitor["merchant_mentions"] == []


# ---------------------------------------------------------------------------
# Attribute dimensions (category-keyed; DEFAULT always; frequency only)
# ---------------------------------------------------------------------------
def test_attributes_footwear_category_plus_default() -> None:
    config = _config(products=(_own_entry(category="footwear"),))
    text = (
        "1. VoltCity Commuter 500 — true to size with arch support, "
        "waterproof materials and a warranty, $2,499.00"
    )
    score = score_product_execution(answer_text=text, config=config)
    mentions = score["products"][0]["attribute_mentions"]
    by_dimension = {item["dimension"]: item for item in mentions}
    # footwear extras + DEFAULT dimensions in one pass. ("true to size" also
    # fires the DEFAULT "sizing" phrase "size" at its own offset.)
    assert set(by_dimension) == {
        "fit",  # footwear/ratings ("true to size")
        "sizing",  # DEFAULT/facts ("size" inside "true to size")
        "support",  # footwear/characteristics ("arch support")
        "waterproofing",  # footwear/characteristics ("waterproof")
        "materials",  # DEFAULT/characteristics ("materials")
        "warranty",  # DEFAULT/facts ("warranty")
    }
    assert by_dimension["fit"]["group"] == "ratings"
    assert by_dimension["support"]["group"] == "characteristics"
    assert by_dimension["warranty"]["group"] == "facts"
    assert by_dimension["sizing"]["group"] == "facts"
    # Every group is one of the pinned vocabulary values.
    assert {item["group"] for item in mentions} <= ATTRIBUTE_DIMENSION_GROUPS
    # Frequency has no valence: exactly the pinned 4-key shape.
    for item in mentions:
        assert set(item) == {"dimension", "group", "text", "offset"}
        # Absolute original-text offsets with the exact matched substring.
        assert text[item["offset"] : item["offset"] + len(item["text"])] == item["text"]
    # Position-ordered by (offset, dimension, group).
    assert [item["offset"] for item in mentions] == sorted(
        item["offset"] for item in mentions
    )


def test_attributes_dedupe_same_offset_phrase_variants() -> None:
    # "water resistant" and "water-resistant" normalize to the same tokens:
    # one observation, not two (dedupe by dimension/group/offset).
    config = _config(products=(_own_entry(category="footwear"),))
    text = "1. VoltCity Commuter 500 — water-resistant upper, $2,499.00"
    score = score_product_execution(answer_text=text, config=config)
    mentions = score["products"][0]["attribute_mentions"]
    waterproofing = [m for m in mentions if m["dimension"] == "waterproofing"]
    assert len(waterproofing) == 1
    assert waterproofing[0]["offset"] == text.index("water-resistant")


@pytest.mark.parametrize(
    ("category", "phrase", "dimension", "group"),
    [
        ("outerwear", "windproof shell", "weather_protection", "characteristics"),
        ("accessories", "compatible with most racks", "compatibility", "facts"),
    ],
)
def test_attributes_each_approved_category(
    category: str, phrase: str, dimension: str, group: str
) -> None:
    config = _config(products=(_own_entry(category=category),))
    text = f"1. VoltCity Commuter 500 — {phrase}, $2,499.00"
    score = score_product_execution(answer_text=text, config=config)
    mentions = score["products"][0]["attribute_mentions"]
    matched = [m for m in mentions if m["dimension"] == dimension]
    assert len(matched) == 1
    assert matched[0]["group"] == group


@pytest.mark.parametrize("category", ["spaceships", ""])
def test_attributes_unknown_or_empty_category_falls_back_to_default(
    category: str,
) -> None:
    config = _config(products=(_own_entry(category=category),))
    text = (
        "1. VoltCity Commuter 500 — arch support with free shipping, $2,499.00"
    )
    score = score_product_execution(answer_text=text, config=config)
    mentions = score["products"][0]["attribute_mentions"]
    # DEFAULT dimensions only: "arch support" (footwear) is NOT evaluated.
    # ("free shipping" + the bare "shipping" inside it = two observations.)
    assert [m["dimension"] for m in mentions] == ["shipping", "shipping"]


def test_attributes_competitor_entries_use_default_only() -> None:
    config = _config()
    text = "1. RideCore CityCommuter 450 — arch support with a warranty, $2,399.00"
    score = score_product_execution(answer_text=text, config=config)
    mentions = score["competitor_products"][0]["attribute_mentions"]
    assert [m["dimension"] for m in mentions] == ["warranty"]


# ---------------------------------------------------------------------------
# Buyer destinations (extract + sanitize + classify)
# ---------------------------------------------------------------------------
def test_extract_destination_urls_sanitizes_and_dedupes() -> None:
    text = (
        "1. VoltCity Commuter 500 — compare "
        "https://user:pass@acme.com/p?gclid=123&utm_source=x&sku=42#frag and "
        "[buy](https://acme.com/p?utm_source=x) plus "
        "https://www.amazon.com/dp/B00ABC?tag=aff-20."
    )
    # A wider explicit window keeps the whole fixture line in scope (the
    # default 200-char line-clipped window is covered by the theft tests).
    destinations = extract_destination_urls(text, text.index("compare"), window=500)
    urls = [item["url"] for item in destinations]
    # Credentials/fragment/non-allowlisted params stripped; utm_* kept; the
    # markdown target dedupes against the same sanitized URL (first wins);
    # trailing sentence punctuation is not part of the destination.
    assert urls == [
        "https://acme.com/p?utm_source=x",
        "https://www.amazon.com/dp/B00ABC",
    ]
    # Absolute original-text offsets, position-ordered.
    assert destinations[0]["offset"] == text.index("https://user:pass@acme.com")
    assert destinations[1]["offset"] == text.index("https://www.amazon.com")
    assert destinations[0]["offset"] < destinations[1]["offset"]


@pytest.mark.parametrize(
    ("url", "expected_name", "expected_domain", "expected_kind"),
    [
        ("https://acme.com/p/x", "acme.com", "acme.com", "brand_site"),
        # Subdomain of a configured merchant matches; normalize_domain strips
        # the "www." prefix from the persisted merchant_domain.
        ("https://www.amazon.com/dp/1", "Amazon", "amazon.com", "marketplace"),
        ("https://ebay.com/itm/1", "eBay", "ebay.com", "marketplace"),
        ("https://www.walmart.com/ip/1", "Walmart", "walmart.com", "retailer"),
        ("https://bestbuy.com/p/1", "Best Buy", "bestbuy.com", "retailer"),
        # Suffix-safe: NOT a subdomain of amazon.com.
        ("https://notamazon.com/x", "notamazon.com", "notamazon.com", "other"),
        ("https://shop.example.com/x", "shop.example.com", "shop.example.com", "other"),
    ],
)
def test_classify_destination_kinds(
    url: str, expected_name: str, expected_domain: str, expected_kind: str
) -> None:
    classification = classify_destination(url, owned_domains=("acme.com",))
    assert classification == {
        "merchant_name": expected_name,
        "merchant_domain": expected_domain,
        "merchant_kind": expected_kind,
    }


# ---------------------------------------------------------------------------
# Buyer-destination mix (aggregate shape + pinned ordering)
# ---------------------------------------------------------------------------
def _merchant(kind: str, domain: str, name: str) -> dict:
    return {
        "merchant_name": name,
        "merchant_domain": domain,
        "merchant_kind": kind,
        "destination_url": f"https://{domain}/x",
        "price_text": "",
        "price_value": None,
        "price_currency": "",
    }


def test_buyer_destination_mix_exact_shape_and_ordering() -> None:
    config = _config()
    scores = [
        _score(
            own=[
                _signals(
                    "p1",
                    merchants=[
                        _merchant("marketplace", "amazon.com", "Amazon"),
                        _merchant("retailer", "walmart.com", "Walmart"),
                        _merchant("brand_site", "acme.com", "acme.com"),
                    ],
                )
            ]
        ),
        _score(
            own=[
                _signals(
                    "p1",
                    merchants=[
                        _merchant("marketplace", "amazon.com", "Amazon"),
                        _merchant("other", "shop.example.com", "shop.example.com"),
                    ],
                )
            ]
        ),
    ]
    mix = aggregate_product_run(scores, config)["p1"]["buyer_destination_mix"]
    # Strict shape: exactly these keys at both levels.
    assert set(mix) == {"total", "by_kind", "by_domain"}
    assert mix["total"] == 5
    # by_kind: (-count, merchant_kind) — marketplace(2) first, then the three
    # singleton kinds alphabetically.
    assert mix["by_kind"] == [
        {"merchant_kind": "marketplace", "count": 2},
        {"merchant_kind": "brand_site", "count": 1},
        {"merchant_kind": "other", "count": 1},
        {"merchant_kind": "retailer", "count": 1},
    ]
    # by_domain: (-count, merchant_domain, merchant_name, merchant_kind).
    assert mix["by_domain"] == [
        {
            "merchant_domain": "amazon.com",
            "merchant_name": "Amazon",
            "merchant_kind": "marketplace",
            "count": 2,
        },
        {
            "merchant_domain": "acme.com",
            "merchant_name": "acme.com",
            "merchant_kind": "brand_site",
            "count": 1,
        },
        {
            "merchant_domain": "shop.example.com",
            "merchant_name": "shop.example.com",
            "merchant_kind": "other",
            "count": 1,
        },
        {
            "merchant_domain": "walmart.com",
            "merchant_name": "Walmart",
            "merchant_kind": "retailer",
            "count": 1,
        },
    ]
    # Repeated aggregation of identical rows is byte-equal.
    again = aggregate_product_run(scores, config)["p1"]["buyer_destination_mix"]
    assert json.dumps(mix, sort_keys=True) == json.dumps(again, sort_keys=True)


# ---------------------------------------------------------------------------
# Competitor co-placement (shape, ordering, cap boundary)
# ---------------------------------------------------------------------------
def _uuid(index: int) -> str:
    return str(uuid.UUID(int=index + 1))


def _co_placement_config(competitor_count: int) -> ProductScoringConfig:
    competitors = tuple(
        _competitor_entry(
            _uuid(index),
            competitor=f"Competitor{index:04d}",
            name=f"Competitor{index:04d} Bike",
        )
        for index in range(competitor_count)
    )
    return _config(
        products=(_own_entry(_uuid(10_000)),), competitor_products=competitors
    )


def test_co_placement_shape_counts_and_ordering() -> None:
    config = _config(
        competitor_products=(
            _competitor_entry(_uuid(0), competitor="ridecore", name="Zeta Bike"),
            _competitor_entry(_uuid(1), competitor="RideCore", name="Alpha Bike"),
            _competitor_entry(_uuid(2), competitor="acme rival", name="Mid Bike"),
        )
    )
    # p1 co-mentioned with all three in execution 1; only c0/c1 in execution 2.
    scores = [
        _score(
            own=[_signals("p1")],
            competitor=[
                _signals(_uuid(0), competitor=True),
                _signals(_uuid(1), competitor=True),
                _signals(_uuid(2), competitor=True),
            ],
        ),
        _score(
            own=[_signals("p1")],
            competitor=[
                _signals(_uuid(0), competitor=True),
                _signals(_uuid(1), competitor=True),
            ],
        ),
    ]
    co_placement = aggregate_product_run(scores, config)["p1"][
        "competitor_co_placement"
    ]
    # Always-present shape, including ``truncated`` when false.
    assert set(co_placement) == {"items", "truncated"}
    assert co_placement["truncated"] is False
    # (-count, casefolded competitor name, casefolded product name, id):
    # count 2 first — "RideCore"/"Alpha Bike" before "ridecore"/"Zeta Bike"
    # (competitor name casefolds equal? no: "ridecore" == "ridecore" -> the
    # product name breaks the tie), then the count-1 pair.
    assert co_placement["items"] == [
        {
            "competitor_product_id": _uuid(1),
            "competitor_name": "RideCore",
            "product_name": "Alpha Bike",
            "count": 2,
        },
        {
            "competitor_product_id": _uuid(0),
            "competitor_name": "ridecore",
            "product_name": "Zeta Bike",
            "count": 2,
        },
        {
            "competitor_product_id": _uuid(2),
            "competitor_name": "acme rival",
            "product_name": "Mid Bike",
            "count": 1,
        },
    ]


def test_co_placement_competitor_entry_pairs_exclude_own_products() -> None:
    config = _config()
    own_id = "p1"
    # c1 co-mentioned with the OWN product + competitor c2: only other
    # competitor products count as c1's pairs.
    two_competitors = _config(
        competitor_products=(
            _competitor_entry("c1", competitor="RideCore", name="RideCore A"),
            _competitor_entry("c2", competitor="Globex", name="Globex B"),
        )
    )
    scores = [
        _score(
            own=[_signals(own_id)],
            competitor=[
                _signals("c1", competitor=True),
                _signals("c2", competitor=True),
            ],
        )
    ]
    aggregates = aggregate_product_run(scores, two_competitors)
    assert aggregates["c1"]["competitor_co_placement"]["items"] == [
        {
            "competitor_product_id": None,  # "c2" is not a UUID
            "competitor_name": "Globex",
            "product_name": "Globex B",
            "count": 1,
        }
    ]
    # The own product never appears as a "competitor" pair.
    assert config is not None  # keep the base config referenced
    own_pairs = aggregates[own_id]["competitor_co_placement"]["items"]
    assert {item["product_name"] for item in own_pairs} == {
        "RideCore A",
        "Globex B",
    }


def test_co_placement_exact_cap_boundary_and_truncation() -> None:
    # Exactly CO_PLACEMENT_MAX_PAIRS pairs -> all kept, truncated False.
    at_cap = _co_placement_config(CO_PLACEMENT_MAX_PAIRS)
    own_id = at_cap.products[0].id
    score = _score(
        own=[_signals(own_id)],
        competitor=[
            _signals(entry.id, competitor=True) for entry in at_cap.competitor_products
        ],
    )
    aggregate = aggregate_product_run([score], at_cap)[own_id][
        "competitor_co_placement"
    ]
    assert len(aggregate["items"]) == CO_PLACEMENT_MAX_PAIRS
    assert aggregate["truncated"] is False

    # One pair over the cap -> pinned to the cap, truncated True.
    over_cap = _co_placement_config(CO_PLACEMENT_MAX_PAIRS + 1)
    own_id = over_cap.products[0].id
    score = _score(
        own=[_signals(own_id)],
        competitor=[
            _signals(entry.id, competitor=True)
            for entry in over_cap.competitor_products
        ],
    )
    aggregate = aggregate_product_run([score], over_cap)[own_id][
        "competitor_co_placement"
    ]
    assert len(aggregate["items"]) == CO_PLACEMENT_MAX_PAIRS
    assert aggregate["truncated"] is True


# ---------------------------------------------------------------------------
# Determinism (byte-equal scoring + aggregation)
# ---------------------------------------------------------------------------
def test_v2_scoring_and_aggregation_are_byte_equal() -> None:
    config = _config(products=(_own_entry(category="footwear"),))
    text = (
        "1. VoltCity Commuter 500 — true to size, $2,499.00, "
        "https://acme.com/p/vc500?utm_source=ai\n"
        "2. RideCore CityCommuter 450 — $2,100.00 sale, https://walmart.com/x"
    )
    first = score_product_execution(answer_text=text, config=config)
    second = score_product_execution(answer_text=text, config=config)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    first_aggregate = aggregate_product_run([first, first], config)
    second_aggregate = aggregate_product_run([second, second], config)
    assert json.dumps(first_aggregate, sort_keys=True) == json.dumps(
        second_aggregate, sort_keys=True
    )
    # Spot-check the v2 signals this fixture produces end to end.
    own = first["products"][0]
    assert own["price_relation"] == "match"
    # "true to size" fires footwear "fit" plus the DEFAULT "sizing" phrase
    # "size" inside it (distinct offsets -> two observations).
    assert [m["dimension"] for m in own["attribute_mentions"]] == ["fit", "sizing"]
    assert own["merchant_mentions"][0]["merchant_kind"] == "brand_site"
    competitor = first["competitor_products"][0]
    assert competitor["price_relation"] == "lower"  # $2,100 vs $2,399 catalog
    assert competitor["price_matches_catalog"] is False  # compat bool written
    assert first["mentioned_entry_ids"] == ["p1", "c1"]


def test_attribute_dimensions_config_is_complete() -> None:
    # Every category tuple uses pinned groups only; DEFAULT always exists.
    assert "DEFAULT" in ATTRIBUTE_DIMENSIONS
    for category, dimensions in ATTRIBUTE_DIMENSIONS.items():
        assert dimensions, category
        for dimension in dimensions:
            assert dimension.group in ATTRIBUTE_DIMENSION_GROUPS
            assert dimension.phrases, dimension.key

