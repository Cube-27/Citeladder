"""Atomic PostgreSQL-backed rate and usage limits."""

from __future__ import annotations

import hashlib
import math
import uuid
from collections.abc import Collection
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.abuse import UsageWindow


class UsageLimitExceededError(RuntimeError):
    """The subject has exhausted an operation's current usage window."""

    def __init__(self, *, operation: str, retry_after_seconds: int) -> None:
        super().__init__(f"Rate limit exceeded for {operation}")
        self.operation = operation
        self.retry_after_seconds = max(1, retry_after_seconds)


def opaque_subject(value: str | uuid.UUID) -> str:
    """Hash identifiers so normalized emails never persist in counter rows."""
    normalized = str(value).strip().casefold()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _window(now: datetime, seconds: int) -> tuple[datetime, datetime]:
    epoch = int(now.timestamp())
    started_epoch = epoch - (epoch % seconds)
    started = datetime.fromtimestamp(started_epoch, tz=UTC)
    return started, started + timedelta(seconds=seconds)


async def lock_subject(
    session: AsyncSession, *, namespace: str, subject: str | uuid.UUID
) -> None:
    """Serialize short quota/enqueue transactions for one tenant."""
    digest = hashlib.sha256(f"{namespace}:{subject}".encode()).digest()[:8]
    key = int.from_bytes(digest, byteorder="big", signed=True)
    await session.execute(select(func.pg_advisory_xact_lock(key)))


async def reserve_workspace_capacity(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    lock_namespace: str,
    model: type[Any],
    active_statuses: Collection[str],
    active_limit: int,
    active_operation: str,
    usage_operation: str,
    usage_limit: int,
    amount: int = 1,
    usage_window_seconds: int = 86_400,
    retry_after_seconds: int,
) -> None:
    """Atomically reserve one workspace's active and windowed capacity."""
    await lock_subject(session, namespace=lock_namespace, subject=workspace_id)
    active_count = await session.scalar(
        select(func.count())
        .select_from(model)
        .where(
            model.workspace_id == workspace_id,
            model.status.in_(tuple(active_statuses)),
        )
    )
    if int(active_count or 0) >= active_limit:
        raise UsageLimitExceededError(
            operation=active_operation,
            retry_after_seconds=retry_after_seconds,
        )
    await consume_usage(
        session,
        subject_kind="workspace",
        subject=workspace_id,
        operation=usage_operation,
        limit=usage_limit,
        window_seconds=usage_window_seconds,
        amount=amount,
    )


async def consume_usage(
    session: AsyncSession,
    *,
    subject_kind: str,
    subject: str | uuid.UUID,
    operation: str,
    limit: int,
    window_seconds: int,
    amount: int = 1,
    now: datetime | None = None,
) -> int:
    """Atomically consume ``amount`` and return the new window total.

    The caller owns the transaction. A rejected update raises without changing
    the counter; callers that need failed attempts recorded should commit each
    independent limiter before beginning the expensive operation.
    """
    if limit < 1 or window_seconds < 1 or amount < 1:
        raise ValueError("usage limit, window, and amount must be positive")
    current = now or datetime.now(UTC)
    started, expires = _window(current, window_seconds)
    if amount > limit:
        retry_after = math.ceil((expires - current).total_seconds())
        raise UsageLimitExceededError(
            operation=operation, retry_after_seconds=retry_after
        )
    insert_stmt = insert(UsageWindow).values(
        id=uuid.uuid4(),
        subject_kind=subject_kind,
        subject_hash=opaque_subject(subject),
        operation=operation,
        window_started_at=started,
        expires_at=expires,
        count=amount,
        created_at=current,
        updated_at=current,
    )
    consume_stmt = insert_stmt.on_conflict_do_update(
        constraint="uq_usage_window_subject_operation_start",
        set_={
            "count": UsageWindow.count + amount,
            "updated_at": current,
        },
        where=(UsageWindow.count + amount <= limit),
    ).returning(UsageWindow.count)
    consumed = await session.scalar(consume_stmt)
    if consumed is None:
        retry_after = math.ceil((expires - current).total_seconds())
        raise UsageLimitExceededError(
            operation=operation, retry_after_seconds=retry_after
        )
    return int(consumed)


async def enforce_and_commit(
    session: AsyncSession,
    *,
    subject_kind: str,
    subject: str | uuid.UUID,
    operation: str,
    limit: int,
    window_seconds: int,
    amount: int = 1,
) -> int:
    """Consume a request limit in its own durable transaction."""
    try:
        consumed = await consume_usage(
            session,
            subject_kind=subject_kind,
            subject=subject,
            operation=operation,
            limit=limit,
            window_seconds=window_seconds,
            amount=amount,
        )
    except UsageLimitExceededError:
        await session.rollback()
        raise
    await session.commit()
    return consumed
