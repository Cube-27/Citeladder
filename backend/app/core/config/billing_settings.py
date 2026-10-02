from __future__ import annotations

import re
from decimal import Decimal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.billing_contracts import PROVIDER_RAZORPAY
from app.core.config.dotenv import dotenv_sources


class BillingSettings(BaseSettings):
    """Shared tax, seller and read-only operator settings."""

    model_config = SettingsConfigDict(
        env_prefix="BILLING_",
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    checkout_provider: str = PROVIDER_RAZORPAY

    india_gst_rate: Decimal | None = None

    india_gst_approval_reference: str = ""

    seller_legal_name: str = ""

    seller_legal_address: str = ""

    seller_email: str = ""

    seller_gstin: str = ""

    seller_gst_state_code: str = ""

    seller_gst_state_name: str = ""

    seller_sac: str = ""

    seller_lut_reference: str = ""

    invoice_prefix: str = "CL"

    request_timeout_seconds: float = 15.0

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
