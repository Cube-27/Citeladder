import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import SecretStr
from sqlalchemy import select

from app.domain.site_health import internal_link_judgments as owner
from app.models.analytics import AnalyticsTask
from app.models.site_health.internal_links import (
    SiteInternalLinkEvent,
    SiteInternalLinkRun,
)
from app.workers import internal_links as worker
from tests.component.opportunity_helpers import _seed_scenario


async def _seed_run(session_factory, count=4):
    async with session_factory() as session:
        seed = await _seed_scenario(session)
        run = SiteInternalLinkRun(
            id=uuid.uuid4(),
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            crawl_id=seed.crawl_id,
            actor_id=seed.user_id,
            idempotency_key=str(uuid.uuid4()),
            state="queued",
            policy_version=1,
            manifest={
                "candidates": [
                    {
                        "id": str(uuid.uuid4()),
                        "request": {
                            "state": {"source": str(index)},
                            "questions": {
                                "link": {
                                    "type": "noul",
                                    "instructions": "Should `source` link?",
                                },
                            },
                        },
                    }
                    for index in range(count)
                ]
            },
        )
        task = AnalyticsTask(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            task_kind="internal_link_judgment",
            payload={"run_id": str(run.id)},
            idempotency_key=str(uuid.uuid4()),
            status="running",
            lease_owner="test",
            available_at=datetime.now(UTC),
            lease_expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )
        session.add_all([run, task])
        await session.commit()
    return run, task


def _fund_judgments(monkeypatch, *, concurrency=2, deadline=10):
    monkeypatch.setattr(
        owner, "jev_settings", SimpleNamespace(enabled=True, model="fixture")
    )
    monkeypatch.setattr(
        owner, "billing_account_id_for", AsyncMock(return_value=uuid.uuid4())
    )
    monkeypatch.setattr(
        owner,
        "reserve_metered_usage",
        AsyncMock(
            side_effect=lambda *args, **kwargs: SimpleNamespace(
                reservation_id=uuid.uuid4()
            )
        ),
    )
    settlement = AsyncMock()
    monkeypatch.setattr(owner, "settle_metered_usage", settlement)
    monkeypatch.setattr(
        worker,
        "jev_settings",
        worker.jev_settings.model_copy(update={"api_key": SecretStr("fixture-only")}),
    )
    monkeypatch.setattr(worker.config, "INTERNAL_LINKS_CONCURRENCY", concurrency)
    monkeypatch.setattr(worker.config, "INTERNAL_LINKS_JOB_DEADLINE_SECONDS", deadline)
    return settlement


async def _events(session_factory, run, kind):
    async with session_factory() as session:
        return list(
            await session.scalars(
                select(SiteInternalLinkEvent).where(
                    SiteInternalLinkEvent.run_id == run.id,
                    SiteInternalLinkEvent.kind == kind,
                )
            )
        )


async def test_pooled_requests_overlap_reuse_client_and_keep_each_pair_answer(
    session_factory, monkeypatch
):
    run, task = await _seed_run(session_factory)
    settlement = _fund_judgments(monkeypatch)
    both_started = asyncio.Event()

    class Client:
        active = 0
        calls = 0
        entered = 0
        closed = 0

        async def __aenter__(self):
            self.entered += 1
            return self

        async def __aexit__(self, *_):
            self.closed += 1

        async def decide(self, state, questions):
            self.calls += 1
            self.active += 1
            assert self.active <= 2
            if self.active == 2:
                both_started.set()
            dispatched = await _events(session_factory, run, "dispatch")
            assert len(dispatched) >= self.calls
            await asyncio.wait_for(both_started.wait(), timeout=3)
            self.active -= 1
            return SimpleNamespace(
                model="fixture",
                usage={"input_tokens": 10},
                answers={"link": {"type": "noul", "noul": int(state["source"]) / 10}},
            )

    client = Client()
    constructor = []

    def create(settings):
        constructor.append(settings)
        return client

    monkeypatch.setattr(worker, "create_jev_client", create)
    await worker.judge_internal_links(session_factory, task)
    assert (len(constructor), client.entered, client.closed, client.calls) == (
        1,
        1,
        1,
        4,
    )
    assert settlement.await_count == 4
    outcomes = await _events(session_factory, run, "outcome")
    expected = {
        candidate["id"]: index / 10
        for index, candidate in enumerate(run.manifest["candidates"])
    }
    assert {
        str(row.candidate_id): row.evidence["answers"]["link"]["noul"]
        for row in outcomes
    } == expected


