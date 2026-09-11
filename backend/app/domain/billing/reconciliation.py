"""Bounded, idempotent reconciliation of pending commercial activations.

Without this, ONE missed webhook leaves a paying customer with no grants and no
recovery path. The sweep claims a bounded batch of pending rows with
``FOR UPDATE SKIP LOCKED``, COMMITS the claim/read boundary before any network
I/O (invariant 8), fetches the provider's own authoritative record, and calls
the SAME ``activate_pending`` transaction the webhook uses — so a late webhook
racing a manual sweep produces exactly one subscription row and one grant
bundle.

Outcomes: an authoritative failed state marks the row failed; no provider
record after the abandon window marks it abandoned; an unknown or retryable
state leaves it pending for the next sweep.

This module holds ALL the logic so it is unit-testable; ``scripts/
reconcile_billing.py`` is a thin one-shot CLI over it. There is deliberately no
scheduler and no worker loop.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import (
    BillingProvider,
    BillingProviderError,
    ProviderPayment,
)
from app.connectors.billing.registry import (
    adapter_for_record,
    configured_pairs,
    status_normalizer,
)
from app.core.config.billing_contracts import (
    ACTIVATION_ABANDONED,
    ACTIVATION_ACTIVATED,
    ACTIVATION_AUTHORITY_RECONCILIATION,
    ACTIVATION_FAILED,
    ACTIVATION_KIND_TOPUP,
    ACTIVATION_PENDING,
    PAYMENT_FAILED,
    PAYMENT_PAID,
    REASON_ACTIVATION_EXPIRED,
    SUBSCRIPTION_ACTIVE,
    SUBSCRIPTION_CANCEL_SCHEDULED,
    SUBSCRIPTION_CANCELLED,
    SUBSCRIPTION_EXPIRED,
)
from app.core.config.billing_settings import (
    billing_settings,
)
from app.domain.billing.activations import (
    ActivationRejectedError,
    ProviderRecord,
    activate_pending,
)
from app.domain.billing.payments import PaymentReceiptConflictError
from app.models.billing import PendingActivation

logger = logging.getLogger("app.billing")

SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]

_TERMINAL_PROVIDER_STATES = frozenset({PAYMENT_FAILED})
_TERMINAL_SUBSCRIPTION_STATES = frozenset(
    {SUBSCRIPTION_CANCELLED, SUBSCRIPTION_EXPIRED}
)
_SETTLEABLE_SUBSCRIPTION_STATES = frozenset(
    {SUBSCRIPTION_ACTIVE, SUBSCRIPTION_CANCEL_SCHEDULED}
)


@dataclass(frozen=True, slots=True)
class ReconciliationSummary:
    """SAFE counts only — no account id, provider id, amount, or message."""

    claimed: int = 0
    activated: int = 0
    failed: int = 0
    abandoned: int = 0
    still_pending: int = 0
    errors: int = 0

    def merge(self, other: ReconciliationSummary) -> ReconciliationSummary:
        return ReconciliationSummary(
            claimed=self.claimed + other.claimed,
            activated=self.activated + other.activated,
            failed=self.failed + other.failed,
            abandoned=self.abandoned + other.abandoned,
            still_pending=self.still_pending + other.still_pending,
            errors=self.errors + other.errors,
        )

    def as_counts(self) -> dict[str, int]:
        return {
            "claimed": self.claimed,
            "activated": self.activated,
            "failed": self.failed,
            "abandoned": self.abandoned,
            "still_pending": self.still_pending,
            "errors": self.errors,
        }


@dataclass(frozen=True, slots=True)
class _Claim:
    """The safe fields a claimed row contributes to the provider read.

    ``provider``/``provider_mode`` are the row's ORIGINATING pair, frozen when
    the intent was committed. The sweep reads them back rather than consulting
    the current new-checkout default, so switching that default never sends an
    existing obligation to a different provider (plan section 3.3).
    """

    pending_id: uuid.UUID
    account_id: uuid.UUID
    lease_token: uuid.UUID
    activation_kind: str
    external_reference: str
    provider: str
    provider_mode: str
    created_at: datetime
    attempt: int


async def _claim_batch(
    session: AsyncSession, *, now: datetime, stale_after: timedelta, batch_size: int
) -> tuple[_Claim, ...]:
    """Claim a bounded batch with SKIP LOCKED and COMMIT the read boundary."""
    rows = (
        (
            await session.execute(
                select(PendingActivation)
                .where(
                    PendingActivation.status == ACTIVATION_PENDING,
                    # Only rows whose originating provider is still registered
                    # AND still configured in the SAME environment. A row left
                    # behind by a provider that has been switched off is not
                    # reconciled against somebody else's API.
                    tuple_(
                        PendingActivation.provider, PendingActivation.provider_mode
                    ).in_(configured_pairs()),
                    (PendingActivation.created_at <= now - stale_after)
                    | (PendingActivation.reconciliation_next_at <= now),
                    (PendingActivation.reconciliation_next_at.is_(None))
                    | (PendingActivation.reconciliation_next_at <= now),
                    (PendingActivation.reconciliation_lease_expires_at.is_(None))
                    | (PendingActivation.reconciliation_lease_expires_at <= now),
                    PendingActivation.reconciliation_attempts
                    < billing_settings.reconciliation_max_attempts,
                )
                .order_by(PendingActivation.created_at)
                .limit(batch_size)
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    claims_list: list[_Claim] = []
    for row in rows:
        token = uuid.uuid4()
        row.reconciliation_attempts += 1
        row.reconciliation_lease_token = token
        row.reconciliation_lease_expires_at = now + timedelta(
            seconds=billing_settings.reconciliation_lease_seconds
        )
        row.reconciliation_next_at = now + timedelta(
            seconds=billing_settings.reconciliation_backoff_base_seconds
            * 2 ** min(row.reconciliation_attempts - 1, 10)
        )
        claims_list.append(
            _Claim(
                pending_id=row.id,
                account_id=row.billing_account_id,
                lease_token=token,
                activation_kind=row.activation_kind,
                external_reference=row.external_reference or "",
                provider=row.provider,
                provider_mode=row.provider_mode,
                created_at=row.created_at,
                attempt=row.reconciliation_attempts,
            )
        )
    claims = tuple(claims_list)
    # Never hold a transaction across provider I/O (invariant 8).
    await session.commit()
    return claims


async def _fetch_provider_record(
    provider: BillingProvider, claim: _Claim
) -> ProviderRecord | None:
    """The provider's authoritative record, or None when it has none."""
    if not claim.external_reference:
        if claim.activation_kind == ACTIVATION_KIND_TOPUP:
            return None
        return await provider.find_subscription(
            str(claim.pending_id), str(claim.account_id)
        )
    if claim.activation_kind == ACTIVATION_KIND_TOPUP:
        return await provider.fetch_payment(claim.external_reference)
    return await provider.fetch_subscription(claim.external_reference)


