"""Shared authorization, cursor, and evidence-reference helpers."""

from __future__ import annotations

import base64
import json
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.mcp import (
    MCP_DEFAULT_LIST_LIMIT,
    MCP_MAX_LIST_LIMIT,
)
from app.domain.workspaces.policy import WorkspaceCapability, roles_with
from app.models.project import Project
from app.models.workspace import Workspace, WorkspaceMember

# Every MCP tool is a READ. Resolved from the shared policy at import time so
# the MCP surface and the HTTP API can never disagree about who may read.
_MCP_READER_ROLES = roles_with(WorkspaceCapability.READ)


def _limit(value: int | None) -> int:
    if value is None:
        return MCP_DEFAULT_LIST_LIMIT
    if isinstance(value, bool) or value < 1 or value > MCP_MAX_LIST_LIMIT:
        raise ValueError(f"limit must be between 1 and {MCP_MAX_LIST_LIMIT}")
    return value


def _cursor_encode(*parts: object) -> str:
    raw = json.dumps([str(part) for part in parts], separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _cursor_decode(value: str, size: int) -> list[str]:
    try:
        padded = value + "=" * (-len(value) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(padded).decode())
        if not isinstance(decoded, list) or len(decoded) != size:
            raise ValueError
        return [str(part) for part in decoded]
    except (ValueError, TypeError) as exc:
        raise ValueError("cursor is invalid") from exc


_FETCHABLE_KINDS = {
    "project",
    "prompt",
    "opportunity",
    "site_snapshot",
    "site_crawl",
    "site_page",
    "site_issue",
    "site_link",
    "demand_snapshot",
    "query_snapshot",
    "query_row",
    "audit",
    "visibility_result",
    "citation",
    "earned_source_snapshot",
    "traffic_snapshot",
    "search_run",
    "search_dataset",
    "search_row",
}


def _reference(kind: str, row_id: object) -> dict[str, Any]:
    identifier = str(row_id)
    retrievable = kind in _FETCHABLE_KINDS
    return {
        "kind": kind,
        "id": identifier,
        "record_uri": f"citeladder://{kind}/{identifier}" if retrievable else None,
        "retrievable": retrievable,
        "reason": None if retrievable else "raw_record_not_exposed",
    }


def _normalize_refs(value: dict[str, Any]) -> dict[str, Any]:
    refs = value.get("artifact_refs")
    if isinstance(refs, list):
        value["artifact_refs"] = [
            _reference(str(ref.get("kind", "")), ref.get("id", ""))
            if isinstance(ref, dict)
            else ref
            for ref in refs
        ]
    return value


# The in-app agent reads through these same tools as the chat's member. There
# is no MCP bearer token in a worker, so the runtime binds the member here for
# the duration of one tool call. It is set only by server-side code; nothing an
# HTTP or MCP caller sends can reach it. Every read still runs the same
# membership and role predicate below, so a removed member reads nothing.
_IN_APP_READER: ContextVar[uuid.UUID | None] = ContextVar(
    "citeladder_in_app_reader", default=None
)


@contextmanager
def read_as_member(user_id: uuid.UUID) -> Iterator[None]:
    """Authorize the tool reads inside this block as ``user_id``."""
    token = _IN_APP_READER.set(user_id)
    try:
        yield
    finally:
        _IN_APP_READER.reset(token)


def current_user_id() -> uuid.UUID:
    in_app_reader = _IN_APP_READER.get()
    if in_app_reader is not None:
        return in_app_reader
    raise PermissionError("An authenticated CiteLadder account is required")


def _caller_is_member_of(workspace_column: Any) -> Any:
    """The predicate authorizing the caller to read rows in a workspace.

    Retained for the Python Agent until PR 19. Hosted MCP reads are owned by
    TypeScript. EXISTS preserves the caller's query cardinality.
    """
    user_id = current_user_id()
    return (
        select(WorkspaceMember.id)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.workspace_id == workspace_column,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.role.in_(_MCP_READER_ROLES),
            Workspace.is_system.is_(False),
        )
        .exists()
    )


async def _authorized_project(session: AsyncSession, project_id: str) -> Project:
    try:
        parsed_id = uuid.UUID(project_id)
    except ValueError as exc:
        raise ValueError("project_id must be a UUID") from exc
    row = await session.scalar(
        select(Project).where(
            Project.id == parsed_id,
            _caller_is_member_of(Project.workspace_id),
        )
    )
    if row is None:
        raise LookupError("Project was not found in this account")
    return row
