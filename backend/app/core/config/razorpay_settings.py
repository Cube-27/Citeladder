"""Read-only Razorpay operator credentials; native config owns checkout/webhooks."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources

#: The one API origin this adapter may talk to. Never configurable.
RAZORPAY_API_ORIGIN = "https://api.razorpay.com/v1"


class RazorpaySettings(BaseSettings):
    """Shared read-only operator credentials and fixed-origin validation."""

    model_config = SettingsConfigDict(
        env_prefix="BILLING_RAZORPAY_",
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    mode: Literal["disabled", "test", "live"] = "disabled"

    key_id: str = ""

    key_secret: SecretStr = SecretStr("")

    api_base_url: str = RAZORPAY_API_ORIGIN

    deployment_env: str = Field(
        default="development", validation_alias="APP_ENV", exclude=True
    )

    test_key_id_alias: str = Field(
        default="", validation_alias="RAZORPAY_TEST_KEY_ID", exclude=True, repr=False
    )

    test_key_secret_alias: SecretStr = Field(
        default=SecretStr(""), validation_alias="RAZORPAY_TEST_KEY_SECRET", exclude=True
    )

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
