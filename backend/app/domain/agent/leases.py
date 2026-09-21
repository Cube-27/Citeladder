"""Fenced renewal for a live Growth Agent run."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import default_agent_settings
from app.models.agent import AgentTaskRun


async def lock_owned_lease(
    session: AsyncSession, *, run_id: uuid.UUID, owner: str
) -> AgentTaskRun | None:
    """Fence a write against cancellation, expiry, and another worker's claim."""
    now = datetime.now(UTC)
    row = await session.scalar(
        select(AgentTaskRun)
        .where(AgentTaskRun.id == run_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        row is None
        or row.status != "running"
        or row.lease_owner != owner
        or row.lease_expires_at is None
        or row.lease_expires_at <= now
    ):
        await session.rollback()
        return None
    return row


async def renew_lease(session: AsyncSession, *, run_id: uuid.UUID, owner: str) -> bool:
    row = await lock_owned_lease(session, run_id=run_id, owner=owner)
    if row is None:
        return False
    now = datetime.now(UTC)
    row.heartbeat_at = now
    row.lease_expires_at = now + timedelta(
        seconds=(
            default_agent_settings.execution_timeout_seconds
            + default_agent_settings.lease_margin_seconds
        )
    )
    await session.commit()
    return True
