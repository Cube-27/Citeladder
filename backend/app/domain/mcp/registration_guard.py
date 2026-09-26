"""Abuse controls in front of anonymous RFC 7591 client registration.

Registration stays open: an MCP client registers before any CiteLadder login
exists, so session authentication here would break every standard client. What
it must not be is unbounded. Each registration POST consumes per-client-IP
burst and window budgets and a global budget in the shared PostgreSQL
counters, committed before the SDK handler reads the body. The dispatcher
applies the tighter body cap; metadata semantics stay with the OAuth provider.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import Scope

from app.core.config.abuse import abuse_settings
from app.core.database import SessionLocal
from app.core.http_security import trusted_client_identity
from app.domain.abuse.service import UsageLimitExceededError, consume_usage

_GLOBAL_SUBJECT = "mcp.register"


class McpRegistrationGuard:
    """Meter registration POSTs; CORS preflight passes through unmetered."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] = SessionLocal,
    ) -> None:
        self._session_factory = session_factory

    async def admit(self, scope: Scope) -> Response | None:
        """Return the refusal that ends the request, or None to proceed."""
        if scope.get("method") != "POST":
            return None
        retry_after = await self._consume(trusted_client_identity(Request(scope)))
        return None if retry_after is None else _too_many_registrations(retry_after)

    async def _consume(self, client: str) -> int | None:
        """Charge every budget atomically; return Retry-After when refused.

        Client budgets are charged before the global one and the set rolls
        back together, so a source already over its own limit cannot drain the
        global budget that other clients still depend on.
        """
        budgets = (
            (
                "client",
                client,
                "mcp.register.burst",
                abuse_settings.mcp_register_burst_limit,
                abuse_settings.mcp_register_burst_window_seconds,
            ),
            (
                "client",
                client,
                "mcp.register.client",
                abuse_settings.mcp_register_client_limit,
                abuse_settings.mcp_register_client_window_seconds,
            ),
            (
                "global",
                _GLOBAL_SUBJECT,
                "mcp.register.global",
                abuse_settings.mcp_register_global_limit,
                abuse_settings.mcp_register_global_window_seconds,
            ),
        )
        async with self._session_factory() as session:
            try:
                for subject_kind, subject, operation, limit, window in budgets:
                    await consume_usage(
                        session,
                        subject_kind=subject_kind,
                        subject=subject,
                        operation=operation,
                        limit=limit,
                        window_seconds=window,
                    )
            except UsageLimitExceededError as exc:
                await session.rollback()
                return exc.retry_after_seconds
            await session.commit()
        return None


def _too_many_registrations(retry_after: int) -> JSONResponse:
    # The SDK's CORS wrapper sits inside this guard, so the refusal carries the
    # same open CORS header itself; a browser-hosted client then sees the 429
    # rather than an opaque network error.
    return JSONResponse(
        {
            "error": "temporarily_unavailable",
            "error_description": "Too many client registrations; retry later",
        },
        status_code=429,
        headers={
            "Retry-After": str(retry_after),
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
        },
    )
