"""One bounded event writer; no arbitrary payload, tokens, emails or bodies."""

import uuid
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security_event import SecurityEvent

SecurityEventKind = Literal[
    "auth.login",
    "auth.google_login",
    "auth.logout",
    "mcp.consent",
    "mcp.revoke",
    "mcp.workspace_revoke",
    "policy.accept",
    "policy.enterprise_reference",
    "acquisition.control",
    "membership.role",
    "membership.remove",
    "membership.leave",
    "membership.transfer",
    "membership.join",
    "credential.create",
    "credential.update",
    "credential.delete",
]


def record_security_event(
    session: AsyncSession,
    *,
    event: SecurityEventKind,
    actor_id: uuid.UUID | None,
    workspace_id: uuid.UUID | None = None,
    target_id: uuid.UUID | None = None,
) -> None:
    """Append within the caller's transaction; failure must not be silently ignored."""
    session.add(
        SecurityEvent(
            event=event,
            actor_id=actor_id,
            workspace_id=workspace_id,
            target_id=target_id,
        )
    )