async def _lock_owned_claim(session: AsyncSession, claim: _Claim) -> bool:
    owned = await session.scalar(
        select(PendingActivation.id)
        .where(
            PendingActivation.id == claim.pending_id,
            PendingActivation.status == ACTIVATION_PENDING,
            PendingActivation.reconciliation_lease_token == claim.lease_token,
            PendingActivation.reconciliation_lease_expires_at > datetime.now(UTC),
        )
        .with_for_update()
    )
    return owned is not None


def _authoritative_status(record: ProviderRecord, provider: str) -> str:
    """Neutral status of a provider record: activated | failed | pending.

    Payment status already arrives in the neutral vocabulary (the adapter
    translates it when it builds the DTO). Subscription status does not, so it
    is translated by the ORIGINATING provider's own map — never by whichever
    vendor happens to be the new-checkout default.
    """
    if isinstance(record, ProviderPayment):
        if record.status == PAYMENT_PAID:
            return ACTIVATION_ACTIVATED
        if record.status in _TERMINAL_PROVIDER_STATES:
            return ACTIVATION_FAILED
        return ACTIVATION_PENDING
    normalized = status_normalizer(provider)(record.status)
    if normalized in _SETTLEABLE_SUBSCRIPTION_STATES:
        return ACTIVATION_ACTIVATED
    if normalized in _TERMINAL_SUBSCRIPTION_STATES:
        return ACTIVATION_FAILED
    return ACTIVATION_PENDING


async def _mark_terminal(
    session: AsyncSession,
    pending_id: uuid.UUID,
    *,
    status: str,
    failure_code: str | None,
    now: datetime,
) -> None:
    pending = await session.scalar(
        select(PendingActivation)
        .where(
            PendingActivation.id == pending_id,
            PendingActivation.status == ACTIVATION_PENDING,
        )
        .with_for_update()
    )
    if pending is None:
        return
    pending.status = status
    pending.failed_at = now
    pending.failure_code = failure_code
    pending.checkout_url = None
    await session.commit()


async def _bind_creation_outcome(
    session: AsyncSession, claim: _Claim, record: ProviderRecord
) -> bool:
    """Bind an ambiguous creation only after its exact frozen identity matches."""
    if claim.external_reference or isinstance(record, ProviderPayment):
        return True
    pending = await session.get(PendingActivation, claim.pending_id)
    if pending is None:
        return False
    if (
        record.intent_id,
        record.account_ref,
        record.catalog_revision,
        record.price_ref,
        record.provider_mode,
    ) != (
        str(pending.id),
        str(pending.billing_account_id),
        pending.catalog_revision,
        pending.external_price_id,
        pending.provider_mode,
    ):
        return False
    pending.external_reference = record.external_subscription_id
    return True


async def _provider_failure(
    session: AsyncSession, claim: _Claim, error: BillingProviderError, now: datetime
) -> ReconciliationSummary | None:
    """Apply the lease-bound retry/exhaustion policy for a failed provider read."""
    if not error.retryable:
        return None
    if not await _lock_owned_claim(session, claim):
        await session.rollback()
        return ReconciliationSummary(claimed=1, still_pending=1)
    if claim.attempt >= billing_settings.reconciliation_max_attempts:
        await _mark_terminal(
            session,
            claim.pending_id,
            status=ACTIVATION_ABANDONED,
            failure_code="reconciliation_attempts_exhausted",
            now=now,
        )
        return ReconciliationSummary(claimed=1, abandoned=1)
    await session.rollback()
    return ReconciliationSummary(claimed=1, still_pending=1)


