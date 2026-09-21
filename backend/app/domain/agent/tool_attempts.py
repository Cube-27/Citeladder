"""Durable failed evidence-read attempt recording."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import TOOL_ATTEMPT_FAILED
from app.domain.agent.leases import lock_owned_lease
from app.domain.agent.tools import TOOL_VERSION
from app.models.agent import AgentTaskRun, AgentToolAttempt


async def record_tool_failure(
    session: AsyncSession,
    *,
    run: AgentTaskRun,
    owner: str,
    ordinal: int,
    tool_name: str,
    latency_ms: int,
) -> bool:
    run_id = run.id
    workspace_id = run.workspace_id
    project_id = run.project_id
    run_attempt = run.attempt_count
    await session.rollback()
    if await lock_owned_lease(session, run_id=run_id, owner=owner) is None:
        return False
    session.add(
        AgentToolAttempt(
            workspace_id=workspace_id,
            project_id=project_id,
            task_run_id=run_id,
            run_attempt=run_attempt,
            ordinal=ordinal,
            tool_name=tool_name,
            tool_version=TOOL_VERSION,
            status=TOOL_ATTEMPT_FAILED,
            input={},
            artifact_refs=[],
            output_hash="",
            omissions=[],
            error_code="tool_failed",
            latency_ms=latency_ms,
        )
    )
    await session.commit()
    return True
