"""Razorpay webhook authentication and payload translation.

Vendor-specific by design (plan §3.5): the HMAC scheme, the header names, the
envelope shape and the status vocabulary are all Razorpay's, and none of them
is renamed into a fictitious shared protocol. What leaves this module is the
neutral :class:`WebhookEnvelope` the shared settlement machinery reads.

Order is security-critical and preserved from the previous domain-layer
implementation: authenticate the EXACT raw bytes first, and only then parse.
An unsigned, mis-signed, or oversized body never reaches a parse, let alone an
activation. The environment is read from trusted server configuration, never
from the body.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from app.connectors.billing.base import (
    ProviderPayment,
    ProviderSubscription,
    WebhookAuthenticationError,
    WebhookEnvelope,
)
from app.core.config.billing_contracts import (
    PROVIDER_RAZORPAY,
    RAZORPAY_EVENT_TYPES,
    RAZORPAY_PAYMENT_EVENT_TYPES,
    RAZORPAY_PAYMENT_STATUS_MAP,
)
from app.core.config.razorpay_settings import RazorpaySettings, razorpay_settings

SIGNATURE_HEADER = "X-Razorpay-Signature"
EVENT_ID_HEADER = "X-Razorpay-Event-Id"

_NOTE_INTENT = "citeladder_intent_id"
_NOTE_ACCOUNT = "citeladder_account_ref"
_NOTE_CATALOG_REVISION = "citeladder_catalog_revision"
_HEX = frozenset("0123456789abcdefABCDEF")


class InvalidWebhookPayloadError(ValueError):
    """An authenticated body this adapter cannot translate."""


class RazorpayWebhookVerifier:
    """Authenticate and translate Razorpay's webhook deliveries."""

    provider = PROVIDER_RAZORPAY

    def __init__(self, *, settings: RazorpaySettings = razorpay_settings) -> None:
        self._settings = settings

    def required_headers(self) -> tuple[str, ...]:
        return (SIGNATURE_HEADER, EVENT_ID_HEADER)

    def authenticate(self, raw_body: bytes, headers: Mapping[str, str]) -> str:
        """Constant-time HMAC-SHA256 over the raw body, then the event id."""
        signature = headers.get(SIGNATURE_HEADER) or headers.get(
            SIGNATURE_HEADER.lower(), ""
        )
        if not verify_signature(raw_body, signature, settings=self._settings):
            raise WebhookAuthenticationError("invalid_signature")
        event_id = (
            headers.get(EVENT_ID_HEADER) or headers.get(EVENT_ID_HEADER.lower()) or ""
        ).strip()
        if not event_id or len(event_id) > 255:
            raise WebhookAuthenticationError("invalid_event_id")
        return event_id

    def parse(self, raw_body: bytes, *, event_id: str) -> WebhookEnvelope:
        payload, event_type = _parse_payload(raw_body)
        # The ENVIRONMENT comes from trusted configuration, never the body.
        provider_mode = self._settings.require_provider_mode()
        is_payment = event_type in RAZORPAY_PAYMENT_EVENT_TYPES
        record: ProviderSubscription | ProviderPayment | None
        if is_payment:
            record = parse_payment_event(payload, provider_mode=provider_mode)
        elif event_type in RAZORPAY_EVENT_TYPES:
            record = parse_subscription_event(payload, provider_mode=provider_mode)
        else:
            record = None
        return WebhookEnvelope(
            provider=PROVIDER_RAZORPAY,
            provider_mode=provider_mode,
            event_id=event_id,
            event_type=event_type,
            record=record,
        )


def verify_signature(
    raw_body: bytes,
    signature: str,
    *,
    settings: RazorpaySettings = razorpay_settings,
) -> bool:
    """Whether ``signature`` is a valid HMAC of ``raw_body`` for any live secret.

    Accepts the previous secret only inside the operator's bounded rotation
    window, which the settings block owns.
    """
    if not signature or len(signature) > 256:
        return False
    supplied = signature.strip()
    if len(supplied) != 64 or any(character not in _HEX for character in supplied):
        return False
    secrets = settings.webhook_secrets(datetime.now(UTC))
    return any(
        secret
        and hmac.compare_digest(
            hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest(), supplied
        )
        for secret in secrets
    )


