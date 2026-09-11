"""Razorpay-owned configuration, isolated from the shared billing settings.

Plan §3.4: the kill switch, the quote-signing secret, the HTTP pool and the
commercial catalog are SHARED and stay in ``billing_settings``; credentials,
the fixed API origin, checkout hosts, readiness flags and webhook secrets
belong to this vendor and live here.

The variable NAMES are deliberately unchanged. ``BILLING_`` + ``razorpay_mode``
and ``BILLING_RAZORPAY_`` + ``mode`` are the same environment variable, so
moving the block costs no deployment edit — and, more importantly, nothing was
renamed into a fake-generic name whose meaning would change the moment another
provider is selected. Another provider gets its own module beside this one when
it is real.

Every guard the previous shared block enforced is preserved: the fixed API
origin, the key-prefix/mode agreement, the production ban on test mode, secret
redaction through ``SecretStr``, and the bounded webhook-secret rotation
window.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.billing_contracts import PROVIDER_RAZORPAY
from app.core.config.dotenv import dotenv_sources

#: The one API origin this adapter may talk to. Never configurable.
RAZORPAY_API_ORIGIN = "https://api.razorpay.com/v1"


class RazorpaySettings(BaseSettings):
    """Credentials, readiness and transport policy for the Razorpay adapter."""

    _backend_dir = Path(__file__).resolve().parents[3]
    model_config = SettingsConfigDict(
        env_prefix="BILLING_RAZORPAY_",
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    #: ``disabled`` is an OPERATIONAL state, not an environment: it admits no
    #: new payable intent and is never a valid ``provider_mode`` to freeze.
    mode: Literal["disabled", "test", "live"] = "disabled"
    test_ready: bool = False
    test_international_ready: bool = False
    test_india_ready: bool = False
    live_ready: bool = False
    international_ready: bool = False

    key_id: str = ""
    key_secret: SecretStr = SecretStr("")
    webhook_secret: SecretStr = SecretStr("")
    # Previous secret remains accepted only during a bounded operator-managed
    # rotation window. Empty means there is no active overlap.
    webhook_previous_secret: SecretStr = SecretStr("")
    webhook_previous_secret_expires_at: datetime | None = None
    webhook_previous_secret_started_at: datetime | None = None
    api_base_url: str = RAZORPAY_API_ORIGIN
    checkout_hosts: str = "rzp.io,razorpay.com"

    deployment_env: str = Field(
        default="development", validation_alias="APP_ENV", exclude=True
    )
    test_key_id_alias: str = Field(
        default="", validation_alias="RAZORPAY_TEST_KEY_ID", exclude=True, repr=False
    )
    test_key_secret_alias: SecretStr = Field(
        default=SecretStr(""), validation_alias="RAZORPAY_TEST_KEY_SECRET", exclude=True
    )

    @property
    def provider(self) -> str:
        """The provider identity this block configures."""
        return PROVIDER_RAZORPAY

    @field_validator(
        "webhook_previous_secret_started_at",
        "webhook_previous_secret_expires_at",
        mode="before",
    )
    @classmethod
    def optional_rotation_timestamp(cls, value: object) -> object:
        # Empty optional entries in a copied environment template disable overlap.
        return None if value == "" else value

    @model_validator(mode="after")
    def resolve_test_credentials(self) -> RazorpaySettings:
        if self.mode == "disabled":
            return self
        alias_secret = self.test_key_secret_alias.get_secret_value()
        if self.test_key_id_alias or alias_secret:
            if self.mode != "test":
                raise ValueError("Razorpay test aliases require test mode")
            self.key_id = _merge_credential(self.key_id, self.test_key_id_alias)
            self.key_secret = SecretStr(
                _merge_credential(self.key_secret.get_secret_value(), alias_secret)
            )
        self.require_provider_mode()
        return self

    def require_provider_mode(self) -> Literal["test", "live"]:
        """The configured ENVIRONMENT, or a ValueError naming what is wrong."""
        mode = self.mode
        if mode == "disabled":
            raise ValueError("Razorpay is disabled")
        if mode == "test" and self.deployment_env.lower() in {"production", "prod"}:
            raise ValueError("Razorpay test mode is forbidden in production")
        if self.api_base_url != RAZORPAY_API_ORIGIN:
            raise ValueError("Razorpay API origin is fixed")
        if not self.key_id.startswith(f"rzp_{mode}_"):
            raise ValueError("Razorpay key does not match provider mode")
        if not self.key_secret.get_secret_value():
            raise ValueError("Razorpay key secret is required")
        return mode

    def configured_mode(self) -> str | None:
        """``test``/``live`` when fully configured, else ``None`` (no raise).

        Readiness questions are asked on paths that must NOT explode when
        billing is simply switched off, so this is the non-raising form.
        """
        try:
            return self.require_provider_mode()
        except ValueError:
            return None

    def webhook_secrets(self, at: datetime) -> tuple[str, ...]:
        secrets: tuple[str, ...] = (self.webhook_secret.get_secret_value(),)
        start = self.webhook_previous_secret_started_at
        end = self.webhook_previous_secret_expires_at
        previous = self.webhook_previous_secret.get_secret_value()
        if previous and start and end and start.tzinfo and end.tzinfo:
            if start <= at < end <= start + timedelta(hours=24):
                secrets += (previous,)
        return secrets

    def checkout_host_set(self) -> frozenset[str]:
        return frozenset(
            host.strip().lower()
            for host in self.checkout_hosts.split(",")
            if host.strip()
        )

    def secret_values(self) -> tuple[str, ...]:
        """Every gateway secret this vendor holds, for separation checks.

        The quote-signing secret must not equal ANY provider's gateway secret.
        Returning them here keeps that check independent of which provider is
        currently selected for new checkout.
        """
        return tuple(
            value
            for value in (
                self.key_secret.get_secret_value(),
                self.webhook_secret.get_secret_value(),
                self.webhook_previous_secret.get_secret_value(),
            )
            if value
        )


def _merge_credential(canonical: str, alias: str) -> str:
    if canonical and alias and canonical != alias:
        raise ValueError("Conflicting Razorpay credential inputs")
    return canonical or alias


razorpay_settings = RazorpaySettings()


__all__ = [
    "RAZORPAY_API_ORIGIN",
    "RazorpaySettings",
    "razorpay_settings",
]
