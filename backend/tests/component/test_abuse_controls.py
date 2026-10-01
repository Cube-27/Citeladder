"""Durable abuse budgets, active-job caps, and tenant-fair audit claims."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.abuse.service import UsageLimitExceededError, consume_usage


@pytest.mark.asyncio
async def test_usage_counter_is_atomic_within_same_window_across_api_sessions(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Concurrent consumers of ONE window never exceed its limit.

    ``now`` is pinned because this test is about database concurrency, not
    about clock-boundary semantics. ``_window`` buckets on epoch-aligned
    boundaries, so with a 3600s window the boundary is the top of each hour;
    letting each of the twelve attempts read its own clock made the assertion
    boundary-sensitive, because attempts landing either side of that instant
    write to two different windows -- two rows, five each. Those semantics are
    pinned deliberately by
    ``test_fixed_window_admits_the_limit_again_after_a_boundary``.
    """
    now = datetime(2026, 1, 1, 12, 30, tzinfo=UTC)

    async def attempt() -> bool:
        async with session_factory() as session:
            try:
                await consume_usage(
                    session,
                    subject_kind="workspace",
                    subject="shared-workspace",
                    operation="expensive.operation",
                    limit=5,
                    window_seconds=3600,
                    now=now,
                )
            except UsageLimitExceededError:
                await session.rollback()
                return False
            await session.commit()
            return True

    results = await asyncio.gather(*(attempt() for _ in range(12)))
    assert sum(results) == 5


@pytest.mark.asyncio
async def test_fixed_window_admits_the_limit_again_after_a_boundary(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """`consume_usage` is a FIXED-window quota, and this pins what that means.

    `_window` buckets on epoch-aligned boundaries, so each window admits the
    limit independently and a burst straddling a boundary can consume up to
    twice it. That is a property of fixed windows, not a defect here, but it
    is a real property of every limit built on this primitive -- so it is
    asserted rather than left to be rediscovered as a bug.

    Anything needing "never more than N in ANY rolling interval" needs a
    continuous limiter instead; this primitive does not provide it.
    """
    before = datetime(2026, 1, 1, 12, 59, 59, 950000, tzinfo=UTC)
    after = datetime(2026, 1, 1, 13, 0, 0, 50000, tzinfo=UTC)

    async def attempt(now: datetime) -> bool:
        async with session_factory() as session:
            try:
                await consume_usage(
                    session,
                    subject_kind="workspace",
                    subject="boundary-semantics",
                    operation="expensive.operation",
                    limit=5,
                    window_seconds=3600,
                    now=now,
                )
            except UsageLimitExceededError:
                await session.rollback()
                return False
            await session.commit()
            return True

    admitted = await asyncio.gather(
        *(attempt(before) for _ in range(6)),
        *(attempt(after) for _ in range(6)),
    )

    # Five per window, not five overall: 100ms apart, twice the limit.
    assert sum(admitted) == 10


@pytest.mark.asyncio
async def test_usage_counter_rejects_first_consumption_above_limit(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        with pytest.raises(UsageLimitExceededError):
            await consume_usage(
                session,
                subject_kind="workspace",
                subject="oversized-first-consumption",
                operation="expensive.operation",
                limit=5,
                window_seconds=3600,
                amount=6,
            )
        await session.rollback()

        consumed = await consume_usage(
            session,
            subject_kind="workspace",
            subject="oversized-first-consumption",
            operation="expensive.operation",
            limit=5,
            window_seconds=3600,
            amount=5,
        )
        assert consumed == 5
