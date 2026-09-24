"""Razorpay browser-checkout initialization and callback authentication.

Everything vendor-shaped about checkout lives here: the SDK's name, the
publishable key, the ``razorpay_*`` callback field names, their exact formats,
and the two HMAC schemes. The shared checkout controller sees only
:class:`CheckoutInitialization` and a pass/fail on the callback, so it never
has to know any of it (plan §3.4).

Two references are opened through the same Standard Checkout SDK:

* a recurring ``sub_…`` subscription, signed ``payment_id|subscription_id``;
* a one-time ``order_…`` order, signed ``order_id|payment_id``.

Which scheme applies is decided by the reference PERSISTED on the intent,
never by a field the browser sends, and the signature is always computed over
that stored reference. The callback is typed and ALLOWLISTED: exactly three
fields, each matched against its format before any signature work. A neutral
wrapper around the payload is not permission to accept arbitrary data.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.connectors.billing.base import (
    CHECKOUT_FLOW_SDK,
    CHECKOUT_REFERENCE_ORDER,
    CHECKOUT_REFERENCE_SUBSCRIPTION,
    CheckoutCallbackError,
    CheckoutInitialization,
)
from app.core.config.billing_contracts import PROVIDER_RAZORPAY
from app.core.config.razorpay_settings import RazorpaySettings, razorpay_settings

#: The vendor SDK the browser loads for this flow. Named here, not in the
#: shared controller, and never assembled from a callback-supplied URL.
RAZORPAY_SDK_NAME = "razorpay-checkout"

_ORDER_PREFIX = "order_"


class _CallbackFields(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    razorpay_payment_id: str = Field(pattern=r"^pay_[a-zA-Z0-9]+$", max_length=255)
    razorpay_signature: str = Field(pattern=r"^[a-fA-F0-9]{64}$", repr=False)


class RazorpayCallbackFields(_CallbackFields):
    """The EXACT three fields a subscription checkout callback may carry."""

    razorpay_subscription_id: str = Field(pattern=r"^sub_[a-zA-Z0-9]+$", max_length=255)


class RazorpayOrderCallbackFields(_CallbackFields):
    """The EXACT three fields a one-time order checkout callback may carry."""

    razorpay_order_id: str = Field(pattern=r"^order_[a-zA-Z0-9]+$", max_length=255)


def _reference_kind(external_reference: str) -> str:
    if external_reference.startswith(_ORDER_PREFIX):
        return CHECKOUT_REFERENCE_ORDER
    return CHECKOUT_REFERENCE_SUBSCRIPTION


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
            reference_kind=_reference_kind(external_reference),
        )

    def verify_callback(
        self, *, external_reference: str, fields: Mapping[str, str]
    ) -> None:
        message = self._signed_message(external_reference, fields)
        secret = self._settings.key_secret.get_secret_value()
        if not secret:
            raise CheckoutCallbackError("provider_not_configured")
        expected = hmac.new(secret.encode(), message.encode(), hashlib.sha256)
        # The signature's format was validated by ``_signed_message``.
        supplied = fields["razorpay_signature"].lower()
        if not hmac.compare_digest(expected.hexdigest(), supplied):
            raise CheckoutCallbackError("invalid_callback_signature")

    @staticmethod
    def _signed_message(external_reference: str, fields: Mapping[str, str]) -> str:
        """The exact string Razorpay signed, built from the STORED reference."""
        try:
            if _reference_kind(external_reference) == CHECKOUT_REFERENCE_ORDER:
                order = RazorpayOrderCallbackFields.model_validate(dict(fields))
                if order.razorpay_order_id != external_reference:
                    raise CheckoutCallbackError("callback_reference_mismatch")
                return f"{external_reference}|{order.razorpay_payment_id}"
            subscription = RazorpayCallbackFields.model_validate(dict(fields))
        except ValidationError as exc:
            raise CheckoutCallbackError("invalid_callback_fields") from exc
        if subscription.razorpay_subscription_id != external_reference:
            raise CheckoutCallbackError("callback_reference_mismatch")
        return f"{subscription.razorpay_payment_id}|{external_reference}"


__all__ = [
    "RAZORPAY_SDK_NAME",
    "RazorpayCallbackFields",
    "RazorpayCheckoutAdapter",
    "RazorpayOrderCallbackFields",
]
