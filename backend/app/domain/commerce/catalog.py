"""Shopify catalog merge (§9.2): feed row -> ``Product`` keyed (project, sku).

Table-driven merge over one connector-normalized catalog row (one row per
product variant with a non-empty SKU = one ``Product``):

- **no existing row** → create a ``synced`` product with provenance;
- **existing manual/imported row** (no connection) → ADOPT: origin flips
  to ``synced``, provenance is set, platform fields overwrite, aliases and
  absent-from-feed attribute keys survive;
- **existing synced row on the SAME connection** → same platform-field
  update + preservation behavior;
- **existing synced row on a DIFFERENT connection** → NO Product mutation;
  emit ``feed.duplicate_sku_across_connections`` with both connection ids
  and the SKU in evidence;
- **absent from the feed** → no delete, no update (staleness stays
  inferable from ``Product.last_seen_sync_run_id``; no M3 stale rule).

Aliases are NEVER in the platform-owned set — a sync never creates,
replaces, or deletes an alias.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.commerce import (
    FEED_RULE_DUPLICATE_SKU_ACROSS_CONNECTIONS,
    FEED_RULE_SEVERITIES,
    SHOPIFY_AVAILABILITY_IN_STOCK,
    SHOPIFY_AVAILABILITY_OUT_OF_STOCK,
    SHOPIFY_DEFAULT_VARIANT_TITLE,
)
from app.core.config.products import PRODUCT_ORIGIN_SYNCED
from app.domain.commerce.feed import FeedFinding
from app.models.integrations import (
    IntegrationConnection,
    IntegrationImportArtifact,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)
from app.models.product import Product

# Merge outcomes (domain-internal result tokens — never persisted).
MERGE_OUTCOME_CREATED = "created"
MERGE_OUTCOME_ADOPTED = "adopted"
MERGE_OUTCOME_UPDATED = "updated"
MERGE_OUTCOME_DUPLICATE = "duplicate"
MERGE_OUTCOME_MISSING_SKU = "missing_sku"


@dataclass(frozen=True)
class CatalogMergeResult:
    """The outcome of merging ONE feed row."""

    outcome: str
    product: Product | None
    finding: FeedFinding | None


def _str(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _parse_price(value: object) -> Decimal | None:
    text = _str(value)
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _variant_title(row: Mapping[str, object]) -> str:
    """The variant title with Shopify's placeholder normalized away."""
    title = _str(row.get("variant_title"))
    return "" if title == SHOPIFY_DEFAULT_VARIANT_TITLE else title


def _display_name(row: Mapping[str, object]) -> str:
    title = _str(row.get("title"))
    variant = _variant_title(row)
    return f"{title} / {variant}" if title and variant else title or variant


def _platform_attributes(row: Mapping[str, object]) -> dict[str, str]:
    """Present-only platform attribute values (``SHOPIFY_PLATFORM_ATTRIBUTE_KEYS``).

    ``gtin`` comes from the variant barcode; ``availability`` projects the
    inventory quantity (absent when the quantity is null — the
    missing-availability rule fires there).
    """
    attributes: dict[str, str] = {}
    barcode = _str(row.get("barcode"))
    if barcode:
        attributes["gtin"] = barcode
    for key, field in (
        ("description", "description"),
        ("vendor", "vendor"),
        ("product_type", "product_type"),
        ("status", "status"),
    ):
        value = _str(row.get(field))
        if value:
            attributes[key] = value
    inventory = row.get("inventory_quantity")
    if isinstance(inventory, int) and not isinstance(inventory, bool):
        attributes["availability"] = (
            SHOPIFY_AVAILABILITY_IN_STOCK
            if inventory > 0
            else SHOPIFY_AVAILABILITY_OUT_OF_STOCK
        )
    return attributes


