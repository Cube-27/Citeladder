"""Shared abuse-control helpers for the unauthenticated auth surfaces.

Owned here rather than in one router because password login, registration,
and third-party sign-in all meter the same subjects against the same durable
Postgres counters (``app.domain.abuse``). Limits themselves stay
config-owned in ``app.core.config.abuse`` (invariant 1).
"""

from __future__ import annotations

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.http_errors import raise_api_error
from app.domain.abuse.service import UsageLimitExceededError, enforce_and_commit


async def enforce_limit(
    session: AsyncSession,
    *,
    subject_kind: str,
    subject: str,
    operation: str,
    limit: int,
    window: int,
) -> None:
    """Consume one unit of a metered budget, or 429 with ``Retry-After``."""
    try:
        await enforce_and_commit(
            session,
            subject_kind=subject_kind,
            subject=subject,
            operation=operation,
            limit=limit,
            window_seconds=window,
        )
    except UsageLimitExceededError as exc:
        raise_api_error(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many requests",
            headers={"Retry-After": str(exc.retry_after_seconds)},
            cause=exc,
        )
