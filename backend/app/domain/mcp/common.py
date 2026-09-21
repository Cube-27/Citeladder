"""Shared authorization, cursor, and evidence-reference helpers."""

from __future__ import annotations

import base64
import json
import uuid
from typing import Any

from mcp.server.auth.middleware.auth_context import get_access_token
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

# The reads that describe a project as a whole. ``performance.read_table`` is
# deliberately absent: it is a paged drill-down into one dimension, and a
# context resource that carried a page of it would be answering a question the
# caller has not asked yet.
_CONTEXT_TOOLS = (
    "site.read_snapshot",
    "demand.read_snapshot",
    "opportunities.read_ranked",
    "audits.read_latest",
    "performance.read_snapshot",
    "referrals.read_snapshot",
    "integrations.read_status",
)


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


def current_user_id() -> uuid.UUID:
    token = get_access_token()
    if token is None or not token.subject:
        raise PermissionError("An authenticated CiteLadder account is required")
    try:
        return uuid.UUID(token.subject)
    except ValueError as exc:
        raise PermissionError("The MCP grant has an invalid account identity") from exc


def _caller_is_member_of(workspace_column: Any) -> Any:
    """The predicate authorizing the caller to read rows in a workspace.

    Every read below is workspace-scoped, and each one used to spell its own
    ``WorkspaceMember`` join out inline. Six of the seven omitted
    ``Workspace.is_system``, so MCP was the one reader where a stray
    system-workspace membership row would have authorized — while
    ``list_account_projects``, which did filter it, hid the same project. Two
    halves of one boundary disagreeing is the shape of bug that never shows up
    in tests.

    Stated once here, mirroring ``get_membership`` (T11: system workspaces
    cannot have memberships, so even a stray row stays inert). An EXISTS
    subquery rather than a join, so adding it can neither duplicate rows for a
    caller holding several memberships nor collide with a query's own joins —
    it drops into any ``where`` unchanged.

    The role filter comes from the ONE workspace policy
    (``app.domain.workspaces.policy``), not from a list spelled here: MCP is a
    separate entry point into the same data, and §2.3 of the account-management
    plan requires it to reuse the policy rather than define a second matrix.
    Every MCP tool is read-only, so the set is ``roles_with(READ)`` — but a row
    carrying an unrecognised role authorizes nothing, and if a future role
    loses READ it loses MCP with it, in one edit.
    """
    return (
        select(WorkspaceMember.id)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.workspace_id == workspace_column,
            WorkspaceMember.user_id == current_user_id(),
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
