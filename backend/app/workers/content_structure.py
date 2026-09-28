"""One-shot judgments over TypeScript-prepared requests using the shared client."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.jev import create_jev_client
from app.core.config.jev import jev_settings
from app.domain.analytics.enqueue import _enqueue_task
from app.domain.site_health.content_judgments import (
    finish_dispatch,
    locked_run,
    prepare_dispatch,
)
from app.models.analytics import AnalyticsTask
from app.models.site_health.content_structure import (
    SiteContentStructureEvent,
    SiteContentStructureRun,
)


async def _judge(dispatch: dict) -> dict:
    client = create_jev_client(
        jev_settings.model_copy(update={"max_attempts": 1, "model": dispatch["model"]})
    )
    if client is None:
        return {"state": "unavailable"}
    try:
        async with client:
            decision = await client.decide(
                dispatch["request"]["state"], dispatch["request"]["questions"]
            )
        return {
            "state": "completed",
            "answers": decision.answers,
            "model": decision.model,
            "usage": decision.usage,
        }
    except ProviderError:
        return {"state": "uncertain", "reason": "provider_unavailable"}


async def judge_content_structure(
    factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    async with factory() as session:
        run = await locked_run(session, task)
        if run is None:
            return
        candidates = run.manifest["candidates"]
        await session.commit()

    # A recovered dispatch is settled as uncertain; neither worker nor client
    # retries an outcome that might already have incurred provider usage.
    for candidate in candidates:
        async with factory() as session:
            run = await locked_run(session, task)
            if run is None or run.state == "cancelled":
                break
            dispatch = await prepare_dispatch(session, run, candidate)
            await session.commit()
        if dispatch is None:
            continue
        outcome = await _judge(dispatch)
        async with factory() as session:
            run = await locked_run(session, task)
            if run is None:
                return
            await finish_dispatch(
                session, run, uuid.UUID(candidate["id"]), dispatch, outcome
            )
            await session.commit()
    async with factory() as session:
        run = await locked_run(session, task)
        if run is None:
            return
        await _enqueue_task(
            session,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            task_kind="content_structure_publish",
            payload={"run_id": str(run.id)},
            idempotency_key=f"content:publish:{run.id}",
        )
        await session.commit()


async def compensate_content_structure(
    factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """Settle interrupted requests without resending; publish partial evidence."""
    async with factory() as session:
        run = await session.scalar(
            select(SiteContentStructureRun)
            .where(
                SiteContentStructureRun.id
                == uuid.UUID(str((task.payload or {})["run_id"])),
                SiteContentStructureRun.workspace_id == task.workspace_id,
                SiteContentStructureRun.project_id == task.project_id,
            )
            .with_for_update()
        )
        if run is None:
            return
        events = list(
            await session.scalars(
                select(SiteContentStructureEvent).where(
                    SiteContentStructureEvent.run_id == run.id,
                    SiteContentStructureEvent.workspace_id == run.workspace_id,
                )
            )
        )
        finished = {row.candidate_id for row in events if row.kind == "outcome"}
        for row in events:
            if row.kind == "dispatch" and row.candidate_id not in finished:
                await finish_dispatch(
                    session,
                    run,
                    row.candidate_id,
                    row.evidence,
                    {"state": "uncertain", "reason": "interrupted_dispatch"},
                )
        await _enqueue_task(
            session,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            task_kind="content_structure_publish",
            payload={"run_id": str(run.id)},
            idempotency_key=f"content:publish:{run.id}",
        )
        await session.commit()
