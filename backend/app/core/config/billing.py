"""Billing catalog, lifecycle vocabulary, and provider settings.

This is the only owner of commercial amounts, tax/routing rules, provider
credentials, and billing guardrails (invariant 1). Domain and connector code
consume the resolved values; they never embed price or provider configuration.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Final

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

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

    # India price is frozen when an item is provisioned from this
    # operator-owned rate. Zero deliberately means "route unavailable", never a
    # guessed rate.
    usd_inr_rate: Decimal = Decimal("0")
    india_gst_rate: Decimal = Decimal("0.18")

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


def plan_period_grant_specs(
    catalog_key: str, catalog_revision: str
) -> tuple[tuple[str, int], ...] | None:
    """Grant templates for one subscription period (commercial catalog seam).

    Owned here (invariant 1) so the lifecycle projector never hard-codes a
    grant bundle. The v8 plan catalog with per-plan grant templates lands with
    the commercial-surface commit; until then every key resolves to None and
    lifecycle events issue no bundles.
    """
    del catalog_key, catalog_revision
    return None
