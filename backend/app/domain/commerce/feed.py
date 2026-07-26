"""Deterministic catalog-feed validation (§9.3 in-scope rules only).

Pure functions over one connector-normalized catalog row + its PRE-merge
catalog state. Only the in-scope deterministic rules exist here — M3's
``feed.stale_catalog_data`` / ``feed.ai_channel_ineligible`` /
``feed.entity_inconsistency`` and the §9.3 platform AI-eligibility verdict
are deliberate exclusions (config/commerce.py records why). A product
ABSENT from the feed emits no issue (source-absent = no issue; staleness
stays inferable from ``Product.last_seen_sync_run_id``).

Every finding carries sanitized evidence only — never customer data.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from app.core.config.commerce import (
    FEED_PRICE_DIVERGENCE_ABS_TOLERANCE,
    FEED_PRICE_DIVERGENCE_REL_TOLERANCE,
    FEED_RULE_CATALOG_PRICE_DIVERGENCE,
    FEED_RULE_MISSING_AVAILABILITY,
    FEED_RULE_MISSING_GTIN_MPN,
    FEED_RULE_MISSING_SKU,
    FEED_RULE_SEVERITIES,
)
from app.models.product import Product

_ABS_TOLERANCE = Decimal(FEED_PRICE_DIVERGENCE_ABS_TOLERANCE)
_REL_TOLERANCE = Decimal(FEED_PRICE_DIVERGENCE_REL_TOLERANCE)


@dataclass(frozen=True)
class FeedFinding:
    """One deterministic feed finding (pre-persistence form).

    The caller (derivation) adds the run/artifact/connection provenance
    and the resolved product id when persisting the ``FeedIssue`` row.
    """

    rule_id: str
    severity: str
    evidence: dict


def _str(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _parse_price(value: object) -> Decimal | None:
    """Parse a provider decimal-string price; malformed degrades to None."""
    text = _str(value)
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def validate_feed_row(
    *, row: Mapping[str, object], product: Product | None
) -> tuple[FeedFinding, ...]:
    """Evaluate the in-scope deterministic rules for ONE feed row.

    ``product`` is the row's PRE-merge catalog state (``None`` when the
    SKU is new to the catalog): the price-divergence rule compares the
    feed price against the persisted price BEFORE the merge overwrites
    it, and a new product never diverges (nothing to compare).
    """
    sku = _str(row.get("sku"))
    findings: list[FeedFinding] = []
    if not sku:
        findings.append(
            FeedFinding(
                rule_id=FEED_RULE_MISSING_SKU,
                severity=FEED_RULE_SEVERITIES[FEED_RULE_MISSING_SKU],
                evidence={
                    "title": _str(row.get("title")),
                    "variant_ref": _str(row.get("variant_ref")),
                },
            )
        )
    if not _str(row.get("barcode")):
        findings.append(
            FeedFinding(
                rule_id=FEED_RULE_MISSING_GTIN_MPN,
                severity=FEED_RULE_SEVERITIES[FEED_RULE_MISSING_GTIN_MPN],
                evidence={"sku": sku},
            )
        )
    if row.get("inventory_quantity") is None:
        findings.append(
            FeedFinding(
                rule_id=FEED_RULE_MISSING_AVAILABILITY,
                severity=FEED_RULE_SEVERITIES[FEED_RULE_MISSING_AVAILABILITY],
                evidence={"sku": sku},
            )
        )
    feed_price = _parse_price(row.get("price"))
    if product is not None and product.price is not None and feed_price is not None:
        catalog_price = Decimal(str(product.price))
        divergence = abs(feed_price - catalog_price)
        tolerance = max(_ABS_TOLERANCE, abs(catalog_price) * _REL_TOLERANCE)
        if divergence > tolerance:
            findings.append(
                FeedFinding(
                    rule_id=FEED_RULE_CATALOG_PRICE_DIVERGENCE,
                    severity=FEED_RULE_SEVERITIES[FEED_RULE_CATALOG_PRICE_DIVERGENCE],
                    evidence={
                        "sku": sku,
                        "feed_price": str(feed_price),
                        "catalog_price": str(catalog_price),
                        "currency": _str(row.get("currency")),
                    },
                )
            )
    return tuple(findings)
