"""Execution of one claimed agent run: a bounded tool-use loop.

The loop is fixed by the run's frozen budget. Each step is one funded model
call that selects a skill, calls one read tool, or responds. Tool results are
recorded append-only and shown back to the model as untrusted evidence. A
response is finalized in one fenced transaction: the agent's reply, the output
revision (and the Action it attaches to), and the run's terminal state. No
transaction is held across a provider or tool call (invariant 15), and nothing
here writes outside the chat, its output and the Action attach.
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.agent.gateway import ModelGateway
from app.connectors.app_model_config import AppModelRouteConfig
from app.core.config.agent import (
    AGENT_HISTORY_MAX_MESSAGES,
    ERROR_OUTPUT_CONFLICT,
    ERROR_PROTOCOL,
    ERROR_ROUTE_CHANGED,
    ERROR_STOPPED_AT_LIMIT,
    ERROR_TOOL,
    MESSAGE_ROLE_AGENT,
    SKILL_SOURCE_CHAT,
    SKILL_SOURCE_MODEL,
    TOOL_ATTEMPT_COMPLETED,
    TOOL_ATTEMPT_FAILED,
    TOOL_ATTEMPT_REFUSED,
    TOOL_ATTEMPT_UNAVAILABLE,
)
from app.core.config.agent_skills import AGENT_SKILL_REGISTRY, AgentSkill
from app.core.config.app_models import APP_FEATURE_AGENT
from app.core.config.task_queue import TASK_STATUS_FAILED, TASK_STATUS_SUCCEEDED
from app.domain.agent.context import render_manifest
from app.domain.agent.model_calls import (
    FUNDING_CUSTOMER_BYOK,
    ModelUnavailableError,
    call_model,
    lock_owned_run,
    member_may_run,
)
from app.domain.agent.outputs import (
    OutputError,
    has_approved_outline,
    latest_revision,
    output_for_chat,
    save_agent_output,
)
from app.domain.agent.prompting import (
    STEP_SCHEMA_NAME,
    ProtocolError,
    StepResponse,
    TurnState,
    admissible_phase,
    bound_reply,
    outline_required,
    parse_step,
    step_schema,
    strip_unverified_refs,
    system_text,
    user_text,
)
from app.domain.agent.tool_catalog import (
    AGENT_TOOL_REGISTRY_VERSION,
    AgentTool,
    ToolRefusedError,
    catalog_for_model,
    execute_tool,
)
from app.domain.providers.app_routes import (
    AppModelRouteUnavailableError,
    resolve_app_model_route,
)
from app.models.agent import (
    AgentChat,
    AgentMessage,
    AgentOutput,
    AgentRun,
    AgentToolAttempt,
)

# A model that keeps breaking the protocol is stopped rather than paid for.
_MAX_PROTOCOL_ERRORS = 2

GatewayFactory = Callable[[AppModelRouteConfig | None], ModelGateway]


@dataclass(frozen=True)
class RuntimeDeps:
    session_factory: async_sessionmaker[AsyncSession]
    tools: dict[str, AgentTool]
    gateway_for: GatewayFactory


@dataclass
class _Turn:
    run_id: uuid.UUID
    chat_id: uuid.UUID
    workspace_id: uuid.UUID
    project_id: uuid.UUID
    member_id: uuid.UUID
    run_attempt: int
    mode: str
    budget: dict[str, int]
    skill: AgentSkill | None
    skill_source: str | None
    format_id: str | None
    state: TurnState
    seen_refs: set[str]
    steps_summary: list[dict[str, Any]]
    tool_calls: int = 0


class RunFailedError(RuntimeError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def _admitted_route(
    session: AsyncSession, run: AgentRun
) -> AppModelRouteConfig | None:
    """Re-resolve the exact customer route frozen at admission, or None."""
    if run.funding_source != FUNDING_CUSTOMER_BYOK:
        return None
    try:
        route = await resolve_app_model_route(
            session,
            workspace_id=run.workspace_id,
            feature=APP_FEATURE_AGENT,
            at=_utcnow(),
        )
    except AppModelRouteUnavailableError as exc:
        raise RunFailedError(
            ERROR_ROUTE_CHANGED, "The customer model route is unavailable."
        ) from exc
    frozen = (
        run.route_id,
        run.connection_id,
        run.route_revision,
        run.credential_revision,
    )
    current = (
        route.route_id,
        route.connection_id,
        route.route_revision,
        route.credential_revision,
    )
    if frozen != current:
        raise RunFailedError(
            ERROR_ROUTE_CHANGED, "The customer model route changed after admission."
        )
    return route


async def _chat_and_request(
    session: AsyncSession, run: AgentRun
) -> tuple[AgentChat, AgentMessage]:
    chat = await session.get(AgentChat, run.chat_id)
    request = await session.get(AgentMessage, run.user_message_id)
    if chat is None or request is None or chat.workspace_id != run.workspace_id:
        raise RunFailedError(ERROR_PROTOCOL, "The chat for this run no longer exists.")
    return chat, request


async def _history(
    session: AsyncSession, *, chat: AgentChat, request: AgentMessage
) -> list[tuple[str, str]]:
    """The bounded message history before this turn, oldest first."""
    rows = (
        await session.scalars(
            select(AgentMessage)
            .where(
                AgentMessage.chat_id == chat.id,
                AgentMessage.sequence < request.sequence,
            )
            .order_by(AgentMessage.sequence.desc())
            .limit(AGENT_HISTORY_MAX_MESSAGES)
        )
    ).all()
    return [(row.role, row.content) for row in reversed(rows)]


async def _current_output(
    session: AsyncSession, output: AgentOutput | None
) -> dict[str, Any] | None:
    revision = await latest_revision(session, output=output) if output else None
    if output is None or revision is None:
        return None
    return {
        "number": revision.number,
        "phase": revision.phase,
        "title": revision.title,
        "body": revision.body,
        "outline_approved": await has_approved_outline(session, output=output),
    }


def _resumed_skill(
    run: AgentRun, output: AgentOutput | None
) -> tuple[AgentSkill | None, str | None]:
    """The run's requested skill, else the one the chat's output already used."""
    if run.requested_skill_id:
        skill = AGENT_SKILL_REGISTRY.get(run.requested_skill_id)
        return skill, run.requested_skill_source
    skill = AGENT_SKILL_REGISTRY.get(output.skill_id or "") if output else None
    return skill, (SKILL_SOURCE_CHAT if skill else None)


async def _load_turn(session: AsyncSession, run: AgentRun) -> _Turn:
    chat, request = await _chat_and_request(session, run)
    output = await output_for_chat(session, chat=chat)
    skill, skill_source = _resumed_skill(run, output)
    return _Turn(
        run_id=run.id,
        chat_id=chat.id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        member_id=run.user_id or chat.created_by_user_id or uuid.UUID(int=0),
        run_attempt=run.attempt_count,
        mode=run.mode,
        budget=dict(run.budget or {}),
        skill=skill,
        skill_source=skill_source,
        format_id=output.format_id if output else None,
        state=TurnState(
            context_text=render_manifest(run.context_manifest or {}),
            history=await _history(session, chat=chat, request=request),
            request=request.content,
            current_output=await _current_output(session, output),
            mode=run.mode,
        ),
        seen_refs=_manifest_refs(run.context_manifest or {}),
        steps_summary=[],
    )


def _manifest_refs(manifest: dict[str, Any]) -> set[str]:
    refs: set[str] = set()
    action = manifest.get("action") or {}
    for item in (action.get("diagnosis") or {}).get("what_happened") or []:
        refs.add(f"citeladder://opportunity/{item.get('opportunity_id')}")
    return refs


async def execute_run(deps: RuntimeDeps, *, run_id: uuid.UUID, owner: str) -> None:
    """Run one claimed turn to a terminal state (or leave it to a retry)."""
    async with deps.session_factory() as session:
        run = await lock_owned_run(session, run_id=run_id, owner=owner)
        if run is None:
            await session.rollback()
            return
        try:
            route = await _admitted_route(session, run)
            turn = await _load_turn(session, run)
        except RunFailedError as exc:
            await fail_run(
                session, run_id=run_id, owner=owner, code=exc.code, detail=exc.detail
            )
            return
        await session.commit()
        gateway = deps.gateway_for(route)
        try:
            await _loop(
                deps, session, turn=turn, owner=owner, gateway=gateway, route=route
            )
        except RunFailedError as exc:
            await fail_run(
                session, run_id=run_id, owner=owner, code=exc.code, detail=exc.detail
            )


async def _loop(
    deps: RuntimeDeps,
    session: AsyncSession,
    *,
    turn: _Turn,
    owner: str,
    gateway: ModelGateway,
    route: AppModelRouteConfig | None,
) -> None:
    max_steps = int(turn.budget["max_steps"])
    max_tool_calls = int(turn.budget["max_tool_calls"])
    catalog = catalog_for_model(deps.tools)
    protocol_errors = 0
    for ordinal in range(1, max_steps + 1):
        remaining = max_steps - ordinal + 1
        outline_only = outline_required(
            turn.skill, turn.state.current_output, turn.mode
        )
        receipt = await call_model(
            session,
            run_id=turn.run_id,
            owner=owner,
            ordinal=ordinal,
            gateway=gateway,
            app_route=route,
            system=system_text(
                skill=turn.skill,
                format_id=turn.format_id,
                tools=catalog,
                remaining_steps=remaining,
                remaining_tool_calls=max(max_tool_calls - turn.tool_calls, 0),
                outline_required=outline_only,
            ),
            user=user_text(turn.state),
            schema_name=STEP_SCHEMA_NAME,
            schema=step_schema(),
        )
        try:
            step = parse_step(receipt.content)
        except ProtocolError as exc:
            protocol_errors += 1
            if protocol_errors >= _MAX_PROTOCOL_ERRORS:
                raise RunFailedError(
                    ERROR_PROTOCOL, "The model did not follow the step protocol."
                ) from exc
            turn.state.steps.append(
                f"Step {ordinal}: rejected ({exc}). Return one valid JSON step."
            )
            continue
        if step.action == "select_skill":
            _select_skill(turn, step, ordinal)
            continue
        if step.action == "call_tool":
            await _call_tool(
                deps,
                session,
                turn=turn,
                owner=owner,
                step=step,
                ordinal=ordinal,
                last_step=remaining == 1,
                max_tool_calls=max_tool_calls,
            )
            continue
        await _finalize(
            session, turn=turn, owner=owner, step=step, outline_only=outline_only
        )
        return
    await _stop_at_limit(session, turn=turn, owner=owner)


def _select_skill(turn: _Turn, step: StepResponse, ordinal: int) -> None:
    if turn.skill is not None:
        turn.state.steps.append(
            f"Step {ordinal}: the skill is already {turn.skill.id}; continue."
        )
        return
    turn.skill = AGENT_SKILL_REGISTRY[str(step.skill_id)]
    turn.skill_source = SKILL_SOURCE_MODEL
    turn.state.steps.append(f"Step {ordinal}: selected skill {turn.skill.id}.")
    turn.steps_summary.append({"kind": "skill", "skill_id": turn.skill.id})


async def _call_tool(
    deps: RuntimeDeps,
    session: AsyncSession,
    *,
    turn: _Turn,
    owner: str,
    step: StepResponse,
    ordinal: int,
    last_step: bool,
    max_tool_calls: int,
) -> None:
    name = str(step.tool)
    arguments = dict(step.arguments or {})
    tool = deps.tools.get(name)
    started = time.monotonic()
    reason = _refusal_reason(tool, spent=last_step or turn.tool_calls >= max_tool_calls)
    if reason is not None or tool is None:
        await _record_tool(
            session,
            turn=turn,
            owner=owner,
            ordinal=ordinal,
            name=name,
            arguments=arguments,
            status=TOOL_ATTEMPT_REFUSED,
            error=reason or "unknown tool",
        )
        turn.state.steps.append(
            f"Step {ordinal}: {name} refused: {reason}. Respond now."
        )
        return
    turn.tool_calls += 1
    try:
        outcome = await execute_tool(
            tool,
            project_id=turn.project_id,
            member_user_id=turn.member_id,
            arguments=arguments,
        )
    except ToolRefusedError as exc:
        await _record_tool(
            session,
            turn=turn,
            owner=owner,
            ordinal=ordinal,
            name=name,
            arguments=arguments,
            status=TOOL_ATTEMPT_REFUSED,
            error=str(exc)[:64],
            started=started,
        )
        turn.state.steps.append(f"Step {ordinal}: {name} refused: {exc}")
        return
    except (LookupError, ValueError, PermissionError) as exc:
        await _record_tool(
            session,
            turn=turn,
            owner=owner,
            ordinal=ordinal,
            name=name,
            arguments=arguments,
            status=TOOL_ATTEMPT_FAILED,
            error=ERROR_TOOL,
            started=started,
        )
        turn.state.steps.append(f"Step {ordinal}: {name} failed: {exc}")
        return
    status = TOOL_ATTEMPT_UNAVAILABLE if outcome.unavailable else TOOL_ATTEMPT_COMPLETED
    await _record_tool(
        session,
        turn=turn,
        owner=owner,
        ordinal=ordinal,
        name=name,
        arguments=arguments,
        status=status,
        started=started,
        refs=outcome.artifact_refs,
        omissions=outcome.omissions,
        output_hash=outcome.output_hash,
    )
    turn.seen_refs.update(_citable_refs(outcome.artifact_refs))
    turn.steps_summary.append({"kind": "tool", "tool": name, "status": status})
    turn.state.steps.append(
        f"Step {ordinal}: {name}({json.dumps(arguments, default=str)}) -> "
        f"{outcome.model_text}"
    )


def _refusal_reason(tool: AgentTool | None, *, spent: bool) -> str | None:
    if tool is None:
        return "unknown tool"
    return "the tool budget for this turn is spent" if spent else None


def _citable_refs(artifact_refs: list[Any]) -> set[str]:
    """The evidence references a tool returned, which a reply may then cite."""
    return {
        str(value)
        for ref in artifact_refs
        if isinstance(ref, dict)
        for value in (ref.get("record_uri"), ref.get("id"))
        if value
    }


async def _record_tool(
    session: AsyncSession,
    *,
    turn: _Turn,
    owner: str,
    ordinal: int,
    name: str,
    arguments: dict[str, Any],
    status: str,
    error: str = "",
    started: float | None = None,
    refs: list[Any] | None = None,
    omissions: list[Any] | None = None,
    output_hash: str = "",
) -> None:
    await session.rollback()
    if await lock_owned_run(session, run_id=turn.run_id, owner=owner) is None:
        await session.rollback()
        raise ModelUnavailableError(reason="lease")
    session.add(
        AgentToolAttempt(
            workspace_id=turn.workspace_id,
            project_id=turn.project_id,
            run_id=turn.run_id,
            run_attempt=turn.run_attempt,
            ordinal=ordinal,
            tool_name=name[:128],
            registry_version=AGENT_TOOL_REGISTRY_VERSION,
            status=status,
            input=json.loads(json.dumps(arguments, default=str)),
            artifact_refs=list(refs or []),
            omissions=list(omissions or []),
            output_hash=output_hash,
            error_code=error[:64],
            latency_ms=int((time.monotonic() - started) * 1000) if started else 0,
        )
    )
    await session.commit()


async def _append_reply(
    session: AsyncSession,
    *,
    run: AgentRun,
    turn: _Turn,
    content: str,
    evidence: list[str],
) -> AgentMessage:
    sequence = await session.scalar(
        select(func.max(AgentMessage.sequence)).where(
            AgentMessage.chat_id == turn.chat_id
        )
    )
    message = AgentMessage(
        workspace_id=turn.workspace_id,
        project_id=turn.project_id,
        chat_id=turn.chat_id,
        sequence=int(sequence or 0) + 1,
        role=MESSAGE_ROLE_AGENT,
        content=content,
        reply_to_message_id=run.user_message_id,
        skill_id=turn.skill.id if turn.skill else None,
        skill_source=turn.skill_source,
        evidence_refs=evidence,
        steps=turn.steps_summary,
    )
    session.add(message)
    await session.flush()
    return message


async def _finalize(
    session: AsyncSession,
    *,
    turn: _Turn,
    owner: str,
    step: StepResponse,
    outline_only: bool,
) -> None:
    await session.rollback()
    run = await lock_owned_run(session, run_id=turn.run_id, owner=owner)
    if run is None:
        await session.rollback()
        return
    if not await member_may_run(session, run):
        await session.rollback()
        raise ModelUnavailableError(reason="access")
    chat = await session.get(AgentChat, turn.chat_id, with_for_update=True)
    assert chat is not None  # noqa: S101 - loaded for this run above
    # Only references a tool actually returned (or the frozen Action evidence)
    # may be cited; anything else is dropped rather than shown as evidence,
    # including references written into the visible text.
    evidence = [ref for ref in (step.evidence or []) if ref in turn.seen_refs]
    reply = bound_reply(strip_unverified_refs(str(step.reply).strip(), turn.seen_refs))
    message = await _append_reply(
        session, run=run, turn=turn, content=reply, evidence=evidence
    )
    if step.output is not None and turn.skill is not None:
        payload = step.output.model_dump()
        payload["body"] = strip_unverified_refs(str(payload["body"]), turn.seen_refs)
        try:
            await save_agent_output(
                session,
                chat=chat,
                skill_id=turn.skill.id,
                payload=payload,
                phase=admissible_phase(step.output.phase, outline_only=outline_only),
                run_id=run.id,
                message_id=message.id,
                source_refs=evidence,
                user_id=run.user_id,
                base_revision_number=_base_revision_number(turn),
            )
        except OutputError as exc:
            await session.rollback()
            raise RunFailedError(ERROR_OUTPUT_CONFLICT, str(exc)) from exc
    chat.last_activity_at = _utcnow()
    _terminal(run, status=TASK_STATUS_SUCCEEDED, turn=turn)
    await session.commit()


def _base_revision_number(turn: _Turn) -> int | None:
    current = turn.state.current_output
    return int(current["number"]) if current is not None else None


async def _stop_at_limit(session: AsyncSession, *, turn: _Turn, owner: str) -> None:
    await session.rollback()
    run = await lock_owned_run(session, run_id=turn.run_id, owner=owner)
    if run is None:
        await session.rollback()
        return
    await _append_reply(
        session,
        run=run,
        turn=turn,
        content=(
            "I reached this turn's step limit before I could finish. Nothing was "
            "saved. Ask me to continue, or narrow the request."
        ),
        evidence=[],
    )
    _terminal(
        run,
        status=TASK_STATUS_FAILED,
        turn=turn,
        code=ERROR_STOPPED_AT_LIMIT,
        detail="The turn used its full step budget without responding.",
    )
    await session.commit()


async def fail_run(
    session: AsyncSession, *, run_id: uuid.UUID, owner: str, code: str, detail: str
) -> None:
    await session.rollback()
    run = await lock_owned_run(session, run_id=run_id, owner=owner)
    if run is None:
        await session.rollback()
        return
    _terminal(run, status=TASK_STATUS_FAILED, turn=None, code=code, detail=detail)
    await session.commit()


def _terminal(
    run: AgentRun,
    *,
    status: str,
    turn: _Turn | None,
    code: str = "",
    detail: str = "",
) -> None:
    run.status = status
    run.completed_at = _utcnow()
    run.error_code = code[:32]
    run.error_detail = detail
    run.lease_owner = None
    run.lease_expires_at = None
    if turn is not None and turn.skill is not None:
        run.skill_id = turn.skill.id
        run.skill_source = turn.skill_source
        run.skill_version = turn.skill.version
