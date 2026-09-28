"""Concurrent JEV link judgments with committed dispatches and partial publication."""

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
    event,
    locked_run,
    prepare_dispatches,
)
from app.models.analytics import AnalyticsTask
from app.models.site_health.internal_links import SiteInternalLinkEvent

Outcomes = list[tuple[uuid.UUID, dict]]


async def _judge(client: JevClient, request: dict) -> Outcomes:
    """One source page is one state; each destination has its own questions."""
    body = request["request"]
    started = time.monotonic()
    try:
        decision = await client.decide(body["state"], body["questions"])
    except ProviderError as exc:
        failed = {"state": "uncertain", "reason": exc.error_code}
        return [(uuid.UUID(item["id"]), failed) for item in request["candidates"]]
    shared = {
        "request_id": request["id"],
        "model": decision.model,
        "usage": decision.usage,
        "latency_ms": round((time.monotonic() - started) * 1000),
    }
    return [
        (
            uuid.UUID(item["id"]),
            {
                "state": "completed",
                "answers": {
                    name: decision.answers.get(f"{name}_{item['key']}")
                    for name in ("link", "anchor")
                    if f"{name}_{item['key']}" in body["questions"]
                },
                **shared,
            },
        )
        for item in request["candidates"]
    ]


async def _write(factory, task, outcomes: Outcomes) -> bool:
    """Append one batch of outcomes; False once the job no longer owns the run."""
    async with factory() as session:
        run = await locked_run(session, task)
        if run is None:
            return False
        session.add_all(event(run, cid, "outcome", data) for cid, data in outcomes)
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


async def _send_all(factory, task, client: JevClient, requests: list[dict]) -> None:
    """Send every request at once; outcomes land in batches as they arrive."""
    calls = [asyncio.create_task(_judge(client, request)) for request in requests]
    buffer: Outcomes = []
    written = published = 0
    try:
        for done, finished in enumerate(asyncio.as_completed(calls), start=1):
            buffer.extend(await finished)
            last = done == len(calls)
            if not last and len(buffer) < config.INTERNAL_LINKS_OUTCOME_BATCH:
                continue
            if not await _write(factory, task, buffer):
                return
            written += len(buffer)
            buffer = []
            if written - published >= config.INTERNAL_LINKS_PUBLISH_EVERY:
                published = written
                await _publish(factory, task, str(written))
    finally:
        for call in calls:
            call.cancel()
        await asyncio.gather(*calls, return_exceptions=True)


async def judge_internal_links(
    factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    async with factory() as session:
        run = await locked_run(session, task, include_manifest=True)
        if run is None or run.state == "cancelled":
            return
        requests = await prepare_dispatches(session, run, run.manifest["requests"])
        await session.commit()
    client = create_jev_client(jev_settings) if requests else None
    try:
        async with asyncio.timeout(config.INTERNAL_LINKS_JOB_DEADLINE_SECONDS):
            async with client if client is not None else nullcontext():
                if client is not None:
                    await _send_all(factory, task, client, requests)
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
    """Never resend committed dispatches; close every open pair, then publish."""
    async with factory() as session:
        run = await locked_run(session, task, terminal=True, include_manifest=True)
        if run is None:
            return
        events = list(
            await session.execute(
                select(
                    SiteInternalLinkEvent.candidate_id, SiteInternalLinkEvent.kind
                ).where(
                    SiteInternalLinkEvent.run_id == run.id,
                    SiteInternalLinkEvent.workspace_id == run.workspace_id,
                )
            )
        )
        finished = {cid for cid, kind in events if kind == "outcome"}
        dispatched = {cid for cid, kind in events if kind == "dispatch"}
        for candidate in run.manifest["candidates"]:
            candidate_id = uuid.UUID(candidate["id"])
            if candidate_id in finished:
                continue
            state = "uncertain" if candidate_id in dispatched else "unavailable"
            session.add(
                event(run, candidate_id, "outcome", {"state": state, "reason": reason})
            )
        await session.commit()
    await _publish(factory, task, "complete", terminal=True)