def parse_subscription_event(
    payload: dict[str, Any], *, provider_mode: str
) -> ProviderSubscription:
    """Translate a configured subscription event into the provider DTO."""
    entity = _entity(payload, "subscription")
    external_id = _bounded_ref(entity.get("id"), "invalid_subscription")
    status = entity.get("status")
    if not isinstance(status, str) or len(status) > 32:
        raise InvalidWebhookPayloadError("invalid_subscription")
    notes = _notes(entity)
    return ProviderSubscription(
        external_subscription_id=external_id,
        status=status,
        current_start=_bounded_int(entity.get("current_start")),
        current_end=_bounded_int(entity.get("current_end")),
        updated_at=(
            _bounded_int(entity.get("updated_at"))
            or _bounded_int(payload.get("created_at"))
            or 0
        ),
        cancel_at_period_end=_provider_bool(entity.get("cancel_at_cycle_end")),
        price_ref=_optional_str(entity.get("plan_id")),
        catalog_revision=_optional_str(notes.get(_NOTE_CATALOG_REVISION)),
        intent_id=_optional_str(notes.get(_NOTE_INTENT)),
        account_ref=_optional_str(notes.get(_NOTE_ACCOUNT)),
        provider_mode=provider_mode,
    )


def parse_payment_event(
    payload: dict[str, Any], *, provider_mode: str
) -> ProviderPayment:
    """Translate a configured payment event into the provider DTO."""
    entity = _entity(payload, "payment")
    external_id = _bounded_ref(entity.get("id"), "invalid_payment")
    status = entity.get("status")
    amount = _bounded_int(entity.get("amount"))
    currency = entity.get("currency")
    if (
        not isinstance(status, str)
        or status not in RAZORPAY_PAYMENT_STATUS_MAP
        or amount is None
        or not isinstance(currency, str)
        or len(currency) != 3
    ):
        raise InvalidWebhookPayloadError("invalid_payment")
    notes = _notes(entity)
    created_at = _bounded_int(payload.get("created_at")) or 0
    return ProviderPayment(
        external_payment_id=external_id,
        status=RAZORPAY_PAYMENT_STATUS_MAP[status],
        amount_minor=amount,
        currency=currency.upper(),
        updated_at=created_at,
        paid_at=_bounded_int(entity.get("created_at")) or created_at or None,
        intent_id=_optional_str(notes.get(_NOTE_INTENT)),
        account_ref=_optional_str(notes.get(_NOTE_ACCOUNT)),
        provider_mode=provider_mode,
        payment_method=_optional_bounded_str(entity.get("method"), 24),
        external_invoice_id=_optional_str(entity.get("invoice_id")),
    )


def _parse_payload(raw_body: bytes) -> tuple[dict[str, Any], str]:
    try:
        payload = json.loads(raw_body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidWebhookPayloadError("invalid_json") from exc
    if not isinstance(payload, dict):
        raise InvalidWebhookPayloadError("invalid_payload")
    event_type = payload.get("event")
    if not isinstance(event_type, str) or not event_type:
        raise InvalidWebhookPayloadError("invalid_event")
    return payload, event_type


def _entity(payload: dict[str, Any], name: str) -> dict[str, Any]:
    nested = payload.get("payload")
    if not isinstance(nested, dict):
        raise InvalidWebhookPayloadError("invalid_payload")
    wrapper = nested.get(name)
    if not isinstance(wrapper, dict):
        raise InvalidWebhookPayloadError("invalid_payload")
    entity = wrapper.get("entity")
    if not isinstance(entity, dict):
        raise InvalidWebhookPayloadError("invalid_payload")
    return entity


def _bounded_ref(value: object, error: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 255:
        raise InvalidWebhookPayloadError(error)
    return value


def _notes(entity: dict[str, Any]) -> dict[str, Any]:
    notes = entity.get("notes")
    return notes if isinstance(notes, dict) else {}


def _bounded_int(value: object) -> int | None:
    if (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 <= value <= 2**63 - 1
    ):
        return value
    return None


def _optional_str(value: object) -> str:
    return value if isinstance(value, str) else ""


def _optional_bounded_str(value: object, maximum: int) -> str:
    if not isinstance(value, str):
        return ""
    normalized = value.strip()
    return normalized if len(normalized) <= maximum else ""


def _provider_bool(value: object) -> bool:
    return value is True or value == 1


__all__ = [
    "EVENT_ID_HEADER",
    "SIGNATURE_HEADER",
    "InvalidWebhookPayloadError",
    "RazorpayWebhookVerifier",
    "parse_payment_event",
    "parse_subscription_event",
    "verify_signature",
]