def _apply_platform_fields(
    product: Product, row: Mapping[str, object], *, name_fallback: str
) -> None:
    """Overwrite the platform-owned fields; preserve aliases + absent attrs.

    Name/price/currency/url/variants take the feed's values (the feed owns
    them); ``attributes`` merges present platform keys over the existing
    bag so keys ABSENT from the feed survive (aliases untouched — they are
    a separate column and never platform-owned).
    """
    name = _display_name(row) or name_fallback
    if name:
        product.name = name[:255]
    product.price = cast(float | None, _parse_price(row.get("price")))
    product.currency = _str(row.get("currency"))[:3]
    product.url = _str(row.get("url"))
    variant_title = _variant_title(row)
    variant_price = _parse_price(row.get("price"))
    product.variants = [
        {
            "name": variant_title or _str(row.get("title")),
            "sku": _str(row.get("sku")),
            "price": float(variant_price) if variant_price is not None else None,
        }
    ]
    merged = dict(product.attributes or {})
    merged.update(_platform_attributes(row))
    product.attributes = merged


async def merge_catalog_row(
    session: AsyncSession,
    *,
    mapping: IntegrationPropertyMapping,
    connection: IntegrationConnection,
    run: IntegrationSyncRun,
    artifact: IntegrationImportArtifact,
    row: Mapping[str, object],
) -> CatalogMergeResult:
    """Merge ONE connector-normalized catalog row into the project catalog.

    Identity is ``(project_id, sku)`` (``uq_product_project_sku``) — the
    opaque variant id is provenance (``external_item_ref``), never the
    catalog key, so a re-listed variant keeps its row.
    """
    sku = _str(row.get("sku"))
    if not sku:
        # Missing-SKU variants never create an unstable catalog identity
        # (the feed validation emits the ``feed.missing_sku`` issue).
        return CatalogMergeResult(
            outcome=MERGE_OUTCOME_MISSING_SKU, product=None, finding=None
        )
    existing = await session.scalar(
        select(Product).where(
            Product.project_id == mapping.project_id,
            Product.sku == sku,
        )
    )
    if (
        existing is not None
        and existing.connection_id is not None
        and existing.connection_id != connection.id
    ):
        # A different connection already owns this SKU: the feed never
        # steals the row — the deterministic duplicate issue carries both
        # connection ids + the SKU.
        finding = FeedFinding(
            rule_id=FEED_RULE_DUPLICATE_SKU_ACROSS_CONNECTIONS,
            severity=FEED_RULE_SEVERITIES[FEED_RULE_DUPLICATE_SKU_ACROSS_CONNECTIONS],
            evidence={
                "sku": sku,
                "feed_connection_id": str(connection.id),
                "owner_connection_id": str(existing.connection_id),
                "variant_ref": _str(row.get("variant_ref")),
            },
        )
        return CatalogMergeResult(
            outcome=MERGE_OUTCOME_DUPLICATE, product=None, finding=finding
        )
    external_item_ref = _str(row.get("variant_ref"))
    if existing is None:
        product = Product(
            project_id=mapping.project_id,
            sku=sku,
            name="",
            origin=PRODUCT_ORIGIN_SYNCED,
            connection_id=connection.id,
            external_item_ref=external_item_ref,
            last_seen_sync_run_id=run.id,
        )
        _apply_platform_fields(product, row, name_fallback=sku)
        session.add(product)
        await session.flush()
        return CatalogMergeResult(
            outcome=MERGE_OUTCOME_CREATED, product=product, finding=None
        )
    outcome = (
        MERGE_OUTCOME_ADOPTED
        if existing.connection_id is None
        else MERGE_OUTCOME_UPDATED
    )
    existing.origin = PRODUCT_ORIGIN_SYNCED
    existing.connection_id = connection.id
    existing.external_item_ref = external_item_ref
    existing.last_seen_sync_run_id = run.id
    _apply_platform_fields(existing, row, name_fallback=existing.name or sku)
    await session.flush()
    return CatalogMergeResult(outcome=outcome, product=existing, finding=None)
