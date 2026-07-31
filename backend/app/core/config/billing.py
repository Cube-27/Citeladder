"""Billing catalog, lifecycle vocabulary, and provider settings.

This is the only owner of commercial amounts, tax/routing rules, provider
credentials, and billing guardrails (invariant 1). Domain and connector code
consume the resolved values; they never embed price or provider configuration.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Final

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.entitlements import (
    CAPABILITY_REGISTRY,
    KEY_BENCHMARK_CADENCE,
    KEY_BENCHMARK_CREDITS,
    KEY_EXPORTS,
    KEY_FANOUT,
    KEY_HISTORY_WINDOW,
    KEY_MANUAL_RUNS_PER_DAY,
    KEY_MONITORED_URLS,
    KEY_PROJECT_SLOTS,
    KEY_PROMPT_SLOTS,
    KEY_PROVIDER_COPILOT,
    KEY_PROVIDER_GROK,
    KEY_PROVIDER_PERPLEXITY,
    KEY_PULSE_CADENCE,
)
from app.core.config.provider_catalog import (
    AVAILABILITY_AVAILABLE,
    AVAILABILITY_UNAVAILABLE,
    PUBLIC_PROVIDER_CATALOG,
    ProviderCatalogEntry,
    validate_availability,
)

CADENCE_MONTHLY: Final = "monthly"
CADENCES: Final = frozenset({CADENCE_MONTHLY})

# BillingSubscription.subscription_kind.
SUBSCRIPTION_KIND_BASE: Final = "base"
SUBSCRIPTION_KIND_ADDON: Final = "addon"
SUBSCRIPTION_KINDS: Final = frozenset({SUBSCRIPTION_KIND_BASE, SUBSCRIPTION_KIND_ADDON})

PROVIDER_RAZORPAY: Final = "razorpay"

SUBSCRIPTION_PENDING: Final = "pending"
SUBSCRIPTION_TRIALING: Final = "trialing"
SUBSCRIPTION_ACTIVE: Final = "active"
SUBSCRIPTION_PAST_DUE: Final = "past_due"
SUBSCRIPTION_CANCEL_SCHEDULED: Final = "cancel_scheduled"
SUBSCRIPTION_CANCELLED: Final = "cancelled"
SUBSCRIPTION_UNPAID: Final = "unpaid"
SUBSCRIPTION_EXPIRED: Final = "expired"

LIVE_SUBSCRIPTION_STATUSES: Final = frozenset(
    {
        SUBSCRIPTION_PENDING,
        SUBSCRIPTION_TRIALING,
        SUBSCRIPTION_ACTIVE,
        SUBSCRIPTION_PAST_DUE,
        SUBSCRIPTION_CANCEL_SCHEDULED,
    }
)

RAZORPAY_EVENT_TYPES: Final = frozenset(
    {
        "subscription.authenticated",
        "subscription.activated",
        "subscription.charged",
        "subscription.pending",
        "subscription.halted",
        "subscription.cancelled",
        "subscription.completed",
        "subscription.expired",
        "subscription.paused",
        "subscription.resumed",
    }
)

RAZORPAY_PAYMENT_EVENT_TYPES: Final = frozenset({"payment.captured", "payment.failed"})

# Authoritative one-time payment vocabulary (provider-neutral).
PAYMENT_PENDING: Final = "payment_pending"
PAYMENT_PAID: Final = "paid"
PAYMENT_FAILED: Final = "payment_failed"

# Razorpay payment / payment-link statuses mapped to the neutral vocabulary.
RAZORPAY_PAYMENT_STATUS_MAP: Final[dict[str, str]] = {
    "created": PAYMENT_PENDING,
    "authorized": PAYMENT_PENDING,
    "partially_paid": PAYMENT_PENDING,
    "captured": PAYMENT_PAID,
    "paid": PAYMENT_PAID,
    "failed": PAYMENT_FAILED,
    "cancelled": PAYMENT_FAILED,
    "expired": PAYMENT_FAILED,
    "refunded": PAYMENT_FAILED,
}

RAZORPAY_STATUS_MAP: Final[dict[str, str]] = {
    "created": SUBSCRIPTION_PENDING,
    "authenticated": SUBSCRIPTION_PENDING,
    "active": SUBSCRIPTION_ACTIVE,
    "pending": SUBSCRIPTION_PAST_DUE,
    "halted": SUBSCRIPTION_UNPAID,
    "cancelled": SUBSCRIPTION_CANCELLED,
    "completed": SUBSCRIPTION_EXPIRED,
    "expired": SUBSCRIPTION_EXPIRED,
    "paused": SUBSCRIPTION_PAST_DUE,
}


# ---------------------------------------------------------------------------
# Commercial catalog (config-owned, invariant 1)
# ---------------------------------------------------------------------------
# This module is the ONLY owner of commercial amounts, catalog keys, quantity
# bounds, top-up expiry, and the PRIVATE provider price references. Domain, API,
# and connector code READS the structures below; it never embeds a price, a
# key, a limit, or an expiry inline.
#
# ``app.core.config.costs`` remains the sole owner of expected EXECUTION costs.
# Nothing here duplicates a token rate, a search fee, or a route cost — only
# ``funded_monthly_budget_minor`` (the funded-admission budget) lives here.

# Regions a quote resolves to. Region resolution and GST stay SERVER-SIDE: the
# browser never supplies a currency, a region, a rate, or an amount.
REGION_INDIA: Final = "india"
REGION_INTERNATIONAL: Final = "international"
REGIONS: Final[tuple[str, ...]] = (REGION_INDIA, REGION_INTERNATIONAL)

# The single ISO alpha-2 country that resolves to the India region.
INDIA_COUNTRY_CODE: Final = "IN"
# Region used for the PUBLIC catalog preview when no country is supplied.
# Preview only — checkout still requires a submitted country.
PREVIEW_REGION: Final = REGION_INTERNATIONAL

CURRENCY_USD: Final = "USD"
CURRENCY_INR: Final = "INR"
REGION_CURRENCIES: Final[dict[str, str]] = {
    REGION_INDIA: CURRENCY_INR,
    REGION_INTERNATIONAL: CURRENCY_USD,
}
# Both supported currencies are 2-decimal, so amounts are minor units (cents /
# paise). Exposed publicly so a client never guesses the exponent.
CURRENCY_MINOR_UNITS: Final[dict[str, int]] = {CURRENCY_USD: 2, CURRENCY_INR: 2}

# Tax behaviour of a configured price: ``exclusive`` means the region adds tax
# (India GST) on top; ``inclusive`` means the amount is already final.
TAX_BEHAVIOR_EXCLUSIVE: Final = "exclusive"
TAX_BEHAVIOR_INCLUSIVE: Final = "inclusive"
TAX_BEHAVIORS: Final[frozenset[str]] = frozenset(
    {TAX_BEHAVIOR_EXCLUSIVE, TAX_BEHAVIOR_INCLUSIVE}
)

CADENCE_CUSTOM: Final = "custom"

# Purpose component of a private provider-price-ref key. ``base`` is the
# recurring base/one-time charge; ``credit`` is the SEPARATE funded credit
# charge (total funded price = base + credit; base is never derived from it).
PRICE_PURPOSE_BASE: Final = "base"
PRICE_PURPOSE_CREDIT: Final = "credit"

# Safe, non-leaking unavailability reasons (never a provider id or message).
REASON_CHECKOUT_UNAVAILABLE: Final = "checkout_unavailable"
REASON_CONTACT_ONLY: Final = "contact_only"
REASON_TRIAL_UNAVAILABLE: Final = "trial_unavailable"

# Final plan keys, in catalog display order. No Free/Paid/bundle vocabulary.
PLAN_TIER_1: Final = "tier_1"
PLAN_TIER_2: Final = "tier_2"
PLAN_TIER_3: Final = "tier_3"
PLAN_ENTERPRISE: Final = "enterprise"
PLAN_KEYS: Final[tuple[str, ...]] = (
    PLAN_TIER_1,
    PLAN_TIER_2,
    PLAN_TIER_3,
    PLAN_ENTERPRISE,
)
# Plans a self-serve purchase may name (enterprise is contact-only).
SELF_SERVE_PLAN_KEYS: Final[tuple[str, ...]] = (PLAN_TIER_1, PLAN_TIER_2, PLAN_TIER_3)

# Base USD monthly prices in minor units (cents).
TIER_1_BASE_USD_MINOR: Final = 9_900
TIER_2_BASE_USD_MINOR: Final = 19_900
TIER_3_BASE_USD_MINOR: Final = 29_900

# Add-on / top-up keys.
ADDON_EXTRA_PROJECT: Final = "addon_extra_project"
ADDON_EXTRA_PROMPTS: Final = "addon_extra_prompts"
TOPUP_BENCHMARK_CREDITS: Final = "topup_benchmark_credits"

# Per-unit grant values for the add-ons (occupancy counters).
ADDON_EXTRA_PROJECT_SLOTS_PER_UNIT: Final = 1
ADDON_EXTRA_PROMPTS_SLOTS_PER_UNIT: Final = 10
# Inclusive add-on/top-up purchase quantity bounds.
ADDON_QUANTITY_MIN: Final = 1
ADDON_QUANTITY_MAX: Final = 20
TOPUP_QUANTITY_MIN: Final = 1
TOPUP_QUANTITY_MAX: Final = 20

# Which consumable capability each top-up pack credits. Declared here so the
# public catalog can name the grant key even while the pack SIZE is unset (and
# the pack therefore carries no grant template and stays unavailable).
TOPUP_CREDIT_KEYS: Final[dict[str, str]] = {
    TOPUP_BENCHMARK_CREDITS: KEY_BENCHMARK_CREDITS
}

# Coming-soon provider capability keys shown as UNAVAILABLE comparison rows on
# the upper tiers. They are display rows only: no plan bundle grants them, so a
# tier upgrade never yields a runnable provider grant for an unshipped adapter.
COMING_SOON_PLAN_CAPABILITY_KEYS: Final[tuple[str, ...]] = (
    KEY_PROVIDER_GROK,
    KEY_PROVIDER_PERPLEXITY,
    KEY_PROVIDER_COPILOT,
)
# Plans that display the coming-soon provider comparison rows.
COMING_SOON_ROW_PLAN_KEYS: Final[tuple[str, ...]] = (PLAN_TIER_2, PLAN_TIER_3)

# --- Commercial write-path vocabulary (config-owned, invariant 1) ----------
# PendingActivation.activation_kind.
ACTIVATION_KIND_BASE: Final = "base"
ACTIVATION_KIND_ADDON: Final = "addon"
ACTIVATION_KIND_TOPUP: Final = "topup"
ACTIVATION_KINDS: Final[frozenset[str]] = frozenset(
    {ACTIVATION_KIND_BASE, ACTIVATION_KIND_ADDON, ACTIVATION_KIND_TOPUP}
)

# PendingActivation.status.
ACTIVATION_PENDING: Final = "pending"
ACTIVATION_ACTIVATED: Final = "activated"
ACTIVATION_FAILED: Final = "failed"
ACTIVATION_ABANDONED: Final = "abandoned"
ACTIVATION_STATUSES: Final[frozenset[str]] = frozenset(
    {
        ACTIVATION_PENDING,
        ACTIVATION_ACTIVATED,
        ACTIVATION_FAILED,
        ACTIVATION_ABANDONED,
    }
)

# IdempotencyRecord.state.
IDEMPOTENCY_STARTED: Final = "started"
IDEMPOTENCY_COMPLETED: Final = "completed"
IDEMPOTENCY_FAILED: Final = "failed"

# Credential modes a purchase may name.
CREDENTIAL_MODE_BYOK: Final = "byok"
CREDENTIAL_MODE_FUNDED: Final = "funded"
CREDENTIAL_MODES: Final[frozenset[str]] = frozenset(
    {CREDENTIAL_MODE_BYOK, CREDENTIAL_MODE_FUNDED}
)

# Idempotent commercial operations (the canonical fingerprint's first field).
OPERATION_SUBSCRIPTION_CREATE: Final = "subscription.create"
OPERATION_SUBSCRIPTION_CANCEL: Final = "subscription.cancel"
OPERATION_ADDON_ACTIVATE: Final = "addon.activate"
OPERATION_ADDON_CANCEL: Final = "addon.cancel"
OPERATION_TOPUP_PURCHASE: Final = "topup.purchase"

# Safe rejection/failure codes returned to a client (never provider text).
REASON_TRIAL_REQUESTED_UNAVAILABLE: Final = "trial_unavailable"
REASON_IDEMPOTENCY_KEY_REQUIRED: Final = "idempotency_key_required"
REASON_IDEMPOTENCY_KEY_REUSED: Final = "idempotency_key_reused"
REASON_CATALOG_KEY_UNKNOWN: Final = "catalog_key_unknown"
REASON_QUANTITY_OUT_OF_BOUNDS: Final = "quantity_out_of_bounds"
REASON_SUBSCRIPTION_EXISTS: Final = "subscription_already_active"
REASON_ADDON_EXISTS: Final = "addon_already_active"
REASON_NO_CURRENT_SUBSCRIPTION: Final = "no_current_subscription"
REASON_BASE_SUBSCRIPTION_REQUIRED: Final = "base_subscription_required"
REASON_PROVIDER_UNAVAILABLE: Final = "provider_unavailable"
REASON_PROVIDER_REJECTED: Final = "provider_rejected"
REASON_ACTIVATION_EXPIRED: Final = "activation_expired"

# Add-on keys whose adapter has not shipped: activation ALWAYS refuses with
# ``provider_unavailable`` before any provider I/O or grant issuance.
COMING_SOON_ADDON_KEYS: Final[frozenset[str]] = frozenset()

# Bounded idempotency-key shape a client header must satisfy.
IDEMPOTENCY_KEY_MIN_LENGTH: Final = 8
IDEMPOTENCY_KEY_MAX_LENGTH: Final = 255

# Structured telemetry event names (allowlisted safe fields only — opaque ids,
# never credentials, prompts, provider bodies, or amounts).
TELEMETRY_ENTITLEMENT_UNRESOLVED: Final = "billing.entitlement_unresolved"
TELEMETRY_FUNDED_BUDGET_EXHAUSTED: Final = "billing.funded_budget_exhausted"
TELEMETRY_CONSUMABLE_CREDITS_EXHAUSTED: Final = "billing.consumable_credits_exhausted"
TELEMETRY_DUPLICATE_GRANT_PREVENTED: Final = "billing.duplicate_grant_prevented"
BILLING_TELEMETRY_EVENTS: Final[tuple[str, ...]] = (
    TELEMETRY_ENTITLEMENT_UNRESOLVED,
    TELEMETRY_FUNDED_BUDGET_EXHAUSTED,
    TELEMETRY_CONSUMABLE_CREDITS_EXHAUSTED,
    TELEMETRY_DUPLICATE_GRANT_PREVENTED,
)

# Authority that settled a pending activation (provenance, invariant 4).
ACTIVATION_AUTHORITY_WEBHOOK: Final = "webhook"
ACTIVATION_AUTHORITY_RECONCILIATION: Final = "reconciliation"


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

    def __post_init__(self) -> None:
        if self.currency not in CURRENCY_MINOR_UNITS:
            raise ValueError(f"unsupported catalog currency: {self.currency!r}")
        if self.amount_minor < 0:
            raise ValueError("catalog price amount_minor must be >= 0")
        if self.tax_behavior not in TAX_BEHAVIORS:
            raise ValueError(f"unsupported tax behavior: {self.tax_behavior!r}")

    @property
    def purchasable(self) -> bool:
        """True only when a positive amount AND a private ref are configured."""
        return self.amount_minor > 0 and bool(self.provider_price_ref.strip())


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
    """One recurring add-on, priced per unit and granting per unit."""

    key: str
    name: str
    description: str
    cadence: str
    quantity_bounds: QuantityBounds
    prices: Mapping[str, CatalogPrice]
    grant_bundle_per_unit: tuple[GrantTemplate, ...]
    availability: str
    unavailable_reason: str | None

    def __post_init__(self) -> None:
        validate_availability(self.availability, self.unavailable_reason)

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

    def __post_init__(self) -> None:
        validate_availability(self.availability, self.unavailable_reason)
        if self.expiry_days <= 0:
            raise ValueError("top-up expiry_days must be positive")

    def price(self, region: str) -> CatalogPrice | None:
        return self.prices.get(region)


class BillingSettings(BaseSettings):
    """Environment-owned billing catalog and Razorpay integration settings."""

    _backend_dir = Path(__file__).resolve().parents[3]
    model_config = SettingsConfigDict(
        env_prefix="BILLING_",
        env_file=(str(_backend_dir.parent / ".env"), str(_backend_dir / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # The v8 commercial catalog revision. Stamped on every quote, activation,
    # and grant bundle; bump it whenever a price, key, or grant template
    # changes so old rows keep their frozen terms.
    catalog_version: str = "commercial-v8"
    checkout_enabled: bool = False
    razorpay_live_ready: bool = False
    razorpay_international_ready: bool = False

    # India price is frozen when an item is provisioned from this
    # operator-owned rate. Zero deliberately means "route unavailable", never a
    # guessed rate.
    usd_inr_rate: Decimal = Decimal("0")
    india_gst_rate: Decimal = Decimal("0.18")

    # --- Commercial catalog (open config) --------------------------------
    # PRIVATE provider price/plan references, keyed
    # ``"{catalog_key}:{region}:{purpose}"`` (invariant 6: never in a DTO). An
    # ABSENT ref makes the item unavailable rather than failing at purchase.
    provider_price_refs: dict[str, str] = {}

    # Where a contact-only plan sends the buyer (display metadata, no price).
    contact_sales_url: str = "/demo"

    # Funded admission budget (minor USD units). The SOLE commercial amount
    # kept here; expected execution costs live in ``config/costs.py``.
    funded_monthly_budget_minor: int = 50_000
    # Funded margin over the budget, in basis points. NULL/UNSET keeps funded
    # credit pricing (and therefore funded checkout) unavailable — a margin is
    # never guessed.
    funded_margin_bps: int | None = None

    # Add-on unit prices in minor USD units. Zero means "not yet priced", which
    # renders the add-on unavailable.
    addon_extra_project_usd_minor: int = 0
    addon_extra_prompts_usd_minor: int = 0

    # Top-up pack price + pack size. Both UNSET: the pack size is NULLABLE and
    # a top-up without a configured size issues no grant and stays
    # unavailable. Included benchmark credits and benchmark repetitions are
    # likewise unset and carry no default.
    topup_benchmark_credits_usd_minor: int = 0
    topup_benchmark_credits_per_pack: int | None = None
    included_benchmark_credits: int | None = None
    benchmark_repetitions: int | None = None
    # Fixed validity of a purchased top-up grant, in days.
    topup_credit_valid_days: int = 30

    # DEFERRED trial terms. Retained only as future catalog copy and as
    # grant-algebra/API fixtures: they never enable checkout (the catalog
    # reports trial_availability='unavailable' unconditionally).
    trial_days: int = 7
    trial_max_executions: int = 30

    razorpay_key_id: str = ""
    razorpay_key_secret: SecretStr = SecretStr("")
    razorpay_webhook_secret: SecretStr = SecretStr("")
    razorpay_api_base_url: str = "https://api.razorpay.com/v1"
    razorpay_checkout_hosts: str = "rzp.io,razorpay.com"
    request_timeout_seconds: float = 15.0
    http_max_connections: int = 20
    http_max_keepalive_connections: int = 10
    http_keepalive_expiry_seconds: float = 60.0
    checkout_expiry_minutes: int = 60
    # Validity of a server-resolved quote and of the pending activation that
    # stores it. A pending row older than this is eligible for abandonment.
    quote_validity_minutes: int = 60
    # Server-side digest secret for ``quote_id``. Empty falls back to the
    # webhook secret so a quote is never signed with a client-visible value.
    quote_signing_secret: SecretStr = SecretStr("")
    # Reconciliation sweep bounds (invariant 8: bounded SKIP LOCKED claims).
    reconciliation_batch_size: int = 50
    # A pending row is only probed once it has had this long to settle.
    reconciliation_stale_after_seconds: int = 300
    # After this long with no provider record, a pending row is abandoned.
    reconciliation_abandon_after_seconds: int = 86_400
    reconciliation_list_count: int = 100
    reconciliation_lookback_seconds: int = 86_400
    subscription_total_cycles: int = 1200
    past_due_grace_days: int = 3
    max_webhook_body_bytes: int = 262_144

    def checkout_hosts(self) -> frozenset[str]:
        return frozenset(
            host.strip().lower()
            for host in self.razorpay_checkout_hosts.split(",")
            if host.strip()
        )


billing_settings = BillingSettings()


@dataclass(frozen=True, slots=True)
class CommercialCatalog:
    """The whole resolved commercial catalog for one revision.

    Immutable and rebuilt from settings by ``commercial_catalog()``: an
    operator adding a private provider ref or an FX rate changes availability
    without any code change (invariant 1).
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


