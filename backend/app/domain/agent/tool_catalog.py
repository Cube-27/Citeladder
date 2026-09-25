"""The Agent's read-tool catalog: the MCP tool definitions, bound in-app.

The agent reads through exactly the tools MCP registers, collected from the
one shared registration and bound to the runtime's session factory, so the app
and MCP can never advertise different reads. Differences are deliberate and
listed here: the chat is pinned to one project, so ``project_id`` is injected
rather than chosen and ``list_projects`` is not offered; the Action and
content-differentiation reads are agent-only until exposing them to MCP is
decided separately.

Every call runs as the chat's member through the same membership predicate MCP
uses (``read_as_member``), so a member who lost access reads nothing.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import typing
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Final

from pydantic import BaseModel, ConfigDict, ValidationError, create_model
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import (
    AGENT_DIFFERENTIATION_REPORT_LIMIT,
    AGENT_TOOL_RESULT_MAX_CHARS,
)
from app.domain.content_differentiation import list_content_differentiation_reports
from app.domain.mcp.common import _authorized_project, read_as_member
from app.domain.mcp.tool_registrations import register_evidence_tools
from app.domain.opportunities import actions as action_owner
from app.domain.opportunities.errors import (
    InvalidCursorError,
    OpportunityNotFoundError,
)

AGENT_TOOL_REGISTRY_VERSION: Final = "agent-tools-2"
# The project is fixed by the chat; enumerating others is out of scope.
_MCP_TOOLS_NOT_OFFERED: Final = frozenset({"list_projects"})
_PINNED_ARGUMENT: Final = "project_id"

SessionFactory = Callable[[], AsyncSession]


class ToolRefusedError(ValueError):
    """The requested call is not permitted in this chat (bad tool or arguments)."""


@dataclass(frozen=True)
class AgentTool:
    name: str
    title: str
    description: str
    arguments: type[BaseModel]
    handler: Callable[..., Awaitable[Any]]
    pinned: bool

    def schema(self) -> dict[str, Any]:
        return self.arguments.model_json_schema()


@dataclass(frozen=True)
class ToolOutcome:
    """One executed read, ready to record and to show the model."""

    payload: dict[str, Any]
    unavailable: bool
    artifact_refs: list[dict[str, Any]]
    omissions: list[Any]
    output_hash: str
    model_text: str


def _arguments_model(
    name: str, handler: Callable[..., Any]
) -> tuple[type[BaseModel], bool]:
    hints = typing.get_type_hints(handler)
    fields: dict[str, Any] = {}
    pinned = False
    for parameter in inspect.signature(handler).parameters.values():
        if parameter.name == _PINNED_ARGUMENT:
            pinned = True
            continue
        default = (
            ... if parameter.default is inspect.Parameter.empty else parameter.default
        )
        fields[parameter.name] = (hints[parameter.name], default)
    model = create_model(
        f"{name}_arguments",
        __config__=ConfigDict(extra="forbid"),
        **fields,
    )
    return model, pinned


def build_agent_tools(session_factory: SessionFactory) -> dict[str, AgentTool]:
    """Collect the shared read tools, plus the agent-only Action reads."""
    collected: dict[str, AgentTool] = {}

    def collector(
        name: str, title: str, description: str
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(handler: Callable[..., Any]) -> Callable[..., Any]:
            if name not in _MCP_TOOLS_NOT_OFFERED:
                arguments, pinned = _arguments_model(name, handler)
                collected[name] = AgentTool(
                    name=name,
                    title=title,
                    description=description,
                    arguments=arguments,
                    handler=handler,
                    pinned=pinned,
                )
            return handler

        return decorator

    register_evidence_tools(collector, session_factory)
    _register_action_tools(collector, session_factory)
    _register_differentiation_tool(collector, session_factory)
    return collected


def _register_differentiation_tool(
    collector: Callable[
        [str, str, str], Callable[[Callable[..., Any]], Callable[..., Any]]
    ],
    session_factory: SessionFactory,
) -> None:
    @collector(
        "list_content_differentiation",
        "List content differentiation reports",
        "List the latest persisted reports comparing one owned page with the "
        "inspected organic results for a prompt: heading-topic, table and "
        "outbound-source parity, gaps and contributions unique within the "
        "inspected set. Every figure carries its inspected-page denominator; an "
        "uninspected page is not evidence of absence.",
    )
    async def list_content_differentiation(project_id: str) -> dict[str, Any]:
        async with session_factory() as session:
            project = await _authorized_project(session, project_id)
            rows = await list_content_differentiation_reports(
                session,
                workspace_id=project.workspace_id,
                project_id=project.id,
                limit=AGENT_DIFFERENTIATION_REPORT_LIMIT,
            )
            return {
                "state": "available" if rows else "unavailable",
                "reason": None if rows else "no_differentiation_reports",
                "items": [
                    _jsonable(
                        {
                            "id": row.id,
                            "audit_id": row.audit_id,
                            "audit_task_id": row.audit_task_id,
                            "owned_site_url_id": row.owned_site_url_id,
                            "formula_version": row.formula_version,
                            "report": row.report or {},
                            "created_at": row.created_at,
                        }
                    )
                    for row in rows
                ],
            }


def _register_action_tools(
    collector: Callable[
        [str, str, str], Callable[[Callable[..., Any]], Callable[..., Any]]
    ],
    session_factory: SessionFactory,
) -> None:
    @collector(
        "list_actions",
        "List current Actions",
        "List the project's current Actions (one per target) by descending "
        "priority, with convergence across evidence families and the approach "
        "the deterministic diagnosis selected.",
    )
    async def list_actions(
        project_id: str, cursor: str | None = None, limit: int | None = None
    ) -> dict[str, Any]:
        async with session_factory() as session:
            project = await _authorized_project(session, project_id)
            rows, next_cursor = await action_owner.list_actions(
                session,
                workspace_id=project.workspace_id,
                project_id=project.id,
                limit=limit,
                cursor=cursor,
            )
            return {
                "state": "available" if rows else "unavailable",
                "reason": None if rows else "no_actions",
                "items": [
                    _jsonable(action_owner.action_projection(row, status))
                    for row, status in rows
                ],
                "next_cursor": next_cursor,
            }

    @collector(
        "get_action",
        "Read one Action",
        "Read one Action's deterministic diagnosis and its member Opportunities "
        "with their persisted evidence references.",
    )
    async def get_action(project_id: str, action_id: str) -> dict[str, Any]:
        async with session_factory() as session:
            project = await _authorized_project(session, project_id)
            action, status, members = await action_owner.get_action(
                session,
                workspace_id=project.workspace_id,
                action_id=uuid.UUID(action_id),
            )
            if action.project_id != project.id:
                raise LookupError("Action was not found in this project")
            return {
                "state": "available",
                "action": _jsonable(action_owner.action_projection(action, status)),
                "diagnosis": action.diagnosis or {},
                "members": [
                    {
                        "id": str(member.id),
                        "rule_id": member.rule_id,
                        "title": member.title,
                        "target_url": member.target_url,
                        "priority_score": member.priority_score,
                        "evidence": member.evidence or {},
                    }
                    for member in members
                ],
            }


async def execute_tool(
    tool: AgentTool,
    *,
    project_id: uuid.UUID,
    member_user_id: uuid.UUID,
    arguments: dict[str, Any],
) -> ToolOutcome:
    """Validate, run as the member on the pinned project, and bound the result."""
    if _PINNED_ARGUMENT in arguments:
        raise ToolRefusedError("project_id is fixed by the chat and cannot be chosen")
    try:
        validated = tool.arguments.model_validate(arguments)
    except ValidationError as exc:
        raise ToolRefusedError(
            f"invalid arguments for {tool.name}: {exc.errors()}"
        ) from exc
    call_arguments = validated.model_dump()
    if tool.pinned:
        call_arguments[_PINNED_ARGUMENT] = str(project_id)
    with read_as_member(member_user_id):
        try:
            result = await tool.handler(**call_arguments)
        except (OpportunityNotFoundError, InvalidCursorError) as exc:
            raise LookupError(str(exc)) from exc
    payload = _jsonable(result)
    if tool.name == "fetch" and not _same_project(payload, project_id):
        # ``fetch`` resolves any record the member can read; the chat is
        # scoped to one project, so a record from another one is refused.
        raise ToolRefusedError("that record belongs to a different project")
    return _outcome(payload)


def _same_project(payload: dict[str, Any], project_id: uuid.UUID) -> bool:
    metadata = payload.get("metadata") if isinstance(payload, dict) else None
    owner = metadata.get("project_id") if isinstance(metadata, dict) else None
    return owner is None or str(owner) == str(project_id)


def _outcome(payload: dict[str, Any]) -> ToolOutcome:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    text = json.dumps(payload, ensure_ascii=False, default=str)
    if len(text) > AGENT_TOOL_RESULT_MAX_CHARS:
        text = (
            text[:AGENT_TOOL_RESULT_MAX_CHARS]
            + "… [truncated: this result was cut to its size bound; page with a "
            "cursor or narrow the filters, and do not treat missing rows as absent]"
        )
    refs = payload.get("artifact_refs") if isinstance(payload, dict) else None
    omissions = payload.get("omissions") if isinstance(payload, dict) else None
    return ToolOutcome(
        payload=payload,
        unavailable=isinstance(payload, dict) and payload.get("state") == "unavailable",
        artifact_refs=list(refs) if isinstance(refs, list) else [],
        omissions=list(omissions) if isinstance(omissions, list) else [],
        output_hash=hashlib.sha256(encoded.encode("utf-8")).hexdigest(),
        model_text=text,
    )


def _jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    return json.loads(json.dumps(value, default=str))


def catalog_for_model(tools: dict[str, AgentTool]) -> list[dict[str, Any]]:
    """The tool descriptions and argument schemas the model is shown."""
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "arguments": tool.schema(),
        }
        for tool in tools.values()
    ]
