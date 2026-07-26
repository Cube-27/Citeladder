"""Deterministic catalog-feed validators (§9.3 in-scope rules only).

Pure unit tests over one connector-normalized catalog row + its PRE-merge
catalog state. Covers every in-scope rule, the source-absent no-issue
contract, and the price-divergence tolerance edges (absolute floor vs
relative tolerance).
"""

from __future__ import annotations

from decimal import Decimal

from app.core.config.commerce import (
    FEED_RULE_CATALOG_PRICE_DIVERGENCE,
    FEED_RULE_MISSING_AVAILABILITY,
    FEED_RULE_MISSING_GTIN_MPN,
    FEED_RULE_MISSING_SKU,
    FEED_RULE_SEVERITIES,
    FEED_SEVERITY_ERROR,
    FEED_SEVERITY_WARNING,
)
from app.domain.commerce.feed import validate_feed_row
from app.models.product import Product


def _clean_row() -> dict:
    return {
        "product_ref": "gid://shopify/Product/3",
        "variant_ref": "gid://shopify/ProductVariant/9",
        "sku": "VC-500",
        "barcode": "012345678905",
        "title": "VoltCity 500",
        "variant_title": "Default Title",
        "price": "64.99",
        "currency": "USD",
        "inventory_quantity": 12,
    }


def _rule_ids(findings: tuple) -> list[str]:
    return [finding.rule_id for finding in findings]


def test_clean_row_emits_no_findings() -> None:
    assert validate_feed_row(row=_clean_row(), product=None) == ()


def test_missing_sku_is_an_error_finding() -> None:
    row = _clean_row()
    row["sku"] = "   "
    (finding,) = validate_feed_row(row=row, product=None)
    assert finding.rule_id == FEED_RULE_MISSING_SKU
    assert finding.severity == FEED_SEVERITY_ERROR
    assert finding.evidence == {
        "title": "VoltCity 500",
        "variant_ref": "gid://shopify/ProductVariant/9",
    }


def test_missing_barcode_is_a_warning() -> None:
    row = _clean_row()
    row["barcode"] = ""
    findings = validate_feed_row(row=row, product=None)
    assert _rule_ids(findings) == [FEED_RULE_MISSING_GTIN_MPN]
    assert findings[0].severity == FEED_SEVERITY_WARNING
    assert findings[0].evidence == {"sku": "VC-500"}


def test_missing_availability_only_when_quantity_absent() -> None:
    row = _clean_row()
    row["inventory_quantity"] = None
    findings = validate_feed_row(row=row, product=None)
    assert _rule_ids(findings) == [FEED_RULE_MISSING_AVAILABILITY]
    assert findings[0].severity == FEED_SEVERITY_WARNING
    # Zero stock is a real availability signal — NOT a missing value.
    row["inventory_quantity"] = 0
    assert validate_feed_row(row=row, product=None) == ()


def test_multiple_findings_accumulate() -> None:
    row = _clean_row()
    row["sku"] = ""
    row["barcode"] = None
    row["inventory_quantity"] = None
    assert _rule_ids(validate_feed_row(row=row, product=None)) == [
        FEED_RULE_MISSING_SKU,
        FEED_RULE_MISSING_GTIN_MPN,
        FEED_RULE_MISSING_AVAILABILITY,
    ]


def test_price_divergence_beyond_tolerance_is_a_warning() -> None:
    product = Product(price=Decimal("64.99"))
    row = _clean_row()
    row["price"] = "70.00"
    (finding,) = validate_feed_row(row=row, product=product)
    assert finding.rule_id == FEED_RULE_CATALOG_PRICE_DIVERGENCE
    assert finding.severity == FEED_SEVERITY_WARNING
    assert finding.evidence == {
        "sku": "VC-500",
        "feed_price": "70.00",
        "catalog_price": "64.99",
        "currency": "USD",
    }


def test_price_divergence_within_absolute_floor_is_silent() -> None:
    product = Product(price=Decimal("64.99"))
    row = _clean_row()
    # divergence 0.01 <= max(0.01, 64.99 * 0.001)
    row["price"] = "65.00"
    assert validate_feed_row(row=row, product=product) == ()


def test_price_divergence_uses_relative_tolerance_for_large_prices() -> None:
    product = Product(price=Decimal("1000.00"))
    row = _clean_row()
    # divergence 0.50 <= max(0.01, 1000 * 0.001 = 1.00) — silent.
    row["price"] = "1000.50"
    assert validate_feed_row(row=row, product=product) == ()
    # divergence 1.50 > 1.00 — finding.
    row["price"] = "1001.50"
    assert _rule_ids(validate_feed_row(row=row, product=product)) == [
        FEED_RULE_CATALOG_PRICE_DIVERGENCE
    ]


def test_new_product_never_diverges() -> None:
    row = _clean_row()
    row["price"] = "999999.99"
    assert validate_feed_row(row=row, product=None) == ()


def test_malformed_or_absent_feed_price_degrades_without_divergence() -> None:
    product = Product(price=Decimal("64.99"))
    for bad_price in ("not-a-price", "", None, {"hostile": "mapping"}):
        row = _clean_row()
        row["price"] = bad_price
        assert validate_feed_row(row=row, product=product) == ()


def test_rule_severities_cover_every_emitted_rule() -> None:
    # Every finding's severity comes from the config-owned mapping.
    row = _clean_row()
    row["sku"] = ""
    row["barcode"] = ""
    row["inventory_quantity"] = None
    row["price"] = "1.00"
    findings = validate_feed_row(
        row=row, product=Product(price=Decimal("64.99"))
    )
    assert findings
    for finding in findings:
        assert finding.severity == FEED_RULE_SEVERITIES[finding.rule_id]
