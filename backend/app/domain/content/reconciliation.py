"""Idempotent financial closure for Content's terminal and lost-dispatch paths."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.app_models import APP_FEATURE_CONTENT
from app.core.config.content import content_settings
from app.core.config.task_queue import TASK_TERMINAL_STATUSES, ReclaimAccounting
from app.domain.billing.catalog_revisions import (
    CatalogUnavailableError,
    ai_credit_policy_for_revision,
)
from app.domain.entitlements.ledger import release_unused_reservation
from app.domain.entitlements.metered import settle_metered_usage
from app.models.content import ContentGeneration, ContentGenerationAttempt


async def settle_platform_attempt(
    session: AsyncSession,
    *,
    row: ContentGeneration,
    attempt: ContentGenerationAttempt,
    usage: dict | None,
    now: datetime,
) -> None:
    if row.funding_source != "platform" or row.reservation_id is None:
        attempt.settlement_status = "zero_debit"
        return
    rate = None
    if row.policy_revision:
        try:
            policy = await ai_credit_policy_for_revision(session, row.policy_revision)
        except CatalogUnavailableError:
            pass
        else:
            rate = policy.rate(feature=APP_FEATURE_CONTENT, model=row.requested_model)
    # If a historical rate is unavailable, close the dispatched hold against
    # its admitted finite cap rather than leaving it pending indefinitely.
    settlement = await settle_metered_usage(
        session,
        reservation_id=row.reservation_id,
        dispatch_key=str(attempt.dispatch_id),
        attempt=attempt.attempt_number,
        charged_units=rate.charge(usage or {}) if rate is not None else None,
        unknown_usage_charge=(
            rate.unknown_usage_charge
            if rate is not None
            else attempt.hold_units or row.customer_charge_cap or 0
        ),
        idempotency_key=f"content:{row.id}:settle",
        at=now,
    )
    attempt.settled_units = settlement.charged_units
    attempt.absorbed_units = settlement.absorbed_units
    attempt.settlement_status = "settled" if rate is not None else "unknown_policy"


async def reconcile_generation_reservation(
    session: AsyncSession,
    *,
    row: ContentGeneration,
    now: datetime,
    release_without_dispatch: bool = True,
) -> bool:
    """Close a terminal hold or an expired dispatch while its generation is locked.

    Returns whether a durable dispatch already consumed the attempt number.
    A live cancelled call is left to its worker until its bounded call deadline.
    """
    attempt = await session.scalar(
        select(ContentGenerationAttempt)
        .where(
            ContentGenerationAttempt.content_generation_id == row.id,
            ContentGenerationAttempt.status == "dispatched",
        )
        .order_by(ContentGenerationAttempt.attempt_number.desc())
        .with_for_update()
    )
    if attempt is not None:
        if row.status == "cancelled":
            if attempt.usage_hold_expires_at is None:
                attempt.usage_hold_expires_at = max(
                    now,
                    attempt.dispatched_at
                    + timedelta(
                        seconds=(
                            content_settings.request_timeout_seconds
                            + content_settings.lease_ttl_seconds
                        )
                    ),
                )
            if attempt.usage_hold_expires_at > now:
                return True
        attempt.status = "unknown_result"
        attempt.error_code = "worker_lost_after_dispatch"
        attempt.completed_at = now
        attempt.usage_completeness = "unknown"
        await settle_platform_attempt(
            session, row=row, attempt=attempt, usage=None, now=now
        )
        return True
    if (
        release_without_dispatch
        and row.funding_source == "platform"
        and row.reservation_id is not None
    ):
        await release_unused_reservation(
            session,
            reservation_id=row.reservation_id,
            idempotency_key=f"content:{row.id}:never-dispatched",
            at=now,
        )
    return False


async def content_reclaim_accounting(
    session: AsyncSession, row: ContentGeneration, now: datetime
) -> ReclaimAccounting:
    already_counted = await reconcile_generation_reservation(
        session,
        row=row,
        now=now,
        release_without_dispatch=row.status in TASK_TERMINAL_STATUSES,
    )
    return ReclaimAccounting(
        already_counted=already_counted,
        terminalize=already_counted and row.funding_source == "platform",
    )


async def reconcile_stale_cancelled_dispatches(
    session_factory: async_sessionmaker[AsyncSession], *, batch_size: int = 100
) -> None:
    """Recover cancelled calls whose worker never returned a final receipt."""
    now = datetime.now(UTC)
    legacy_deadline = now - timedelta(
        seconds=(
            content_settings.request_timeout_seconds
            + content_settings.lease_ttl_seconds
        )
    )
    async with session_factory() as session:
        ids = list(
            (
                await session.scalars(
                    select(ContentGenerationAttempt.content_generation_id)
                    .join(
                        ContentGeneration,
                        ContentGeneration.id
                        == ContentGenerationAttempt.content_generation_id,
                    )
                    .where(
                        ContentGeneration.status == "cancelled",
                        ContentGenerationAttempt.status == "dispatched",
                        or_(
                            ContentGenerationAttempt.usage_hold_expires_at <= now,
                            and_(
                                ContentGenerationAttempt.usage_hold_expires_at.is_(
                                    None
                                ),
                                ContentGenerationAttempt.dispatched_at
                                <= legacy_deadline,
                            ),
                        ),
                    )
                    .limit(batch_size)
                )
            ).all()
        )
        await session.rollback()
    for generation_id in dict.fromkeys(ids):
        async with session_factory() as session:
            row = await session.get(
                ContentGeneration, generation_id, with_for_update=True
            )
            if row is not None and row.status == "cancelled":
                await reconcile_generation_reservation(session, row=row, now=now)
            await session.commit()