def _minor_units(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _level_ordinal(key: str, value: str) -> int:
    """The registry ordinal a level grant stores for a public level value."""
    definition = CAPABILITY_REGISTRY.require(key)
    return definition.ordered_values.index(value)


def _india_amount_minor(usd_minor: int) -> int:
    """India minor units from the operator-owned USD/INR rate.

    A zero/unset rate deliberately yields 0 ("route unavailable"), never a
    guessed rate.
    """
    rate = billing_settings.usd_inr_rate
    if rate <= 0:
        return 0
    return _minor_units(Decimal(usd_minor) * rate)


def _regional_prices(
    usd_minor: int, catalog_key: str, purpose: str
) -> dict[str, CatalogPrice]:
    """Both regional prices for one amount, each with its PRIVATE ref."""
    return {
        REGION_INTERNATIONAL: CatalogPrice(
            currency=CURRENCY_USD,
            amount_minor=usd_minor,
            tax_behavior=TAX_BEHAVIOR_INCLUSIVE,
            provider_price_ref=provider_price_ref(
                catalog_key, REGION_INTERNATIONAL, purpose
            ),
        ),
        REGION_INDIA: CatalogPrice(
            currency=CURRENCY_INR,
            amount_minor=_india_amount_minor(usd_minor),
            tax_behavior=TAX_BEHAVIOR_EXCLUSIVE,
            provider_price_ref=provider_price_ref(catalog_key, REGION_INDIA, purpose),
        ),
    }


def provider_price_ref(catalog_key: str, region: str, purpose: str) -> str:
    """The PRIVATE operator-owned provider price ref, or "" when absent.

    Single owner of the lookup (invariant 2). The map is keyed
    ``"{catalog_key}:{region}:{purpose}"`` and is settings-supplied, so an
    absent ref makes the item unavailable instead of failing at purchase.
    """
    return billing_settings.provider_price_refs.get(
        f"{catalog_key}:{region}:{purpose}", ""
    ).strip()


def _funded_credit_prices(catalog_key: str) -> dict[str, dict[str, CatalogPrice]]:
    """Funded credit prices by cadence/region, or empty while UNSET.

    The funded credit price is the funded execution budget plus the
    operator-owned margin. The margin is deliberately NULL until product sets
    it, so funded checkout stays UNAVAILABLE rather than guessing a price.
    """
    margin_bps = billing_settings.funded_margin_bps
    if margin_bps is None:
        return {}
    usd_minor = _minor_units(
        Decimal(billing_settings.funded_monthly_budget_minor)
        * (Decimal(10_000 + margin_bps) / Decimal(10_000))
    )
    return {
        CADENCE_MONTHLY: _regional_prices(usd_minor, catalog_key, PRICE_PURPOSE_CREDIT)
    }


def _plan_entry(
    *,
    key: str,
    name: str,
    description: str,
    base_usd_minor: int,
    grant_bundle: tuple[GrantTemplate, ...],
) -> PlanCatalogEntry:
    return PlanCatalogEntry(
        key=key,
        name=name,
        description=description,
        cadence=CADENCE_MONTHLY,
        base_prices=_regional_prices(base_usd_minor, key, PRICE_PURPOSE_BASE),
        credit_prices_by_cadence=_funded_credit_prices(key),
        grant_bundle=grant_bundle,
        # Trial checkout is DEFERRED: the terms below are catalog copy and
        # grant-algebra fixtures only; they never enable a purchase.
        trial_availability=AVAILABILITY_UNAVAILABLE,
        trial_unavailable_reason=REASON_TRIAL_UNAVAILABLE,
        self_serve=True,
        contact_only=False,
    )


def _tier_1_grants() -> tuple[GrantTemplate, ...]:
    return (
        GrantTemplate(KEY_PULSE_CADENCE, _level_ordinal(KEY_PULSE_CADENCE, "daily")),
        GrantTemplate(
            KEY_BENCHMARK_CADENCE, _level_ordinal(KEY_BENCHMARK_CADENCE, "weekly")
        ),
        GrantTemplate(KEY_PROJECT_SLOTS, 1),
        GrantTemplate(KEY_PROMPT_SLOTS, 10),
        GrantTemplate(KEY_MONITORED_URLS, 50),
        GrantTemplate(KEY_HISTORY_WINDOW, _level_ordinal(KEY_HISTORY_WINDOW, "90d")),
        GrantTemplate(KEY_MANUAL_RUNS_PER_DAY, 3),
        GrantTemplate(KEY_EXPORTS, 1),
    )


def _upper_tier_grants(
    *,
    project_slots: int,
    prompt_slots: int,
    monitored_urls: int,
    history_window: str,
    manual_runs_per_day: int,
) -> tuple[GrantTemplate, ...]:
    """Tier 2/3 bundle. Grok/Perplexity/Copilot are shown as coming-soon
    capability rows and are deliberately NOT granted here — a plan never issues
    a runnable provider grant for an unshipped adapter.
    """
    return (
        GrantTemplate(KEY_PULSE_CADENCE, _level_ordinal(KEY_PULSE_CADENCE, "daily")),
        GrantTemplate(
            KEY_BENCHMARK_CADENCE, _level_ordinal(KEY_BENCHMARK_CADENCE, "daily")
        ),
        GrantTemplate(KEY_PROJECT_SLOTS, project_slots),
        GrantTemplate(KEY_PROMPT_SLOTS, prompt_slots),
        GrantTemplate(KEY_MONITORED_URLS, monitored_urls),
        GrantTemplate(
            KEY_HISTORY_WINDOW, _level_ordinal(KEY_HISTORY_WINDOW, history_window)
        ),
        GrantTemplate(KEY_FANOUT, 1),
        GrantTemplate(KEY_MANUAL_RUNS_PER_DAY, manual_runs_per_day),
        GrantTemplate(KEY_EXPORTS, 1),
    )


def _build_plans() -> tuple[PlanCatalogEntry, ...]:
    return (
        _plan_entry(
            key=PLAN_TIER_1,
            name="Tier 1",
            description="Daily pulse and weekly benchmarks for one project.",
            base_usd_minor=TIER_1_BASE_USD_MINOR,
            grant_bundle=_tier_1_grants(),
        ),
        _plan_entry(
            key=PLAN_TIER_2,
            name="Tier 2",
            description="Daily benchmarks, prompt fan-out, and a year of history.",
            base_usd_minor=TIER_2_BASE_USD_MINOR,
            grant_bundle=_upper_tier_grants(
                project_slots=3,
                prompt_slots=30,
                monitored_urls=150,
                history_window="12mo",
                manual_runs_per_day=6,
            ),
        ),
        _plan_entry(
            key=PLAN_TIER_3,
            name="Tier 3",
            description="Portfolio coverage with two years of retained history.",
            base_usd_minor=TIER_3_BASE_USD_MINOR,
            grant_bundle=_upper_tier_grants(
                project_slots=10,
                prompt_slots=60,
                monitored_urls=400,
                history_window="24mo",
                manual_runs_per_day=12,
            ),
        ),
        # Enterprise is contact-only: no price, no provider ref, no grants.
        PlanCatalogEntry(
            key=PLAN_ENTERPRISE,
            name="Enterprise",
            description="Custom volume, security review, and deployment options.",
            cadence=CADENCE_CUSTOM,
            base_prices={},
            credit_prices_by_cadence={},
            grant_bundle=(),
            trial_availability=AVAILABILITY_UNAVAILABLE,
            trial_unavailable_reason=REASON_CONTACT_ONLY,
            self_serve=False,
            contact_only=True,
        ),
    )


def _addon_availability(prices: Mapping[str, CatalogPrice]) -> tuple[str, str | None]:
    """Available only when at least one region has a positive priced ref."""
    if any(price.purchasable for price in prices.values()):
        return AVAILABILITY_AVAILABLE, None
    return AVAILABILITY_UNAVAILABLE, REASON_CHECKOUT_UNAVAILABLE


def _build_addons() -> tuple[AddonCatalogEntry, ...]:
    entries: list[AddonCatalogEntry] = []
    for key, name, description, usd_minor, grants in (
        (
            ADDON_EXTRA_PROJECT,
            "Extra project",
            "One additional tracked project.",
            billing_settings.addon_extra_project_usd_minor,
            (GrantTemplate(KEY_PROJECT_SLOTS, ADDON_EXTRA_PROJECT_SLOTS_PER_UNIT),),
        ),
        (
            ADDON_EXTRA_PROMPTS,
            "Extra prompts",
            "Ten additional tracked prompts.",
            billing_settings.addon_extra_prompts_usd_minor,
            (GrantTemplate(KEY_PROMPT_SLOTS, ADDON_EXTRA_PROMPTS_SLOTS_PER_UNIT),),
        ),
    ):
        prices = _regional_prices(usd_minor, key, PRICE_PURPOSE_BASE)
        availability, reason = _addon_availability(prices)
        entries.append(
            AddonCatalogEntry(
                key=key,
                name=name,
                description=description,
                cadence=CADENCE_MONTHLY,
                quantity_bounds=QuantityBounds(ADDON_QUANTITY_MIN, ADDON_QUANTITY_MAX),
                prices=prices,
                grant_bundle_per_unit=grants,
                availability=availability,
                unavailable_reason=reason,
            )
        )
    return tuple(entries)


def _build_topups() -> tuple[TopupCatalogEntry, ...]:
    """Benchmark-credit packs. The pack size is UNSET, so the pack has no
    grant template and stays unavailable until product configures it.
    """
    credits_per_unit = billing_settings.topup_benchmark_credits_per_pack
    prices = _regional_prices(
        billing_settings.topup_benchmark_credits_usd_minor,
        TOPUP_BENCHMARK_CREDITS,
        PRICE_PURPOSE_BASE,
    )
    priced = any(price.purchasable for price in prices.values())
    grants = (
        (GrantTemplate(KEY_BENCHMARK_CREDITS, credits_per_unit),)
        if credits_per_unit
        else ()
    )
    available = priced and bool(grants)
    return (
        TopupCatalogEntry(
            key=TOPUP_BENCHMARK_CREDITS,
            name="Benchmark credits",
            description="One-time benchmark credits for extra deep runs.",
            quantity_bounds=QuantityBounds(TOPUP_QUANTITY_MIN, TOPUP_QUANTITY_MAX),
            prices=prices,
            grant_bundle_per_unit=grants,
            availability=(
                AVAILABILITY_AVAILABLE if available else AVAILABILITY_UNAVAILABLE
            ),
            unavailable_reason=None if available else REASON_CHECKOUT_UNAVAILABLE,
            expiry_days=billing_settings.topup_credit_valid_days,
        ),
    )


def commercial_catalog() -> CommercialCatalog:
    """Build the immutable commercial catalog from current settings.

    Rebuilt per call (cheap, no I/O) so an operator-supplied provider ref or FX
    rate takes effect without a process restart and tests can vary settings.
    """
    return CommercialCatalog(
        revision=billing_settings.catalog_version,
        plans=_build_plans(),
        addons=_build_addons(),
        topups=_build_topups(),
        providers=PUBLIC_PROVIDER_CATALOG,
    )


def region_checkout_ready(region: str) -> bool:
    """Whether the operator has enabled checkout for a region at all."""
    if not (billing_settings.checkout_enabled and billing_settings.razorpay_live_ready):
        return False
    if region == REGION_INTERNATIONAL:
        return billing_settings.razorpay_international_ready
    return True


def plan_checkout_availability(
    plan: PlanCatalogEntry, region: str
) -> tuple[bool, str | None]:
    """Whether a plan is purchasable in a region, with a safe reason if not.

    Config owns the rule (invariant 1): contact-only plans are never
    purchasable, and an absent private provider ref or an unpriced region makes
    the plan unavailable rather than failing at purchase.
    """
    if plan.contact_only or not plan.self_serve:
        return False, REASON_CONTACT_ONLY
    price = plan.base_price(region)
    if price is None or not price.purchasable or not region_checkout_ready(region):
        return False, REASON_CHECKOUT_UNAVAILABLE
    return True, None


def price_tax_minor(price: CatalogPrice) -> int:
    """Region tax added ON TOP of one configured price (0 when inclusive).

    Config owns the rate (invariant 1): an ``exclusive`` price (India) adds
    GST, an ``inclusive`` price is already final. Domain code never embeds a
    tax rate or a rounding rule.
    """
    if price.tax_behavior != TAX_BEHAVIOR_EXCLUSIVE:
        return 0
    return _minor_units(Decimal(price.amount_minor) * billing_settings.india_gst_rate)


def item_checkout_availability(
    *, availability: str, price: CatalogPrice | None, region: str
) -> tuple[bool, str | None]:
    """Whether one add-on/top-up is purchasable in a region, with a safe reason.

    An absent private provider ref, an unpriced region, a catalog-unavailable
    item, or a region without operator-enabled checkout all refuse here rather
    than failing mid-purchase.
    """
    if availability != AVAILABILITY_AVAILABLE:
        return False, REASON_CHECKOUT_UNAVAILABLE
    if price is None or not price.purchasable or not region_checkout_ready(region):
        return False, REASON_CHECKOUT_UNAVAILABLE
    return True, None


def plan_period_grant_specs(
    catalog_key: str, catalog_revision: str
) -> tuple[tuple[str, int], ...] | None:
    """Grant templates for one subscription period (config-owned seam).

    Owned here (invariant 1) so the lifecycle projector never hard-codes a
    grant bundle. Returns None for an unknown key or a revision the current
    catalog does not own — a stale revision must never silently issue today's
    bundle.
    """
    catalog = commercial_catalog()
    if catalog_revision != catalog.revision:
        return None
    plan = catalog.plan(catalog_key)
    templates = plan.grant_bundle if plan is not None else ()
    if not templates:
        addon = catalog.addon(catalog_key)
        templates = addon.grant_bundle_per_unit if addon is not None else ()
    if not templates:
        return None
    return tuple((template.key, template.value) for template in templates)


def topup_grant_specs(
    catalog_key: str, catalog_revision: str
) -> tuple[tuple[str, int], ...] | None:
    """PER-UNIT grant templates for one top-up pack (config-owned seam).

    Returns None for an unknown key, a revision the current catalog does not
    own, or a pack whose size is UNSET (an unsized pack issues nothing).
    """
    catalog = commercial_catalog()
    if catalog_revision != catalog.revision:
        return None
    topup = catalog.topup(catalog_key)
    templates = topup.grant_bundle_per_unit if topup is not None else ()
    if not templates:
        return None
    return tuple((template.key, template.value) for template in templates)


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


# Public usage units per counter capability type. Config owns the display unit
# (invariant 1) so the usage projection never invents one inline.
USAGE_UNITS_BY_CAPABILITY_TYPE: Final[dict[str, str]] = {
    "counter.consumable": "credits",
    "counter.occupancy": "slots",
    "counter.rate": "runs",
}


# BillingAccount.country_verification. ``declared`` is the buyer-submitted ISO
# country locked at purchase; ``provisional`` is the pre-purchase default.
COUNTRY_VERIFICATION_PROVISIONAL: Final = "provisional"
COUNTRY_VERIFICATION_DECLARED: Final = "declared"


# SubscriptionChangeResponse.status. Deliberately separate from the activation
# vocabulary: a scheduled cancellation is never pending/activated/failed.
CANCELLATION_SCHEDULED: Final = "cancellation_scheduled"
CANCELLATION_ALREADY_SCHEDULED: Final = "already_scheduled"


# UsageItemResponse.limit_state. Current registry counters are FINITE (measured
# by the ledger) or UNKNOWN (measurement not yet landed); ``unlimited`` exists
# in the contract but is never used to mean "unresolved".
LIMIT_STATE_FINITE: Final = "finite"
LIMIT_STATE_UNLIMITED: Final = "unlimited"
LIMIT_STATE_UNKNOWN: Final = "unknown"
