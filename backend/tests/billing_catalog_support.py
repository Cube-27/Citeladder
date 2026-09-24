"""Build the launch catalog for tests from the same author the seed uses.

Tests exercise the real ``launch-pricing-v1`` payload rather than a hand-written
copy, supplying only what an operator adds after authoring: private provider
plan references and, where a test needs it, an item's sell switch.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from app.core.config.billing_catalog import CommercialCatalog
from app.domain.billing.catalog_revisions import (
    commercial_catalog_from_row,
    validate_payload,
)
from app.domain.billing.launch_catalog import (
    LAUNCH_REVISION,
    ProviderMode,
    launch_pricing_v1_payload,
)
from app.models.billing import BillingCatalogRevision

TEST_CATALOG_REVISION = LAUNCH_REVISION


def launch_payload(
    *,
    provider_mode: ProviderMode | None = "test",
    refs: Mapping[str, str] | None = None,
    available_items: Iterable[str] = (),
) -> dict[str, Any]:
    """The authored launch payload with operator refs applied.

    ``refs`` is keyed ``"{plan_key}:{region}"``. ``available_items`` switches
    on items the launch catalog publishes but does not sell yet.
    """
    payload: dict[str, Any] = launch_pricing_v1_payload(provider_mode=provider_mode)
    refs = refs or {}
    for plan in payload["plans"]:
        for region, price in plan.get("regional_byok_prices", {}).items():
            ref = refs.get(f"{plan['key']}:{region}")
            if ref:
                price["provider_price_ref"] = ref
    enabled = set(available_items)
    for item in (*payload["addons"], *payload["topups"]):
        if item["key"] in enabled:
            item["available"] = True
    validate_payload(payload)
    return payload


def launch_catalog(
    *,
    provider_mode: ProviderMode | None = "test",
    refs: Mapping[str, str] | None = None,
    available_items: Iterable[str] = (),
    revision: str = TEST_CATALOG_REVISION,
) -> CommercialCatalog:
    """The runtime catalog the published launch revision resolves to."""
    payload = launch_payload(
        provider_mode=provider_mode, refs=refs, available_items=available_items
    )
    return commercial_catalog_from_row(
        BillingCatalogRevision(revision=revision, payload=payload)
    )


__all__ = [
    "TEST_CATALOG_REVISION",
    "launch_catalog",
    "launch_payload",
]
