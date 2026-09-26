"""Connection projections and revocation under existing workspace authorization."""

import uuid
from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.security_events import record_security_event
from app.models.mcp import McpOAuthClient, McpOAuthGrant


class ConnectionView(BaseModel):
    id: uuid.UUID
    client_name: str
    workspace_ids: list[uuid.UUID]
    created_at: datetime
    requires_consent: bool


async def list_connections(
    session: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
) -> list[ConnectionView]:
    query = (
        select(McpOAuthGrant, McpOAuthClient.client_metadata)
        .join(McpOAuthClient, McpOAuthClient.client_id == McpOAuthGrant.client_id)
        .where(
            McpOAuthGrant.revoked_at.is_(None),
            McpOAuthGrant.refresh_expires_at > datetime.now(UTC),
        )
    )
    if workspace_id is not None:
        query = query.where(McpOAuthGrant.workspace_ids.contains([str(workspace_id)]))
    else:
        query = query.where(McpOAuthGrant.user_id == user_id)
    rows = await session.execute(query.order_by(McpOAuthGrant.created_at.desc()))
    return [
        ConnectionView(
            id=row.id,
            client_name=str(metadata.get("client_name") or "MCP client")[:255],
            workspace_ids=[workspace_id] if workspace_id else row.workspace_ids,
            created_at=row.created_at,
            requires_consent=not row.workspace_ids,
        )
        for row, metadata in rows
    ]


async def revoke_connection(
    session: AsyncSession,
    *,
    grant_id: uuid.UUID,
    actor_id: uuid.UUID,
    workspace_id: uuid.UUID | None = None,
) -> bool:
    query = select(McpOAuthGrant).where(McpOAuthGrant.id == grant_id)
    if workspace_id is None:
        query = query.where(McpOAuthGrant.user_id == actor_id)
    else:
        query = query.where(McpOAuthGrant.workspace_ids.contains([str(workspace_id)]))
    row = await session.scalar(query.with_for_update())
    if row is None:
        return False
    if workspace_id is None:
        row.revoked_at = row.revoked_at or datetime.now(UTC)
    else:
        row.workspace_ids = [
            item for item in row.workspace_ids if item != str(workspace_id)
        ]
    record_security_event(
        session,
        event="mcp.workspace_revoke" if workspace_id else "mcp.revoke",
        actor_id=actor_id,
        workspace_id=workspace_id,
        target_id=row.id,
    )
    await session.commit()
    return True
