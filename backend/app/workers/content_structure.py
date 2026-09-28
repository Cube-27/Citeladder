"""Pooled, bounded JEV judgments with committed dispatches and partial publication."""

import asyncio
import time
import uuid
from contextlib import nullcontext

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.jev import JevClient, create_jev_client
from app.core.config import site_health_content_structure as config
from app.core.config.jev import jev_settings
from app.domain.analytics.enqueue import enqueue_content_structure_publish
from app.domain.site_health.content_batches import batch_request, candidate_batches
from app.domain.site_health.content_judgments import (
    dispatch_context,
    event,
    finish_dispatch,
    locked_run,
    prepare_dispatch,
)
from app.models.analytics import AnalyticsTask
from app.models.site_health.content_structure import SiteContentStructureEvent


async def _judge(
    client: JevClient | None, candidates: list[dict], dispatches: dict
) -> dict:
    if client is None:
        return {
            key: {"state": "unavailable", "reason": "provider_unconfigured"}
            for key in dispatches
        }
    state, questions = batch_request(candidates, set(dispatches))
    started = time.monotonic()
    try:
        decision = await client.decide(state, questions)
    except ProviderError as exc:
        return {
            candidate_id: {"state": "uncertain", "reason": exc.error_code}
            for candidate_id in dispatches
        }
    elapsed_ms = round((time.monotonic() - started) * 1000)
    # Usage belongs to the HTTP request, not every question in that request.
    leader = next(iter(dispatches))
    return {
        candidate["id"]: {
            "state": "completed",
            "answers": {
                name: decision.answers.get(f"{candidate['id']}:{name}")
                for name in candidate["request"]["questions"]
            },
            "model": decision.model,
            "usage": decision.usage if candidate["id"] == leader else {},
            "latency_ms": elapsed_ms,
            "batch_id": dispatches[candidate["id"]]["batch"]["id"],
        }
        for candidate in candidates
        if candidate["id"] in dispatches
    }


async def _execute_batch(factory, task, client, candidates) -> bool:
    batch = {"id": str(uuid.uuid4()), "candidate_ids": [c["id"] for c in candidates]}
    async with factory() as session:
        run = await locked_run(session, task)
        if run is None or run.state == "cancelled":
            return False
        dispatches = {}
        context = await dispatch_context(session, run, candidates)
        for candidate in candidates:
            dispatch = await prepare_dispatch(
                session, run, candidate, context=context, batch=batch
            )
            if dispatch is not None:
                dispatches[candidate["id"]] = dispatch
        await session.commit()
    if not dispatches:
        return True
    outcomes = await _judge(client, candidates, dispatches)
    async with factory() as session:
        run = await locked_run(session, task)
        if run is None:
            return False
        for candidate_id, dispatch in dispatches.items():
            await finish_dispatch(
                session, run, uuid.UUID(candidate_id), dispatch, outcomes[candidate_id]
            )
        await session.commit()
    return True


async def _publish(factory, task, revision: str, *, terminal: bool = False) -> None:
    async with factory() as session:
        run = await locked_run(session, task, terminal=terminal)
        if run is None:
            return
        await enqueue_content_structure_publish(
            session,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            run_id=run.id,
            revision=f"{task.id}:{revision}",
        )
        await session.commit()


async def _run_pool(factory, task, client, candidates) -> None:
    batches = iter(candidate_batches(candidates))
    completed = 0
    published = 0

    async def slot():
        nonlocal completed, published
        for batch in batches:
            if not await _execute_batch(factory, task, client, batch):
                return
            completed += len(batch)
            if completed - published >= config.CONTENT_STRUCTURE_PUBLISH_EVERY:
                published = completed
                await _publish(factory, task, str(completed))

    tasks = [asyncio.create_task(slot()) for _ in range(jev_settings.concurrency)]
    try:
        await asyncio.gather(*tasks)
    finally:
        for pending in tasks:
            if not pending.done():
                pending.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def _branch_candidates(manifest: dict, task: AnalyticsTask) -> list[dict]:
    kind = (task.payload or {}).get("kind")
    return [c for c in manifest["candidates"] if not kind or c["kind"] == kind]


async def judge_content_structure(
    factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    async with factory() as session:
        run = await locked_run(session, task, include_manifest=True)
        if run is None or run.state == "cancelled":
            return
        candidates = _branch_candidates(run.manifest, task)
        await session.commit()
    client = create_jev_client(jev_settings.model_copy(update={"max_attempts": 1}))
    try:
        async with asyncio.timeout(jev_settings.generation_deadline_seconds):
            async with client if client is not None else nullcontext():
                await _run_pool(factory, task, client, candidates)
    except TimeoutError:
        await compensate_content_structure(factory, task, reason="deadline_exceeded")
        return
    await _publish(factory, task, "complete")


async def compensate_content_structure(
    factory: async_sessionmaker[AsyncSession],
    task: AnalyticsTask,
    *,
    reason: str = "interrupted_dispatch",
) -> None:
    """Never resend committed dispatches; settle only this branch, then publish."""
    async with factory() as session:
        run = await locked_run(session, task, terminal=True, include_manifest=True)
        if run is None:
            return
        candidates = _branch_candidates(run.manifest, task)
        events = list(
            await session.scalars(
                select(SiteContentStructureEvent).where(
                    SiteContentStructureEvent.run_id == run.id,
                    SiteContentStructureEvent.workspace_id == run.workspace_id,
                )
            )
        )
        finished = {row.candidate_id for row in events if row.kind == "outcome"}
        dispatches = {
            row.candidate_id: row.evidence for row in events if row.kind == "dispatch"
        }
        for candidate in candidates:
            candidate_id = uuid.UUID(candidate["id"])
            if candidate_id in finished:
                continue
            if candidate_id in dispatches:
                await finish_dispatch(
                    session,
                    run,
                    candidate_id,
                    dispatches[candidate_id],
                    {"state": "uncertain", "reason": reason},
                )
            else:
                session.add(
                    event(
                        run,
                        candidate_id,
                        "outcome",
                        {"state": "unavailable", "reason": reason},
                    )
                )
        await session.commit()
    await _publish(factory, task, "complete", terminal=True)
