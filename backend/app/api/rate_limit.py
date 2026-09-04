"""Shared abuse-control helpers for the unauthenticated auth surfaces.

Owned here rather than in one router because password login, registration,
and third-party sign-in all meter the same subjects against the same durable
Postgres counters (``app.domain.abuse``). Limits themselves stay
config-owned in ``app.core.config.abuse`` (invariant 1).
"""

from __future__ import annotations

import ipaddress

from fastapi import Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings, trusted_proxy_networks
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


def trusted_client_identity(request: Request) -> str:
    """Recover the first untrusted hop only when the direct peer is trusted."""
    peer = request.client.host if request.client is not None else "unavailable"
    try:
        peer_ip = ipaddress.ip_address(peer)
        trusted = trusted_proxy_networks(settings.trusted_proxy_cidrs)
    except ValueError:
        return peer
    if not trusted or not any(peer_ip in network for network in trusted):
        return peer

    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer
    for value in reversed(forwarded.split(",")):
        try:
            candidate = ipaddress.ip_address(value.strip())
        except ValueError:
            return peer
        if not any(candidate in network for network in trusted):
            return candidate.compressed
    return peer