async def test_deadline_settles_sent_requests_and_leaves_unsent_free(
    session_factory, monkeypatch
):
    run, task = await _seed_run(session_factory)
    settlement = _fund_judgments(monkeypatch, concurrency=1, deadline=1)

    class Client:
        calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def decide(self, *_):
            self.calls += 1
            await asyncio.Event().wait()

    client = Client()
    monkeypatch.setattr(worker, "create_jev_client", lambda _: client)
    await worker.judge_internal_links(session_factory, task)
    await worker.judge_internal_links(session_factory, task)
    assert client.calls == 1
    assert settlement.await_count == 1
    outcomes = await _events(session_factory, run, "outcome")
    assert sorted(row.evidence["state"] for row in outcomes) == ["unavailable"] * 3 + [
        "uncertain"
    ]
    assert {row.evidence["reason"] for row in outcomes} == {"deadline_exceeded"}


async def test_scope_and_cancelled_run_do_not_dispatch(session_factory, monkeypatch):
    run, task = await _seed_run(session_factory)
    _fund_judgments(monkeypatch)
    client = AsyncMock()
    monkeypatch.setattr(worker, "create_jev_client", client)
    real_workspace = task.workspace_id
    task.workspace_id = uuid.uuid4()
    await worker.judge_internal_links(session_factory, task)
    task.workspace_id = real_workspace
    async with session_factory() as session:
        saved = await session.get(SiteInternalLinkRun, run.id)
        saved.state = "cancelled"
        await session.commit()
    await worker.judge_internal_links(session_factory, task)
    client.assert_not_called()
    owner.reserve_metered_usage.assert_not_awaited()


async def test_terminal_compensation_settles_each_unfinished_pair_once(
    session_factory, monkeypatch
):
    run, task = await _seed_run(session_factory, count=2)
    _fund_judgments(monkeypatch)
    async with session_factory() as session:
        saved_task = await session.get(AnalyticsTask, task.id)
        saved_task.status = "failed"
        saved_task.lease_owner = None
        saved_task.lease_expires_at = None
        await session.commit()
    await worker.compensate_internal_links(session_factory, task)
    await worker.compensate_internal_links(session_factory, task)
    outcomes = await _events(session_factory, run, "outcome")
    assert sorted(str(row.candidate_id) for row in outcomes) == sorted(
        candidate["id"] for candidate in run.manifest["candidates"]
    )
    assert {row.evidence["state"] for row in outcomes} == {"unavailable"}
    owner.reserve_metered_usage.assert_not_awaited()
    owner.settle_metered_usage.assert_not_awaited()


@pytest.mark.parametrize("interrupted", [False, True])
async def test_dispatch_is_committed_before_provider_and_replay_does_not_resend(
    session_factory, monkeypatch, interrupted
):
    run, task = await _seed_run(session_factory, count=1)
    settlement = _fund_judgments(monkeypatch)

    class Client:
        calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def decide(self, *_):
            self.calls += 1
            assert await _events(session_factory, run, "dispatch")
            if interrupted:
                raise RuntimeError("worker interrupted after dispatch")
            return SimpleNamespace(
                answers={},
                model="fixture",
                usage={"input_tokens": 10, "output_tokens": 1},
            )

    client = Client()
    monkeypatch.setattr(worker, "create_jev_client", lambda _: client)
    if interrupted:
        with pytest.raises(RuntimeError, match="worker interrupted"):
            await worker.judge_internal_links(session_factory, task)
    else:
        await worker.judge_internal_links(session_factory, task)
    await worker.judge_internal_links(session_factory, task)
    assert client.calls == 1
    assert settlement.await_count == 1
    outcomes = await _events(session_factory, run, "outcome")
    assert len(outcomes) == 1
    assert outcomes[0].evidence["state"] == (
        "uncertain" if interrupted else "completed"
    )
    async with session_factory() as session:
        queued = list(
            await session.scalars(
                select(AnalyticsTask).where(
                    AnalyticsTask.task_kind == "internal_link_publish"
                )
            )
        )
    assert len(queued) == 1
