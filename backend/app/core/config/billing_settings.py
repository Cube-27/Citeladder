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

    # Legacy builder compatibility only; runtime billing reads never consult
    # this value and fail closed on a missing persisted published revision.
    catalog_version: str = "legacy-config-catalog"
    # Operational emergency switch only. Commercial prices, grants, campaign
    # policy and catalog revisions are persisted in BillingCatalogRevision.
    checkout_enabled: bool = False
    # Which provider identity admits NEW checkout. Shared, not vendor-owned:
    # it names the selected provider rather than configuring one. An identity
    # with no registered, configured adapter makes new checkout unavailable —
    # it never falls back to another provider (plan §3.3).
    checkout_provider: str = PROVIDER_RAZORPAY

    # India price is frozen when an item is provisioned from this
    # operator-owned rate. Zero deliberately means "route unavailable", never a
    # guessed rate.
    usd_inr_rate: Decimal = Decimal("0")
    india_gst_rate: Decimal = Decimal("0.18")
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

    @field_validator("seller_email")
    @classmethod
    def validate_seller_email(cls, value: str) -> str:
        normalized = value.strip()
        if normalized and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
            raise ValueError("seller_email must be an email address")
        return normalized

    @field_validator("invoice_prefix")
    @classmethod
    def validate_invoice_prefix(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9-]{1,16}", normalized):
            raise ValueError(
                "invoice_prefix must be 1-16 uppercase letters, digits, or hyphens"
            )
        return normalized


billing_settings = BillingSettings()
