"""Append-only evidence helpers for Search Intelligence Live dispatches."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.answer_engines.errors import ProviderError
from app.models.search_intelligence import (
    SearchIntelligenceCall,
    SearchIntelligenceDispatchAttempt,
)


async def next_dispatch_ordinal(
    session: AsyncSession, call: SearchIntelligenceCall
) -> int:
    count = await session.scalar(
        select(func.count(SearchIntelligenceDispatchAttempt.id)).where(
            SearchIntelligenceDispatchAttempt.call_id == call.id,
            SearchIntelligenceDispatchAttempt.workspace_id == call.workspace_id,
            SearchIntelligenceDispatchAttempt.project_id == call.project_id,
            SearchIntelligenceDispatchAttempt.phase == "dispatch",
        )
    )
    return (count or 0) + 1


async def latest_dispatch_attempt(
    session: AsyncSession, call: SearchIntelligenceCall
) -> SearchIntelligenceDispatchAttempt | None:
    return await session.scalar(
        select(SearchIntelligenceDispatchAttempt)
        .where(
            SearchIntelligenceDispatchAttempt.call_id == call.id,
            SearchIntelligenceDispatchAttempt.workspace_id == call.workspace_id,
            SearchIntelligenceDispatchAttempt.project_id == call.project_id,
            SearchIntelligenceDispatchAttempt.phase == "dispatch",
        )
        .order_by(SearchIntelligenceDispatchAttempt.ordinal.desc())
        .limit(1)
    )


def record_dispatch_outcome(
    session: AsyncSession,
    attempt: SearchIntelligenceDispatchAttempt,
    status: str,
    error: ProviderError | None = None,
) -> None:
    session.add(
        SearchIntelligenceDispatchAttempt(
            workspace_id=attempt.workspace_id,
            project_id=attempt.project_id,
            call_id=attempt.call_id,
            ordinal=attempt.ordinal,
            phase="outcome",
            status=status,
            error_code=error.error_code if error else "",
            retry_after_seconds=error.retry_after_seconds if error else None,
            dispatched_at=attempt.dispatched_at,
            completed_at=datetime.now(UTC),
        )
    )
