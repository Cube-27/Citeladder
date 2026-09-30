"""The role matrix as the remaining Python-owned routes enforce it.

Workspace management and billing moved to the TypeScript API, but provider
credentials still authorize through ``app.api.deps``. A permitted role must
reach the endpoint's real success status: "not 403" would also accept a 500.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.workspaces.policy import (
    WORKSPACE_ROLE_ADMIN,
    WORKSPACE_ROLE_MEMBER,
    WORKSPACE_ROLE_OWNER,
    WORKSPACE_ROLE_VIEWER,
)
from app.models.user import User
from app.models.workspace import WorkspaceMember
from tests.component.auth_helpers import register_and_login, workspace_ids_for_session

_ROLES = [
    (WORKSPACE_ROLE_OWNER, True),
    (WORKSPACE_ROLE_ADMIN, True),
    (WORKSPACE_ROLE_MEMBER, False),
    (WORKSPACE_ROLE_VIEWER, False),
]


async def _session_with_role(
    client: httpx.AsyncClient, db_session: AsyncSession, role: str
) -> uuid.UUID:
    """Sign in as ``role`` inside a fresh owner's workspace; return its id."""
    await register_and_login(client, f"gate-owner-{uuid.uuid4().hex}@example.com")
    (workspace_id,) = await workspace_ids_for_session(client)
    if role != WORKSPACE_ROLE_OWNER:
        client.cookies.delete(settings.session_cookie_name)
        email = f"gate-{role}-{uuid.uuid4().hex}@example.com"
        await register_and_login(client, email)
        user_id = await db_session.scalar(select(User.id).where(User.email == email))
        db_session.add(
            WorkspaceMember(
                workspace_id=uuid.UUID(workspace_id), user_id=user_id, role=role
            )
        )
        await db_session.commit()
    return uuid.UUID(workspace_id)


@pytest.mark.asyncio
@pytest.mark.parametrize(("role", "permitted"), _ROLES)
async def test_provider_credentials_stay_administrative(
    client: httpx.AsyncClient, db_session: AsyncSession, role: str, permitted: bool
) -> None:
    workspace_id = await _session_with_role(client, db_session, role)
    response = await client.post(
        "/api/v1/provider-connections",
        json={"transport_provider": "openai", "api_key": "sk-role-test"},
        headers={"X-Workspace-Id": str(workspace_id)},
    )
    assert response.status_code == (201 if permitted else 403), response.text
