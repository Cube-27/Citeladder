"""Live progress of an active run, read from its committed attempt rows.

Every model step commits its dispatch before any network I/O and every tool
read commits its attempt when it ends, so a poll can show what the current
attempt at the turn has done so far without the runtime writing anything
extra. This is a projection: it never runs, retries or repairs a turn.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import AGENT_PROGRESS_VERSION
from app.core.config.task_queue import TASK_ACTIVE_STATUSES
from app.models.agent import AgentModelAttempt, AgentRun, AgentToolAttempt

# A step whose model call has not returned yet.
STEP_WORKING = "working"
# A step whose model call returned without reading data (a skill choice or a
# rejected step the model is asked to redo).
STEP_REASONED = "reasoned"


@dataclass(frozen=True)
class RunStep:
    ordinal: int
    status: str
    model_attempt_id: UUID
    tool_attempt_id: UUID | None
    run_attempt: int
    runtime_version: str
    protocol_version: str
    registry_version: str
    skill_catalog_version: str
    projection_version: str = AGENT_PROGRESS_VERSION
    tool: str | None = None


async def run_progress(session: AsyncSession, run: AgentRun) -> list[RunStep]:
    """The current attempt's steps in order; empty once the run has ended."""
    if run.status not in TASK_ACTIVE_STATUSES or run.attempt_count < 1:
        return []
    scope = (
        AgentModelAttempt.workspace_id == run.workspace_id,
        AgentModelAttempt.run_id == run.id,
        AgentModelAttempt.run_attempt == run.attempt_count,
    )
    rows = (
        await session.execute(
            select(
                AgentModelAttempt.id,
                AgentModelAttempt.ordinal,
                AgentModelAttempt.outcome,
                AgentToolAttempt.id.label("tool_id"),
                AgentToolAttempt.tool_name,
                AgentToolAttempt.status,
                AgentToolAttempt.registry_version,
            )
            .outerjoin(
                AgentToolAttempt,
                and_(
                    AgentToolAttempt.workspace_id == AgentModelAttempt.workspace_id,
                    AgentToolAttempt.run_id == AgentModelAttempt.run_id,
                    AgentToolAttempt.run_attempt == AgentModelAttempt.run_attempt,
                    AgentToolAttempt.ordinal == AgentModelAttempt.ordinal,
                ),
            )
            .where(*scope)
            .order_by(AgentModelAttempt.ordinal)
        )
    ).all()
    steps: list[RunStep] = []
    for row in rows:
        if row.tool_id is not None:
            status = row.status
        else:
            status = _model_status(row.outcome, latest=row.ordinal == rows[-1].ordinal)
        steps.append(
            RunStep(
                ordinal=row.ordinal,
                status=status,
                tool=row.tool_name,
                model_attempt_id=row.id,
                tool_attempt_id=row.tool_id,
                run_attempt=run.attempt_count,
                runtime_version=run.runtime_version,
                protocol_version=run.protocol_version,
                registry_version=row.registry_version or run.registry_version,
                skill_catalog_version=run.skill_catalog_version,
            )
        )
    return steps


def _model_status(outcome: str, *, latest: bool) -> str:
    if outcome == "dispatched":
        return STEP_WORKING
    if outcome == "completed":
        # A receipt alone cannot tell whether the runtime is now reading a tool.
        return "processing" if latest else STEP_REASONED
    return outcome
