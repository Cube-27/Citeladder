"""Bounded recovery of durable webhook receipts, including interrupted dispatch.

Each receipt is replayed against the provider and environment PERSISTED on
it, never against the current new-checkout default, so a deployment that
switches providers cannot finish somebody else's obligation with the wrong
gateway. ``provider`` overrides that binding and exists for tests.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import (
    BillingProvider,
    BillingProviderError,
    ProviderPayment,
)
from app.connectors.billing.factory import provider_for_record
from app.connectors.billing.registry import (
    ProviderUnavailableError,
    payment_event_predicate,
    registrations,
)
from app.core.config.billing_settings import billing_settings
from app.domain.billing.payments import PaymentReceiptConflictError
from app.domain.billing.service import BillingConflictError
from app.domain.billing.webhooks import (
    _activate_from_event,
    _finish,
    _process_subscription_event,
)
from app.models.billing import BillingWebhookEvent


def _recoverable_pairs() -> list[tuple[str, str]]:
    """(provider, environment) pairs whose receipts may be replayed now."""
    pairs: list[tuple[str, str]] = []
    for registration in registrations().values():
        mode = registration.configured_mode()
        if mode:
            pairs.append((registration.provider, mode))
    return pairs


def _receipt_adapter(
    provider: str, provider_mode: str, override: BillingProvider | None
) -> BillingProvider | None:
    if override is not None:
        return override
    try:
        return provider_for_record(provider, provider_mode)
    except ProviderUnavailableError:
        return None


async def recover_webhook_receipts(
    session: AsyncSession, provider: BillingProvider | None = None
) -> int:
    now = datetime.now(UTC)
    rows = list(
        (
            await session.scalars(
                select(BillingWebhookEvent)
                .where(
                    BillingWebhookEvent.processing_state == "pending",
                    tuple_(
                        BillingWebhookEvent.provider,
                        BillingWebhookEvent.provider_mode,
                    ).in_(_recoverable_pairs()),
                    BillingWebhookEvent.attempt_count
                    < billing_settings.webhook_max_attempts,
                    (BillingWebhookEvent.next_attempt_at.is_(None))
                    | (BillingWebhookEvent.next_attempt_at <= now),
                    (BillingWebhookEvent.lease_expires_at.is_(None))
                    | (BillingWebhookEvent.lease_expires_at <= now),
                )
                .order_by(BillingWebhookEvent.received_at)
                .limit(billing_settings.reconciliation_batch_size)
                .with_for_update(skip_locked=True)
            )
        ).all()
    )
    claims = []
    for row in rows:
        row.lease_token = uuid.uuid4()
        row.lease_expires_at = now + timedelta(
            seconds=billing_settings.webhook_lease_seconds
        )
        row.next_attempt_at = now + timedelta(
            seconds=billing_settings.reconciliation_backoff_base_seconds
        )
        row.attempt_count += 1
        claims.append(
            (
                row.id,
                row.lease_token,
                row.event_type,
                (row.safe_summary or {}).get("reference", ""),
                row.provider,
                row.provider_mode,
            )
        )
    await session.commit()
    for event_id, token, event_type, reference, name, mode in claims:
        adapter = _receipt_adapter(name, mode, provider)
        if adapter is None:
            # Leave the receipt pending rather than replaying it against a
            # provider that did not originate it.
            continue
        await _recover_one(
            session,
            adapter,
            event_id,
            token,
            event_type,
            reference,
            payment_event_predicate(name),
        )
    return len(claims)


async def _recover_one(
    session: AsyncSession,
    provider: BillingProvider,
    event_id: uuid.UUID,
    token: uuid.UUID,
    event_type: str,
    reference: str,
    is_payment: Callable[[str], bool],
) -> None:
    try:
        if not reference:
            event = await _claimed_event(session, event_id, token)
            if event is not None:
                await _finish(session, event, "invalid_reference")
                logging.getLogger("app.billing").warning(
                    "billing.webhook_invalid_reference",
                    extra={"webhook_receipt_id": str(event_id)},
                )
            return
        # Which KIND of record this event names is the originating vendor's
        # own vocabulary, so the question goes to that vendor's adapter.
        record = (
            await provider.fetch_payment(reference)
            if is_payment(event_type)
            else await provider.fetch_subscription(reference)
        )
        event = await _claimed_event(session, event_id, token)
        if event is None:
            await session.rollback()
            return
        if isinstance(record, ProviderPayment):
            result = await _activate_from_event(
                session,
                event=event,
                record=record,
                reference=reference,
                event_id=event.external_event_id,
            )
        else:
            result = await _process_subscription_event(
                session, event=event, record=record, event_id=event.external_event_id
            )
        if result == "unmatched":
            await _finish(session, event, result)
    except (
        BillingProviderError,
        BillingConflictError,
        PaymentReceiptConflictError,
    ) as exc:
        await session.rollback()
        logging.getLogger("app.billing").warning(
            "billing.webhook_recovery_deferred",
            extra={"error_kind": type(exc).__name__},
        )
    finally:
        # Close any read transaction before the next provider request.
        await session.rollback()


async def _claimed_event(
    session: AsyncSession, event_id: uuid.UUID, token: uuid.UUID
) -> BillingWebhookEvent | None:
    return await session.scalar(
        select(BillingWebhookEvent)
        .where(
            BillingWebhookEvent.id == event_id,
            BillingWebhookEvent.lease_token == token,
            BillingWebhookEvent.processing_state == "pending",
            BillingWebhookEvent.lease_expires_at > datetime.now(UTC),
        )
        .with_for_update()
    )
