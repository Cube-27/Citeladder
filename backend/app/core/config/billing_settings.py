from __future__ import annotations

import re
from decimal import Decimal
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.billing_contracts import PROVIDER_RAZORPAY
from app.core.config.dotenv import dotenv_sources


class BillingSettings(BaseSettings):
    """Environment-owned billing catalog and SHARED commercial settings.

    Shared means "true regardless of which payment provider is selected": the
    checkout kill switch, the independent quote-signing secret, the commercial
    catalog inputs, the HTTP pool and the reconciliation/webhook sweep bounds.

    Provider credentials, API origins, webhook secrets and readiness flags are
    NOT here — they belong to their adapter's own settings module
    (``app.core.config.razorpay_settings``), so nothing in the shared layer
    silently means "the current gateway" (plan §3.4).
    """

    _backend_dir = Path(__file__).resolve().parents[3]
    model_config = SettingsConfigDict(
        env_prefix="BILLING_",
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    # Operational emergency switch only. Commercial prices, grants, campaign
    # policy and catalog revisions are persisted in BillingCatalogRevision.
    checkout_enabled: bool = False
    # Which provider identity admits NEW checkout. Shared, not vendor-owned:
    # it names the selected provider rather than configuring one. An identity
    # with no registered, configured adapter makes new checkout unavailable —
    # it never falls back to another provider (plan §3.3).
    checkout_provider: str = PROVIDER_RAZORPAY

    # The approved Indian GST rate and the reference to its approval record.
    # Both are REQUIRED: there is no source default, and Indian checkout,
    # quotes and India catalog authoring fail closed while either is unset.
    india_gst_rate: Decimal | None = None
    india_gst_approval_reference: str = ""
    # Seller identity is configuration, while the applicable tax treatment is
    # determined per transaction in ``billing_tax``.
    seller_legal_name: str = ""
    seller_legal_address: str = ""
    seller_email: str = ""
    seller_gstin: str = ""
    seller_gst_state_code: str = ""
    seller_gst_state_name: str = ""
    seller_sac: str = ""
    seller_lut_reference: str = ""
    invoice_prefix: str = "CL"

    # Where a contact-only plan sends the buyer (display metadata, no price).
    contact_sales_url: str = "https://www.cube27.com/contact/"

    # Funded admission budget (minor USD units). The SOLE commercial amount
    # kept here; expected execution costs live in ``config/costs.py``.
    funded_monthly_budget_minor: int = 50_000
    # DEFERRED trial terms. Retained only as future catalog copy and as
    # grant-algebra/API fixtures: they never enable checkout (the catalog
    # reports trial_availability='unavailable' unconditionally).
    trial_days: int = 7

    request_timeout_seconds: float = 15.0
    http_max_connections: int = 20
    http_max_keepalive_connections: int = 10
    http_keepalive_expiry_seconds: float = 60.0
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
    reconciliation_lease_seconds: int = 120
    reconciliation_max_attempts: int = 8
    reconciliation_backoff_base_seconds: int = 60
    webhook_lease_seconds: int = 120
    webhook_max_attempts: int = 8
    # Monthly cycles a new subscription authorises (Razorpay ``total_count``).
    # Bounded so a typo can neither create a one-cycle subscription that
    # silently completes nor an unbounded mandate.
    subscription_total_cycles: int = Field(default=1200, ge=12, le=1200)
    # Smallest prorated upgrade charge, in minor units. Razorpay refuses an
    # order below one major unit, so a smaller difference is not charged and
    # the upgrade is refused rather than created and left unpayable.
    plan_change_minimum_charge_minor: int = Field(default=100, ge=100)
    max_webhook_body_bytes: int = 262_144

    @field_validator("india_gst_rate", mode="before")
    @classmethod
    def blank_gst_rate_is_unset(cls, value: object) -> object:
        # An empty ``BILLING_INDIA_GST_RATE=`` means "not approved", not an error.
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("seller_email")
    @classmethod
    def validate_seller_email(cls, value: str) -> str:
        normalized = value.strip()
        if normalized and not re.fullmatch(
            r"[^@\s]+@[^@.\s]+(?:\.[^@.\s]+)+", normalized
        ):
            raise ValueError("seller_email must be an email address")
        return normalized

    @field_validator("invoice_prefix")
    @classmethod
    def validate_invoice_prefix(cls, value: str) -> str:
        normalized = value.strip().upper()
        # GST caps a document number at 16 characters; with the compact
        # "C/2627/000001" suffix a prefix may use at most three.
        if not re.fullmatch(r"[A-Z0-9]{1,3}", normalized):
            raise ValueError("invoice_prefix must be 1-3 uppercase letters or digits")
        return normalized


billing_settings = BillingSettings()
