from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.core.config.billing_contracts import (
    CURRENCY_MINOR_UNITS,
    INDIA_COUNTRY_CODE,
    PLAN_KEYS,
    PREVIEW_REGION,
    REGION_INDIA,
    REGION_INTERNATIONAL,
    TAX_BEHAVIORS,
)
from app.core.config.entitlements import CAPABILITY_REGISTRY
from app.core.config.provider_catalog import (
    ProviderCatalogEntry,
    validate_availability,
)


@dataclass(frozen=True, slots=True)
class CatalogPrice:
    """One configured price for one region.

    ``provider_price_ref`` is PRIVATE (invariant 6): it is the operator-owned
    external price/plan reference and must never appear in a response DTO. An
    ABSENT ref makes the owning item unavailable — a missing ref is never
    guessed and never replaced by a client-supplied value.
    """

    currency: str
    amount_minor: int
    tax_behavior: str
    provider_price_ref: str
    frozen_tax_minor: int | None = None
    provider_mode: str = ""
    synthetic: bool = False
    tax_verified: bool = False
    # A one-time charge is created per purchase from the server quote, so it
    # names no pre-provisioned provider plan.
    one_time: bool = False

    def __post_init__(self) -> None:
        if self.currency not in CURRENCY_MINOR_UNITS:
            raise ValueError(f"unsupported catalog currency: {self.currency!r}")
        if self.amount_minor < 0:
            raise ValueError("catalog price amount_minor must be >= 0")
        if self.tax_behavior not in TAX_BEHAVIORS:
            raise ValueError(f"unsupported tax behavior: {self.tax_behavior!r}")

    @property
    def purchasable(self) -> bool:
        """A positive amount plus, for recurring prices, a private plan ref."""
        if self.amount_minor <= 0:
            return False
        return self.one_time or bool(self.provider_price_ref.strip())


@dataclass(frozen=True, slots=True)
class GrantTemplate:
    """One capability key/value a catalog item's grant bundle issues.

    ``key`` must be an ISSUABLE entitlement-registry capability: the registry
    owns the vocabulary (invariant 2) and Copilot can never be templated.
    """

    key: str
    value: int

    def __post_init__(self) -> None:
        definition = CAPABILITY_REGISTRY.require(self.key)
        if not definition.issuable:
            raise ValueError(f"capability {self.key!r} is non-issuable")
        if self.value < 0:
            raise ValueError(f"grant template {self.key!r} must be >= 0")


@dataclass(frozen=True, slots=True)
class QuantityBounds:
    """Inclusive purchase quantity bounds for an add-on or top-up."""

    minimum: int
    maximum: int

    def __post_init__(self) -> None:
        if self.minimum < 1 or self.maximum < self.minimum:
            raise ValueError("quantity bounds must satisfy 1 <= minimum <= maximum")


@dataclass(frozen=True, slots=True)
class PlanCatalogEntry:
    """One base plan.

    ``base_prices`` and ``credit_prices_by_cadence`` are keyed by region (and
    cadence for credits). ``base_price`` and ``credit_price`` stay SEPARATE: the
    funded total is ``base + credit``. Provider cost is never exposed and base
    is never derived from credit. Enterprise carries no price, no provider ref,
    and no grants.
    """

    key: str
    name: str
    description: str
    cadence: str
    base_prices: Mapping[str, CatalogPrice]
    credit_prices_by_cadence: Mapping[str, Mapping[str, CatalogPrice]]
    grant_bundle: tuple[GrantTemplate, ...]
    trial_availability: str
    trial_unavailable_reason: str | None
    self_serve: bool
    contact_only: bool

    def __post_init__(self) -> None:
        if self.key not in PLAN_KEYS:
            raise ValueError(f"unknown plan key: {self.key!r}")
        if self.contact_only and (
            self.self_serve
            or self.base_prices
            or self.credit_prices_by_cadence
            or self.grant_bundle
        ):
            raise ValueError(
                f"contact-only plan {self.key!r} must carry no prices or grants"
            )
        validate_availability(self.trial_availability, self.trial_unavailable_reason)

    def base_price(self, region: str) -> CatalogPrice | None:
        return self.base_prices.get(region)

    def credit_price(self, region: str) -> CatalogPrice | None:
        """Funded credit price for this plan's cadence in a region (or None)."""
        return self.credit_prices_by_cadence.get(self.cadence, {}).get(region)


