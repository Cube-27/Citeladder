"""Pooled JEV link judgments with committed dispatches and partial publication."""

import asyncio
import time
import uuid
from contextlib import nullcontext

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.jev import JevClient, create_jev_client
from app.core.config import site_health_internal_links as config
from app.core.config.jev import jev_settings
from app.domain.analytics.enqueue import enqueue_internal_link_publish
from app.domain.site_health.internal_link_judgments import (
    dispatch_context,
    event,
    finish_dispatch,
    locked_run,
    prepare_dispatch,
)
from app.models.analytics import AnalyticsTask
from app.models.site_health.internal_links import SiteInternalLinkEvent


async def _judge(client: JevClient | None, candidate: dict) -> dict:
    """One page pair is one state; its questions share that request."""
    if client is None:
        return {"state": "unavailable", "reason": "provider_unconfigured"}
    request = candidate["request"]
    started = time.monotonic()
    try:
        decision = await client.decide(request["state"], request["questions"])
    except ProviderError as exc:
        return {"state": "uncertain", "reason": exc.error_code}
    return {
        "state": "completed",
        "answers": {name: decision.answers.get(name) for name in request["questions"]},
        "model": decision.model,
        "usage": decision.usage,
        "latency_ms": round((time.monotonic() - started) * 1000),
    }


async def _execute(factory, task, client, candidate) -> bool:
    async with factory() as session:
        run = await locked_run(session, task)
        if run is None or run.state == "cancelled":
            return False
        context = await dispatch_context(session, run, [candidate])
        dispatch = await prepare_dispatch(session, run, candidate, context=context)
        await session.commit()
    if dispatch is None:
        return True
    outcome = await _judge(client, candidate)
    async with factory() as session:
        run = await locked_run(session, task)
        if run is None:
            return False
        await finish_dispatch(
            session, run, uuid.UUID(candidate["id"]), dispatch, outcome
        )
        await session.commit()
    return True


async def _publish(factory, task, revision: str, *, terminal: bool = False) -> None:
    async with factory() as session:
        run = await locked_run(session, task, terminal=terminal)
        if run is None:
            return
        await enqueue_internal_link_publish(
            session,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            run_id=run.id,
            revision=f"{task.id}:{revision}",
        )
        await session.commit()


async def _run_pool(factory, task, client, candidates) -> None:
    pending = iter(candidates)
    completed = 0
    published = 0

    async def slot():
        nonlocal completed, published
        for candidate in pending:
            if not await _execute(factory, task, client, candidate):
                return
            completed += 1
            if completed - published >= config.INTERNAL_LINKS_PUBLISH_EVERY:
                published = completed
                await _publish(factory, task, str(completed))

    slots = [
        asyncio.create_task(slot()) for _ in range(config.INTERNAL_LINKS_CONCURRENCY)
    ]
    try:
        await asyncio.gather(*slots)
    finally:
        for running in slots:
            if not running.done():
                running.cancel()
        await asyncio.gather(*slots, return_exceptions=True)


async def judge_internal_links(
    factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    async with factory() as session:
        run = await locked_run(session, task, include_manifest=True)
        if run is None or run.state == "cancelled":
            return
        candidates = run.manifest["candidates"]
        await session.commit()
    client = create_jev_client(jev_settings)
    try:
        async with asyncio.timeout(config.INTERNAL_LINKS_JOB_DEADLINE_SECONDS):
            async with client if client is not None else nullcontext():
                await _run_pool(factory, task, client, candidates)
    except TimeoutError:
        await compensate_internal_links(factory, task, reason="deadline_exceeded")
        return
    await _publish(factory, task, "complete")


async def compensate_internal_links(
    factory: async_sessionmaker[AsyncSession],
    task: AnalyticsTask,
    *,
    reason: str = "interrupted_dispatch",
) -> None:
    """Never resend committed dispatches; settle what is left, then publish."""
    async with factory() as session:
        run = await locked_run(session, task, terminal=True, include_manifest=True)
        if run is None:
            return
        events = list(
            await session.scalars(
                select(SiteInternalLinkEvent).where(
                    SiteInternalLinkEvent.run_id == run.id,
                    SiteInternalLinkEvent.workspace_id == run.workspace_id,
                )
            )
        )
        finished = {row.candidate_id for row in events if row.kind == "outcome"}
        dispatches = {
            row.candidate_id: row.evidence for row in events if row.kind == "dispatch"
        }
        for candidate in run.manifest["candidates"]:
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
