"""Worker adapter for the shared integration OAuth refresh coordinator."""

from __future__ import annotations

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.integrations.oauth import IntegrationOAuthError
from app.core.config.integrations_contracts import ERROR_GRANT_AUTH_FAILED
from app.domain.integrations.tokens import fresh_access_token as resolve_token
from app.models.integrations import IntegrationOAuthGrant
from app.workers.integration.paging import RunContext


async def fresh_access_token(
    ctx: RunContext,
    *,
    session_factory: async_sessionmaker[AsyncSession],
    transport: httpx.AsyncBaseTransport | None,
) -> str:
    async with session_factory() as session:
        grant = await session.get(IntegrationOAuthGrant, ctx.grant_id)
        if grant is None:
            raise IntegrationOAuthError(
                "grant row is missing", error_code=ERROR_GRANT_AUTH_FAILED
            )
        return await resolve_token(session, grant=grant, transport=transport)
