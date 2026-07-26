"""Razorpay webhook authentication, dedupe, and lifecycle projection."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing import (
    PROVIDER_RAZORPAY,
    RAZORPAY_EVENT_TYPES,
    billing_settings,
)
from app.domain.billing.service import apply_subscription_state
from app.models.billing import BillingSubscription, BillingWebhookEvent


class InvalidWebhookError(ValueError):
    pass


def verify_razorpay_signature(raw_body: bytes, signature: str) -> bool:
    secret = billing_settings.razorpay_webhook_secret.get_secret_value()
    if not secret or not signature or len(signature) > 256:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())


async def process_razorpay_webhook(
    session: AsyncSession,
    *,
    raw_body: bytes,
    event_id: str,
) -> str:
    if not event_id or len(event_id) > 255:
        raise InvalidWebhookError("invalid_event_id")
    try:
        payload = json.loads(raw_body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidWebhookError("invalid_json") from exc
    if not isinstance(payload, dict):
        raise InvalidWebhookError("invalid_payload")
    event_type = payload.get("event")
    if not isinstance(event_type, str) or not event_type:
        raise InvalidWebhookError("invalid_event")
    if event_type not in RAZORPAY_EVENT_TYPES:
        return "ignored"
    entity = _subscription_entity(payload)
    external_subscription_id = entity.get("id")
    provider_status = entity.get("status")
    if (
        not isinstance(external_subscription_id, str)
        or len(external_subscription_id) > 255
        or not isinstance(provider_status, str)
        or len(provider_status) > 32
    ):
        raise InvalidWebhookError("invalid_subscription")

    safe_summary = {
        "subscription_id_hash": hashlib.sha256(
            external_subscription_id.encode()
        ).hexdigest(),
        "status": provider_status,
    }
    inserted_id = await session.scalar(
        pg_insert(BillingWebhookEvent)
        .values(
            provider=PROVIDER_RAZORPAY,
            external_event_id=event_id,
            event_type=event_type,
            payload_sha256=hashlib.sha256(raw_body).hexdigest(),
            safe_summary=safe_summary,
        )
        .on_conflict_do_nothing(index_elements=["provider", "external_event_id"])
        .returning(BillingWebhookEvent.id)
    )
    if inserted_id is None:
        await session.rollback()
        return "duplicate"
    event = await session.get(BillingWebhookEvent, inserted_id)
    if event is None:  # pragma: no cover
        raise RuntimeError("inserted webhook event could not be loaded")
    subscription = await session.scalar(
        select(BillingSubscription).where(
            BillingSubscription.provider == PROVIDER_RAZORPAY,
            BillingSubscription.external_subscription_id == external_subscription_id,
        )
    )
    if subscription is None:
        event.result_code = "unmatched"
        event.processed_at = _now()
        await session.commit()
        return "unmatched"
    updated_at = (
        _bounded_int(entity.get("updated_at"))
        or _bounded_int(payload.get("created_at"))
        or 0
    )
    applied = await apply_subscription_state(
        session,
        subscription,
        provider_status=provider_status,
        current_start=_bounded_int(entity.get("current_start")),
        current_end=_bounded_int(entity.get("current_end")),
        updated_at=updated_at,
        cancel_at_period_end=_provider_bool(entity.get("cancel_at_cycle_end")),
    )
    event.result_code = "applied" if applied else "stale"
    event.processed_at = _now()
    await session.commit()
    return event.result_code


def _subscription_entity(payload: dict[str, Any]) -> dict[str, Any]:
    nested = payload.get("payload")
    if not isinstance(nested, dict):
        raise InvalidWebhookError("invalid_payload")
    subscription = nested.get("subscription")
    if not isinstance(subscription, dict):
        raise InvalidWebhookError("invalid_payload")
    entity = subscription.get("entity")
    if not isinstance(entity, dict):
        raise InvalidWebhookError("invalid_payload")
    return entity


def _bounded_int(value: object) -> int | None:
    if (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 <= value <= 2**63 - 1
    ):
        return value
    return None


def _provider_bool(value: object) -> bool:
    return value is True or value == 1


def _now():
    from datetime import UTC, datetime

    return datetime.now(UTC)
