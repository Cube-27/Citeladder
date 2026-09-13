"""Shared database boundary for long-lived streaming responses."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession


async def release_request_transaction(session: AsyncSession) -> None:
    """Return a read-only request transaction before a stream starts.

    FastAPI keeps yielded dependencies alive until a ``StreamingResponse``
    finishes. Authorization reads therefore need an explicit boundary or the
    request session can hold an idle database transaction for the entire SSE
    lifetime. Callers must capture primitive authorization results first and
    must not use ``session`` again after this function returns.
    """
    if session.in_transaction():
        await session.rollback()
