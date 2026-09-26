"""Persist explicit consent for MCP projection fixtures."""

import uuid
from datetime import UTC, datetime, timedelta

from mcp.server.auth.provider import AccessToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.mcp import MCP_READ_SCOPE
from app.domain.mcp.oauth_provider import resource_url
from app.models.mcp import McpOAuthClient, McpOAuthGrant
from app.models.workspace import WorkspaceMember


async def read_grant(
    session: AsyncSession, user_id: uuid.UUID, workspace_ids: list[str] | None = None
) -> AccessToken:
    if workspace_ids is None:
        workspace_ids = [
            str(value)
            for value in await session.scalars(
                select(WorkspaceMember.workspace_id).where(
                    WorkspaceMember.user_id == user_id
                )
            )
        ]
    client_id = str(uuid.uuid4())
    session.add(
        McpOAuthClient(
            client_id=client_id, client_metadata={"client_name": "Test client"}
        )
    )
    await session.flush()
    row = McpOAuthGrant(
        client_id=client_id,
        user_id=user_id,
        workspace_ids=workspace_ids,
        access_token_hash=uuid.uuid4().hex,
        refresh_token_hash=uuid.uuid4().hex,
        scopes=[MCP_READ_SCOPE],
        resource=resource_url(),
        access_expires_at=datetime.now(UTC) + timedelta(hours=1),
        refresh_expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    session.add(row)
    await session.commit()
    return AccessToken(
        token="test",
        client_id=client_id,
        subject=str(user_id),
        scopes=[MCP_READ_SCOPE],
        resource=resource_url(),
        claims={"grant_id": str(row.id), "token_hash": row.access_token_hash},
    )