@dataclass(frozen=True, slots=True)
class AddonCatalogEntry:
    """One one-time add-on, priced per unit and granting per unit.

    Its grants expire ``expiry_days`` after purchase or at the end of the paid
    subscription, whichever is earlier (the resolver applies the moving end).
    """

    key: str
    name: str
    description: str
    quantity_bounds: QuantityBounds
    prices: Mapping[str, CatalogPrice]
    grant_bundle_per_unit: tuple[GrantTemplate, ...]
    availability: str
    unavailable_reason: str | None
    eligible_plan_keys: tuple[str, ...]
    expiry_days: int

    def __post_init__(self) -> None:
        validate_availability(self.availability, self.unavailable_reason)
        if self.expiry_days <= 0:
            raise ValueError("add-on expiry_days must be positive")

    def price(self, region: str) -> CatalogPrice | None:
        return self.prices.get(region)


@dataclass(frozen=True, slots=True)
class TopupCatalogEntry:
    """One one-time credit pack. ``expiry_days`` is the fixed grant validity."""

    key: str
    name: str
    description: str
    quantity_bounds: QuantityBounds
    prices: Mapping[str, CatalogPrice]
    grant_bundle_per_unit: tuple[GrantTemplate, ...]
    availability: str
    unavailable_reason: str | None
    expiry_days: int
    eligible_plan_keys: tuple[str, ...]

    def __post_init__(self) -> None:
        validate_availability(self.availability, self.unavailable_reason)
        if self.expiry_days <= 0:
            raise ValueError("top-up expiry_days must be positive")

    def price(self, region: str) -> CatalogPrice | None:
        return self.prices.get(region)


@dataclass(frozen=True, slots=True)
class CommercialCatalog:
    """The whole resolved commercial catalog for one persisted revision.

    Built only from a validated ``BillingCatalogRevision`` payload
    (``domain/billing/catalog_revisions``); there is no settings-derived
    catalog.
    """

    revision: str
    plans: tuple[PlanCatalogEntry, ...]
    addons: tuple[AddonCatalogEntry, ...]
    topups: tuple[TopupCatalogEntry, ...]
    providers: tuple[ProviderCatalogEntry, ...]

    def plan(self, key: str) -> PlanCatalogEntry | None:
        for entry in self.plans:
            if entry.key == key:
                return entry
        return None

    def addon(self, key: str) -> AddonCatalogEntry | None:
        for entry in self.addons:
            if entry.key == key:
                return entry
        return None

    def topup(self, key: str) -> TopupCatalogEntry | None:
        for entry in self.topups:
            if entry.key == key:
                return entry
        return None


def resolve_region(country_code: str | None) -> str:
    """Resolve a region from a normalized ISO country, server-side only.

    ``None`` is the PUBLIC preview: it resolves to the config-owned preview
    region and never authorizes a purchase (checkout requires a country).
    """
    country = (country_code or "").strip().upper()
    if not country:
        return PREVIEW_REGION
    return REGION_INDIA if country == INDIA_COUNTRY_CODE else REGION_INTERNATIONAL


def scale_grant_specs(
    specs: tuple[tuple[str, int], ...], quantity: int
) -> tuple[tuple[str, int], ...]:
    """Scale per-unit grant templates by a purchased quantity.

    Config owns the scaling rule (invariant 1) so no activation path
    multiplies a pack size inline.
    """
    if quantity < 1:
        raise ValueError("grant scaling quantity must be >= 1")
    return tuple((key, value * quantity) for key, value in specs)
