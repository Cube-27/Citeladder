from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources


class BillingSettings(BaseSettings):
    """Environment-owned billing catalog and Razorpay integration settings."""

    _backend_dir = Path(__file__).resolve().parents[3]
    model_config = SettingsConfigDict(
        env_prefix="BILLING_",
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    # Legacy builder compatibility only; runtime billing reads never consult
    # this value and fail closed on a missing persisted published revision.
    catalog_version: str = "legacy-config-catalog"
    # Operational emergency switch only. Commercial prices, grants, campaign
    # policy and catalog revisions are persisted in BillingCatalogRevision.
    checkout_enabled: bool = False
    razorpay_mode: Literal["disabled", "test", "live"] = "disabled"
    razorpay_test_ready: bool = False
    razorpay_test_international_ready: bool = False
    razorpay_test_india_ready: bool = False
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
    contact_sales_url: str = "https://www.cube27.com/contact/"

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
    # unavailable. Included audit credits and audit repetitions are
    # likewise unset and carry no default.
    topup_audit_credits_usd_minor: int = 0
    topup_audit_credits_per_pack: int | None = None
    included_audit_credits: int | None = None
    audit_repetitions: int | None = None
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
    # Previous secret remains accepted only during a bounded operator-managed
    # rotation window. Empty means there is no active overlap.
    razorpay_webhook_previous_secret: SecretStr = SecretStr("")
    razorpay_webhook_previous_secret_expires_at: datetime | None = None
    razorpay_webhook_previous_secret_started_at: datetime | None = None
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
    # Independent server-only secret; no webhook-secret fallback.
    quote_signing_secret: SecretStr = SecretStr("")
    # Reconciliation sweep bounds (invariant 8: bounded SKIP LOCKED claims).
    reconciliation_poll_seconds: int = 2
    reconciliation_batch_size: int = 50
    # A pending row is only probed once it has had this long to settle.
    reconciliation_stale_after_seconds: int = 300
    # After this long with no provider record, a pending row is abandoned.
    reconciliation_abandon_after_seconds: int = 86_400
    reconciliation_list_count: int = Field(default=100, ge=1, le=100)
    reconciliation_max_pages: int = Field(default=5, ge=1, le=20)
    reconciliation_lookback_seconds: int = 86_400
    reconciliation_lease_seconds: int = 120
    reconciliation_max_attempts: int = 8
    reconciliation_backoff_base_seconds: int = 60
    webhook_lease_seconds: int = 120
    webhook_max_attempts: int = 8
    subscription_total_cycles: int = 1200
    past_due_grace_days: int = 3
    max_webhook_body_bytes: int = 262_144

    deployment_env: str = Field(
        default="development", validation_alias="APP_ENV", exclude=True
    )
    test_key_id_alias: str = Field(
        default="", validation_alias="RAZORPAY_TEST_KEY_ID", exclude=True, repr=False
    )
    test_key_secret_alias: SecretStr = Field(
        default=SecretStr(""), validation_alias="RAZORPAY_TEST_KEY_SECRET", exclude=True
    )

    @field_validator(
        "razorpay_webhook_previous_secret_started_at",
        "razorpay_webhook_previous_secret_expires_at",
        mode="before",
    )
    @classmethod
    def optional_rotation_timestamp(cls, value: object) -> object:
        # Empty optional entries in a copied environment template disable overlap.
        return None if value == "" else value

    @model_validator(mode="after")
    def resolve_test_credentials(self) -> BillingSettings:
        if self.razorpay_mode == "disabled":
            return self
        alias_secret = self.test_key_secret_alias.get_secret_value()
        if self.test_key_id_alias or alias_secret:
            if self.razorpay_mode != "test":
                raise ValueError("Razorpay test aliases require test mode")
            self.razorpay_key_id = _merge_credential(
                self.razorpay_key_id, self.test_key_id_alias
            )
            self.razorpay_key_secret = SecretStr(
                _merge_credential(
                    self.razorpay_key_secret.get_secret_value(), alias_secret
                )
            )
        self.require_provider_mode()
        return self

    def require_provider_mode(self) -> Literal["test", "live"]:
        mode = self.razorpay_mode
        if mode == "disabled":
            raise ValueError("Razorpay is disabled")
        if mode == "test" and self.deployment_env.lower() in {"production", "prod"}:
            raise ValueError("Razorpay test mode is forbidden in production")
        if self.razorpay_api_base_url != "https://api.razorpay.com/v1":
            raise ValueError("Razorpay API origin is fixed")
        if not self.razorpay_key_id.startswith(f"rzp_{mode}_"):
            raise ValueError("Razorpay key does not match provider mode")
        if not self.razorpay_key_secret.get_secret_value():
            raise ValueError("Razorpay key secret is required")
        return mode

    def webhook_secrets(self, at: datetime) -> tuple[str, ...]:
        secrets: tuple[str, ...] = (self.razorpay_webhook_secret.get_secret_value(),)
        start = self.razorpay_webhook_previous_secret_started_at
        end = self.razorpay_webhook_previous_secret_expires_at
        previous = self.razorpay_webhook_previous_secret.get_secret_value()
        if previous and start and end and start.tzinfo and end.tzinfo:
            if start <= at < end <= start + timedelta(hours=24):
                secrets += (previous,)
        return secrets

    def checkout_hosts(self) -> frozenset[str]:
        return frozenset(
            host.strip().lower()
            for host in self.razorpay_checkout_hosts.split(",")
            if host.strip()
        )


def _merge_credential(canonical: str, alias: str) -> str:
    if canonical and alias and canonical != alias:
        raise ValueError("Conflicting Razorpay credential inputs")
    return canonical or alias


billing_settings = BillingSettings()