async def _settle_absent_record(
    session: AsyncSession,
    claim: _Claim,
    *,
    now: datetime,
    abandon_after: timedelta,
) -> ReconciliationSummary:
    """The provider has no record of this intent.

    Abandon it once it has had long enough to appear; until then it stays
    pending, because "not there yet" and "never existed" look identical from
    here and only time tells them apart.
    """
    if claim.created_at <= now - abandon_after:
        await _mark_terminal(
            session,
            claim.pending_id,
            status=ACTIVATION_ABANDONED,
            failure_code=REASON_ACTIVATION_EXPIRED,
            now=now,
        )
        return ReconciliationSummary(claimed=1, abandoned=1)
    return ReconciliationSummary(claimed=1, still_pending=1)


async def _settle_claim(
    session: AsyncSession,
    provider: BillingProvider | None,
    claim: _Claim,
    *,
    now: datetime,
    abandon_after: timedelta,
) -> ReconciliationSummary:
    """Settle ONE claimed row from its ORIGINATING provider's record."""
    adapter = provider or adapter_for_record(claim.provider, claim.provider_mode)
    if adapter is None:
        # The originating provider is no longer usable. Leave the row pending
        # for a later sweep rather than retrying it against another provider.
        await session.rollback()
        return ReconciliationSummary(claimed=1, still_pending=1)
    try:
        record = await _fetch_provider_record(adapter, claim)
    except BillingProviderError as exc:
        failure = await _provider_failure(session, claim, exc, now)
        if failure is not None:
            return failure
        record = None
    if not await _lock_owned_claim(session, claim):
        await session.rollback()
        return ReconciliationSummary(claimed=1, still_pending=1)
    if record is None:
        return await _settle_absent_record(
            session, claim, now=now, abandon_after=abandon_after
        )
    if not await _bind_creation_outcome(session, claim, record):
        return ReconciliationSummary(claimed=1, errors=1)
    status = _authoritative_status(record, claim.provider)
    if status == ACTIVATION_FAILED:
        await _mark_terminal(
            session,
            claim.pending_id,
            status=ACTIVATION_FAILED,
            failure_code=record.status,
            now=now,
        )
        return ReconciliationSummary(claimed=1, failed=1)
    if status != ACTIVATION_ACTIVATED:
        return ReconciliationSummary(claimed=1, still_pending=1)
    try:
        result = await activate_pending(
            session,
            pending_id=claim.pending_id,
            provider_record=record,
            authority=ACTIVATION_AUTHORITY_RECONCILIATION,
            authority_id=str(claim.pending_id),
            at=now,
        )
    except (ActivationRejectedError, PaymentReceiptConflictError) as exc:
        await session.rollback()
        logger.info(
            "billing.reconciliation_rejected activation_id=%s reason=%s",
            claim.pending_id,
            exc,
        )
        return ReconciliationSummary(claimed=1, errors=1)
    if result.already_settled:
        return ReconciliationSummary(claimed=1, still_pending=0, activated=0)
    return ReconciliationSummary(claimed=1, activated=1)


async def reconcile_pending_activations(
    session_factory: SessionFactory,
    provider: BillingProvider | None = None,
    *,
    now: datetime,
    batch_size: int | None = None,
    stale_after: timedelta | None = None,
    abandon_after: timedelta | None = None,
) -> ReconciliationSummary:
    """One BOUNDED, idempotent sweep over stale pending activations.

    Every window and bound comes from config (invariant 1). One session is used
    for the claim boundary and each settlement, and every settlement goes
    through the same ``activate_pending`` transaction the webhook uses.

    Each row is settled against the provider and environment PERSISTED on it.
    An uncertain creation is therefore never retried against a different
    provider: the only adapter this sweep will use for a row is the one that
    created it. ``provider`` overrides that binding and exists for tests.
    """
    limit = batch_size or billing_settings.reconciliation_batch_size
    stale = stale_after or timedelta(
        seconds=billing_settings.reconciliation_stale_after_seconds
    )
    abandon = abandon_after or timedelta(
        seconds=billing_settings.reconciliation_abandon_after_seconds
    )
    summary = ReconciliationSummary()
    async with session_factory() as session:
        claims = await _claim_batch(
            session, now=now, stale_after=stale, batch_size=limit
        )
        for claim in claims:
            summary = summary.merge(
                await _settle_claim(
                    session, provider, claim, now=now, abandon_after=abandon
                )
            )
            # Persist an identified but not-yet-paid subscription so Checkout
            # can reopen it; close the transaction before the next provider I/O.
            await session.commit()
    return summary


__all__ = [
    "ReconciliationSummary",
    "reconcile_pending_activations",
]
