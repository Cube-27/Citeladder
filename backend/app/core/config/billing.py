"""Billing catalog, lifecycle vocabulary, and provider settings.

This is the only owner of commercial amounts, tax/routing rules, provider
credentials, and billing guardrails (invariant 1). Domain and connector code
consume the resolved values; they never embed price or provider configuration.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Final

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

TIER_FREE: Final = "free"
TIER_PAID: Final = "paid"
TIERS: Final = frozenset({TIER_FREE, TIER_PAID})

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


@dataclass(frozen=True, slots=True)
class CapabilityProfile:
    tier_key: str
    audit_web_search: bool
    audit_scheduling: bool
    site_health_capability: str


@dataclass(frozen=True, slots=True)
class CatalogEntry:
    tier_key: str
    name: str
    cadence: str
    self_serve: bool
    description: str
    features: tuple[str, ...]


CAPABILITY_PROFILES: Final[dict[str, CapabilityProfile]] = {
    TIER_FREE: CapabilityProfile(
        tier_key=TIER_FREE,
        audit_web_search=False,
        audit_scheduling=False,
        site_health_capability="free",
    ),
    TIER_PAID: CapabilityProfile(
        tier_key=TIER_PAID,
        audit_web_search=True,
        audit_scheduling=True,
        site_health_capability="starter",
    ),
}

CATALOG_ENTRIES: Final[tuple[CatalogEntry, ...]] = (
    CatalogEntry(
        tier_key=TIER_FREE,
        name="Free",
        cadence="none",
        self_serve=True,
        description="Explore Searchify with the core evidence workflow.",
        features=(
            "Bring your own answer-engine keys",
            "Deterministic visibility evidence",
            "Site Health sample crawl",
        ),
    ),
    CatalogEntry(
        tier_key=TIER_PAID,
        name="Paid",
        cadence=CADENCE_MONTHLY,
        self_serve=True,
        description="Starter capabilities for recurring monitoring.",
        features=(
            "Everything in Free",
            "Full Site Health inventory and monitored URLs",
            "Web-search-grounded audits",
            "Authenticated exports",
        ),
    ),
    CatalogEntry(
        tier_key="enterprise",
        name="Enterprise",
        cadence="custom",
        self_serve=False,
        description="Custom volume, security review, and deployment options.",
        features=(
            "Custom projects, seats, volume, and retention",
            "Security review and named contact",
            "Managed-cloud or self-hosted deployment",
        ),
    ),
)


@dataclass(frozen=True, slots=True)
class PriceQuote:
    region: str
    currency: str
    base_amount_minor: int
    tax_amount_minor: int
    total_amount_minor: int
    tax_label: str | None
    provider_plan_id: str
    available: bool


class BillingSettings(BaseSettings):
    """Environment-owned billing catalog and Razorpay integration settings."""

    _backend_dir = Path(__file__).resolve().parents[3]
    model_config = SettingsConfigDict(
        env_prefix="BILLING_",
        env_file=(str(_backend_dir.parent / ".env"), str(_backend_dir / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    catalog_version: str = "billing-v1"
    checkout_enabled: bool = False
    razorpay_live_ready: bool = False
    razorpay_international_ready: bool = False

    # Existing published Paid anchor. International subscriptions present USD;
    # the card issuer may convert into the cardholder's account currency.
    paid_monthly_usd_minor: int = 4900
    # India price is frozen when a plan is provisioned from this operator-owned
    # rate. Zero deliberately means "route unavailable", never a guessed rate.
    usd_inr_rate: Decimal = Decimal("0")
    india_gst_rate: Decimal = Decimal("0.18")

    razorpay_key_id: str = ""
    razorpay_key_secret: SecretStr = SecretStr("")
    razorpay_webhook_secret: SecretStr = SecretStr("")
    razorpay_paid_monthly_usd_plan_id: str = ""
    razorpay_paid_monthly_inr_plan_id: str = ""

    razorpay_api_base_url: str = "https://api.razorpay.com/v1"
    razorpay_checkout_hosts: str = "rzp.io,razorpay.com"
    request_timeout_seconds: float = 15.0
    http_max_connections: int = 20
    http_max_keepalive_connections: int = 10
    http_keepalive_expiry_seconds: float = 60.0
    checkout_expiry_minutes: int = 60
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


def capability_profile(tier_key: str) -> CapabilityProfile:
    """Return a known profile, failing closed to Free for corrupt input."""
    return CAPABILITY_PROFILES.get(tier_key, CAPABILITY_PROFILES[TIER_FREE])


def _minor_units(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def quote_for_country(country_code: str | None) -> PriceQuote:
    """Resolve the fixed launch quote from a persisted billing country.

    India uses a provision-time USD/INR rate and adds GST. Every other country
    uses the fixed USD plan. The browser cannot supply a currency or rate.
    """
    country = (country_code or "").strip().upper()
    if country == "IN":
        rate = billing_settings.usd_inr_rate
        base = (
            _minor_units(Decimal(billing_settings.paid_monthly_usd_minor) * rate)
            if rate > 0
            else 0
        )
        tax = _minor_units(Decimal(base) * billing_settings.india_gst_rate)
        plan_id = billing_settings.razorpay_paid_monthly_inr_plan_id.strip()
        return PriceQuote(
            region="india",
            currency="INR",
            base_amount_minor=base,
            tax_amount_minor=tax,
            total_amount_minor=base + tax,
            tax_label=(
                f"GST {billing_settings.india_gst_rate * Decimal(100):g}% extra"
            ),
            provider_plan_id=plan_id,
            available=bool(
                billing_settings.checkout_enabled
                and billing_settings.razorpay_live_ready
                and base > 0
                and plan_id
            ),
        )

    plan_id = billing_settings.razorpay_paid_monthly_usd_plan_id.strip()
    return PriceQuote(
        region="international",
        currency="USD",
        base_amount_minor=billing_settings.paid_monthly_usd_minor,
        tax_amount_minor=0,
        total_amount_minor=billing_settings.paid_monthly_usd_minor,
        tax_label=None,
        provider_plan_id=plan_id,
        available=bool(
            billing_settings.checkout_enabled
            and billing_settings.razorpay_live_ready
            and billing_settings.razorpay_international_ready
            and plan_id
        ),
    )
