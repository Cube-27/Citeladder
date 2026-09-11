"""Provider-neutral webhook dedupe and activation dispatch (plan section 3.5).

Authentication and payload translation belong to the SELECTED adapter: it
checks the exact raw bytes with its own configured credentials and returns a
neutral ``WebhookEnvelope``. What lives here is the settlement machinery every
provider shares - the durable receipt, deduplication, leases, bounded retries
and reconciliation handoff - reused once rather than reimplemented per vendor.

Order of operations is security-critical and unchanged: the body-size guard
and the signature check run in the API layer BEFORE any JSON-driven
activation, and ``BillingWebhookEvent`` replay protection runs before any side
effect. Deduplication is keyed by (provider, environment, event id), so a test
event never suppresses a live one and two providers cannot collide on an
equivalent id. A valid but unmatched event is recorded safely and grants
NOTHING.

``payment.captured`` activates a pending top-up only after the amount, the
currency, and the external metadata match that pending intent (the
verification lives in the shared activation transaction, which both this path
and the manual reconciliation sweep call).
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import (
    ProviderPayment,
    ProviderSubscription,
    WebhookAuthenticationError,
    WebhookEnvelope,
)
from app.connectors.billing.registry import (
    ProviderUnavailableError,
    webhook_verifier,
)
from app.core.config.billing_contracts import (
    ACTIVATION_AUTHORITY_WEBHOOK,
    ACTIVATION_PENDING,
)
from app.domain.billing.activations import (
    ActivationRejectedError,
    ProviderRecord,
    activate_pending,
)
from app.domain.billing.payments import PaymentReceiptConflictError
from app.domain.billing.service import apply_subscription_state
from app.models.billing import (
    BillingSubscription,
    BillingWebhookEvent,
    PendingActivation,
)

RESULT_IGNORED = "ignored"
RESULT_DUPLICATE = "duplicate"
RESULT_UNMATCHED = "unmatched"
RESULT_APPLIED = "applied"
RESULT_STALE = "stale"
RESULT_ACTIVATED = "activated"
RESULT_REJECTED = "rejected"


class InvalidWebhookError(ValueError):
    pass


def _safe_summary(reference: str, status: str) -> dict[str, str]:
    """Persist the raw provider reference, its digest and the safe status."""
    return {
        "reference": reference,
        "reference_hash": hashlib.sha256(reference.encode()).hexdigest(),
        "status": status,
    }


async def _record_event(
    session: AsyncSession,
    *,
    envelope: WebhookEnvelope,
    raw_body: bytes,
    summary: dict[str, str],
) -> BillingWebhookEvent | None:
    """Insert the replay-protection row; None when it is a duplicate.

    The key is (provider, environment, event id): duplicate delivery grants
    once, and an equivalent id arriving from a different provider or a
    different environment is a DIFFERENT event, not a duplicate.
    """
    inserted_id = await session.scalar(
        pg_insert(BillingWebhookEvent)
        .values(
            provider=envelope.provider,
            provider_mode=envelope.provider_mode,
            external_event_id=envelope.event_id,
            event_type=envelope.event_type,
            payload_sha256=hashlib.sha256(raw_body).hexdigest(),
            safe_summary=summary,
        )
        .on_conflict_do_nothing(
            index_elements=["provider", "provider_mode", "external_event_id"]
        )
        .returning(BillingWebhookEvent.id)
    )
    if inserted_id is None:
        await session.rollback()
        existing = await session.scalar(
            select(BillingWebhookEvent).where(
                BillingWebhookEvent.provider == envelope.provider,
                BillingWebhookEvent.provider_mode == envelope.provider_mode,
                BillingWebhookEvent.external_event_id == envelope.event_id,
            )
        )
        digest = hashlib.sha256(raw_body).hexdigest()
        if existing is not None and existing.payload_sha256 != digest:
            existing.processing_state = "quarantined"
            existing.error_code = "event_id_digest_conflict"
            await session.commit()
            raise InvalidWebhookError("event_id_digest_conflict")
        return None
    event = await session.get(BillingWebhookEvent, inserted_id)
    if event is None:  # pragma: no cover
        raise RuntimeError("inserted webhook event could not be loaded")
    return event


async def _finish(
    session: AsyncSession, event: BillingWebhookEvent, result_code: str
) -> str:
    event.result_code = result_code
    event.processing_state = "completed"
    event.processed_at = datetime.now(UTC)
    await session.commit()
    return result_code


async def _pending_for_reference(
    session: AsyncSession, event: BillingWebhookEvent, reference: str
) -> PendingActivation | None:
    """The UNSETTLED intent this event belongs to, in ITS provider/environment.

    The identity comes from the PERSISTED receipt row, so a replay from the
    durable-recovery sweep resolves exactly the same way the live delivery
    did — never through whichever provider is currently the checkout default.
    """
    return await session.scalar(
        select(PendingActivation).where(
            PendingActivation.provider == event.provider,
            PendingActivation.provider_mode == event.provider_mode,
            PendingActivation.external_reference == reference,
            PendingActivation.status == ACTIVATION_PENDING,
        )
    )


async def _activate_from_event(
    session: AsyncSession,
    *,
    event: BillingWebhookEvent,
    record: ProviderRecord,
    reference: str,
    event_id: str,
) -> str:
    """Settle the matching pending activation through the SHARED transaction."""
    pending = await _pending_for_reference(session, event, reference)
    if pending is None:
        return RESULT_UNMATCHED
    pending_id = pending.id
    event_row_id = event.id
    try:
        await activate_pending(
            session,
            pending_id=pending_id,
            provider_record=record,
            authority=ACTIVATION_AUTHORITY_WEBHOOK,
            authority_id=event_id,
            at=datetime.now(UTC),
        )
    except (ActivationRejectedError, PaymentReceiptConflictError):
        # A valid but unverifiable event grants NOTHING and is recorded safely.
        await session.rollback()
        refreshed = await session.get(BillingWebhookEvent, event_row_id)
        if refreshed is not None:
            await _finish(session, refreshed, RESULT_REJECTED)
        return RESULT_REJECTED
    refreshed = await session.get(BillingWebhookEvent, event_row_id)
    if refreshed is not None:
        await _finish(session, refreshed, RESULT_ACTIVATED)
    return RESULT_ACTIVATED


async def _process_subscription_event(
    session: AsyncSession,
    *,
    event: BillingWebhookEvent,
    record: ProviderSubscription,
    event_id: str,
) -> str:
    """Project one subscription event onto ITS originating subscription."""
    subscription = await session.scalar(
        select(BillingSubscription)
        .where(
            BillingSubscription.provider == event.provider,
            BillingSubscription.provider_mode == event.provider_mode,
            BillingSubscription.external_subscription_id
            == record.external_subscription_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if subscription is None:
        return await _activate_from_event(
            session,
            event=event,
            record=record,
            reference=record.external_subscription_id,
            event_id=event_id,
        )
    if subscription.provider_mode != record.provider_mode:
        return await _finish(session, event, RESULT_REJECTED)
    if record.payment is not None:
        from app.domain.billing.subscription_payments import record_subscription_payment

        pending = await session.scalar(
            select(PendingActivation).where(
                PendingActivation.external_reference == record.external_subscription_id,
                PendingActivation.billing_account_id == subscription.billing_account_id,
                PendingActivation.provider_mode == record.provider_mode,
            )
        )
        if pending is not None:
            await record_subscription_payment(
                session, pending=pending, subscription=subscription, record=record
            )
    applied = await apply_subscription_state(
        session,
        subscription,
        provider_status=record.status,
        current_start=record.current_start,
        current_end=record.current_end,
        updated_at=record.updated_at,
        cancel_at_period_end=record.cancel_at_period_end,
    )
    return await _finish(session, event, RESULT_APPLIED if applied else RESULT_STALE)


def authenticate_webhook(
    provider: str, *, raw_body: bytes, headers: Mapping[str, str]
) -> WebhookEnvelope:
    """Authenticate and translate one delivery with ITS provider's adapter.

    An unknown or unconfigured provider, an invalid signature, and a body the
    adapter cannot translate all raise before any side effect. None of them
    ever grants access, and none of them falls through to another provider.
    """
    try:
        verifier = webhook_verifier(provider)
    except ProviderUnavailableError as exc:
        raise InvalidWebhookError(exc.code) from exc
    try:
        event_id = verifier.authenticate(raw_body, headers)
        return verifier.parse(raw_body, event_id=event_id)
    except WebhookAuthenticationError as exc:
        raise InvalidWebhookError(exc.code) from exc
    except ValueError as exc:
        raise InvalidWebhookError(str(exc) or "invalid_payload") from exc


async def process_webhook_envelope(
    session: AsyncSession, envelope: WebhookEnvelope, *, raw_body: bytes
) -> str:
    """Dedupe and record ONE already-authenticated delivery.

    Nothing here trusts a body-supplied amount, currency or environment: the
    envelope's ``provider_mode`` came from server configuration, and the
    amount/currency/period checks live in the shared activation transaction.
    """
    record = envelope.record
    if record is None:
        return RESULT_IGNORED
    reference = (
        record.external_payment_id
        if isinstance(record, ProviderPayment)
        else record.external_subscription_id
    )
    event = await _record_event(
        session,
        envelope=envelope,
        raw_body=raw_body,
        summary=_safe_summary(reference, record.status),
    )
    if event is None:
        return RESULT_DUPLICATE
    # COMMIT the replay-protection boundary before dispatch: a rejected
    # activation rolls back its own side effects and must never take the
    # received-event row down with it.
    await session.commit()
    return "queued"


__all__ = [
    "InvalidWebhookError",
    "authenticate_webhook",
    "process_webhook_envelope",
]
