"""Live progress of an active run, read from its committed attempt rows.

Every model step commits its dispatch before any network I/O and every tool
read commits its attempt when it ends, so a poll can show what the current
attempt at the turn has done so far without the runtime writing anything
extra. This is a projection: it never runs, retries or repairs a turn.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    models = (
        await session.execute(
            select(AgentModelAttempt.ordinal, AgentModelAttempt.outcome).where(*scope)
        )
    ).all()
    tools = {
        row.ordinal: (row.tool_name, row.status)
        for row in (
            await session.execute(
                select(
                    AgentToolAttempt.ordinal,
                    AgentToolAttempt.tool_name,
                    AgentToolAttempt.status,
                ).where(
                    AgentToolAttempt.workspace_id == run.workspace_id,
                    AgentToolAttempt.run_id == run.id,
                    AgentToolAttempt.run_attempt == run.attempt_count,
                )
            )
        ).all()
    }
    steps: list[RunStep] = []
    for ordinal, outcome in sorted(models):
        if ordinal in tools:
            name, status = tools[ordinal]
            steps.append(RunStep(ordinal=ordinal, status=status, tool=name))
        elif outcome == "dispatched":
            steps.append(RunStep(ordinal=ordinal, status=STEP_WORKING))
        else:
            steps.append(RunStep(ordinal=ordinal, status=STEP_REASONED))
    return steps
