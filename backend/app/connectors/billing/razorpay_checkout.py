"""Razorpay browser-checkout initialization and callback authentication.

Everything vendor-shaped about checkout lives here: the SDK's name, the
publishable key, the ``razorpay_*`` callback field names, their exact formats,
and the ``payment_id|subscription_id`` HMAC scheme. The shared checkout
controller sees only :class:`CheckoutInitialization` and a pass/fail on the
callback, so it never has to know any of it (plan §3.4).

The callback is typed and ALLOWLISTED: exactly three fields, each matched
against its format before any signature work. A neutral wrapper around the
payload is not permission to accept arbitrary data.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.connectors.billing.base import (
    CHECKOUT_FLOW_SDK,
    CheckoutCallbackError,
    CheckoutInitialization,
)
from app.core.config.billing_contracts import PROVIDER_RAZORPAY
from app.core.config.razorpay_settings import RazorpaySettings, razorpay_settings

#: The vendor SDK the browser loads for this flow. Named here, not in the
#: shared controller, and never assembled from a callback-supplied URL.
RAZORPAY_SDK_NAME = "razorpay-checkout"


class RazorpayCallbackFields(BaseModel):
    """The EXACT three fields Razorpay's browser callback may carry."""

    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    razorpay_payment_id: str = Field(pattern=r"^pay_[a-zA-Z0-9]+$", max_length=255)
    razorpay_subscription_id: str = Field(pattern=r"^sub_[a-zA-Z0-9]+$", max_length=255)
    razorpay_signature: str = Field(pattern=r"^[a-fA-F0-9]{64}$", repr=False)


class RazorpayCheckoutAdapter:
    """Public checkout initialization + callback authentication for Razorpay."""

    provider = PROVIDER_RAZORPAY

    def __init__(self, *, settings: RazorpaySettings = razorpay_settings) -> None:
        self._settings = settings

    def initialization(
        self, *, external_reference: str, provider_mode: str
    ) -> CheckoutInitialization:
        """Razorpay drives checkout from its own SDK, not a redirect URL.

        ``public_key`` is the publishable key id — the only credential that
        belongs in a browser. The key secret never leaves the server.
        """
        return CheckoutInitialization(
            flow=CHECKOUT_FLOW_SDK,
            provider=PROVIDER_RAZORPAY,
            provider_mode=provider_mode,
            sdk_name=RAZORPAY_SDK_NAME,
            public_key=self._settings.key_id,
            reference=external_reference,
        )

    def verify_callback(
        self, *, external_reference: str, fields: Mapping[str, str]
    ) -> None:
        try:
            callback = RazorpayCallbackFields.model_validate(dict(fields))
        except ValidationError as exc:
            raise CheckoutCallbackError("invalid_callback_fields") from exc
        if callback.razorpay_subscription_id != external_reference:
            raise CheckoutCallbackError("callback_reference_mismatch")
        secret = self._settings.key_secret.get_secret_value()
        if not secret:
            raise CheckoutCallbackError("provider_not_configured")
        message = f"{callback.razorpay_payment_id}|{external_reference}".encode()
        expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, callback.razorpay_signature.lower()):
            raise CheckoutCallbackError("invalid_callback_signature")


__all__ = [
    "RAZORPAY_SDK_NAME",
    "RazorpayCallbackFields",
    "RazorpayCheckoutAdapter",
]
