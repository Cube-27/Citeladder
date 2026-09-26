"""Same-origin account and workspace MCP connection management."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_current_user,
    get_db,
    require_workspace_members_admin,
)
from app.core.http_errors import raise_not_found
from app.domain.mcp.connections import (
    ConnectionView,
    list_connections,
    revoke_connection,
)
from app.models.user import User

router = APIRouter(tags=["mcp-connections"])
Session = Annotated[AsyncSession, Depends(get_db)]
Account = Annotated[User, Depends(get_current_user)]
Admin = Annotated[WorkspaceContext, Depends(require_workspace_members_admin)]


@router.get("/mcp/connections")
async def own_connections(user: Account, session: Session) -> list[ConnectionView]:
    return await list_connections(session, user_id=user.id)


@router.delete("/mcp/connections/{grant_id}", status_code=204)
async def revoke_own_connection(
    grant_id: uuid.UUID, user: Account, session: Session
) -> Response:
    if not await revoke_connection(session, grant_id=grant_id, actor_id=user.id):
        raise_not_found("Connection")
    return Response(status_code=204)


@router.get("/workspaces/{workspace_id}/mcp/connections")
async def workspace_connections(
    workspace_id: uuid.UUID, context: Admin, session: Session
) -> list[ConnectionView]:
    return await list_connections(session, workspace_id=workspace_id)


@router.delete("/workspaces/{workspace_id}/mcp/connections/{grant_id}", status_code=204)
async def revoke_workspace_connection(
    workspace_id: uuid.UUID, grant_id: uuid.UUID, context: Admin, session: Session
) -> Response:
    if not await revoke_connection(
        session, grant_id=grant_id, actor_id=context.user.id, workspace_id=workspace_id
    ):
        raise_not_found("Connection")
    return Response(status_code=204)
