import asyncio
import re
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import SecretStr
from sqlalchemy import select

from app.domain.site_health import content_judgments as owner
from app.models.analytics import AnalyticsTask
from app.models.site_health.content_structure import (
    SiteContentStructureEvent,
    SiteContentStructureRun,
)
from app.workers import content_structure as worker
from tests.component.opportunity_helpers import _seed_scenario


async def _seed_run(session_factory, count=4):
    async with session_factory() as session:
        seed = await _seed_scenario(session)
        run = SiteContentStructureRun(
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
                        "kind": "link",
                        "request": {
                            "state": {"source": str(index)},
                            "questions": {
                                "usefulness": {
                                    "type": "noul",
                                    "instructions": "Does `source` help?",
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
            task_kind="content_structure_judgment",
            payload={"run_id": str(run.id), "kind": "link"},
            idempotency_key=str(uuid.uuid4()),
            status="running",
            lease_owner="test",
            available_at=datetime.now(UTC),
            lease_expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )
        session.add_all([run, task])
        await session.commit()
    return run, task


def _fund_judgments(monkeypatch):
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
        worker.jev_settings.model_copy(
            update={
                "api_key": SecretStr("fixture-only"),
                "concurrency": 2,
                "generation_deadline_seconds": 10,
            }
        ),
    )
    return settlement


async def test_batched_requests_overlap_reuse_client_and_preserve_individual_answers(
    session_factory, monkeypatch
):
    run, task = await _seed_run(session_factory)
    settlement = _fund_judgments(monkeypatch)
    monkeypatch.setattr(worker.config, "CONTENT_STRUCTURE_JUDGMENTS_PER_REQUEST", 2)
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
            async with session_factory() as session:
                dispatches = list(
                    await session.scalars(
                        select(SiteContentStructureEvent).where(
                            SiteContentStructureEvent.run_id == run.id,
                            SiteContentStructureEvent.kind == "dispatch",
                        )
                    )
                )
            dispatched_ids = {str(row.candidate_id) for row in dispatches}
            assert {key.split(":")[0] for key in questions} <= dispatched_ids
            await asyncio.wait_for(both_started.wait(), timeout=3)
            self.active -= 1
            assert len(state["items"]) == 2
            answers = {}
            for key, question in questions.items():
                positions = set(re.findall(r"items\[(\d+)\]", question["instructions"]))
                assert len(positions) == 1
                source = state["items"][int(positions.pop())]["source"]
                answers[key] = {"type": "noul", "noul": int(source) / 10}
            return SimpleNamespace(
                model="fixture",
                usage={"input_tokens": 10},
                answers=answers,
            )

    client = Client()
    constructor = []

    def create(settings):
        constructor.append(settings)
        return client

    monkeypatch.setattr(worker, "create_jev_client", create)
    await worker.judge_content_structure(session_factory, task)
    assert (len(constructor), client.entered, client.closed, client.calls) == (
        1,
        1,
        1,
        2,
    )
    assert settlement.await_count == 4
    async with session_factory() as session:
        outcomes = list(
            await session.scalars(
                select(SiteContentStructureEvent).where(
                    SiteContentStructureEvent.run_id == run.id,
                    SiteContentStructureEvent.kind == "outcome",
                )
            )
        )
    assert len(outcomes) == 4
    expected = {
        candidate["id"]: index / 10
        for index, candidate in enumerate(run.manifest["candidates"])
    }
    assert {
        str(row.candidate_id): row.evidence["answers"]["usefulness"]["noul"]
        for row in outcomes
    } == expected
    assert sum(row.evidence["usage"].get("input_tokens", 0) for row in outcomes) == 20


async def test_deadline_settles_sent_requests_and_leaves_unsent_free(
    session_factory, monkeypatch
):
    run, task = await _seed_run(session_factory)
    settlement = _fund_judgments(monkeypatch)
    monkeypatch.setattr(worker.config, "CONTENT_STRUCTURE_JUDGMENTS_PER_REQUEST", 1)
    monkeypatch.setattr(
        worker,
        "jev_settings",
        worker.jev_settings.model_copy(
            update={
                "concurrency": 1,
                "generation_deadline_seconds": 1,
            }
        ),
    )

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
    await worker.judge_content_structure(session_factory, task)
    await worker.judge_content_structure(session_factory, task)
    assert client.calls == 1
    assert settlement.await_count == 1
    async with session_factory() as session:
        outcomes = list(
            await session.scalars(
                select(SiteContentStructureEvent).where(
                    SiteContentStructureEvent.run_id == run.id,
                    SiteContentStructureEvent.kind == "outcome",
                )
            )
        )
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
    await worker.judge_content_structure(session_factory, task)
    task.workspace_id = real_workspace
    async with session_factory() as session:
        saved = await session.get(SiteContentStructureRun, run.id)
        saved.state = "cancelled"
        await session.commit()
    await worker.judge_content_structure(session_factory, task)
    client.assert_not_called()
    owner.reserve_metered_usage.assert_not_awaited()


async def test_terminal_compensation_only_finishes_its_own_branch(
    session_factory, monkeypatch
):
    run, task = await _seed_run(session_factory, count=2)
    _fund_judgments(monkeypatch)
    async with session_factory() as session:
        saved = await session.get(SiteContentStructureRun, run.id)
        candidates = [dict(candidate) for candidate in saved.manifest["candidates"]]
        candidates[1]["kind"] = "topic"
        saved.manifest = {"candidates": candidates}
        saved_task = await session.get(AnalyticsTask, task.id)
        saved_task.status = "failed"
        saved_task.lease_owner = None
        saved_task.lease_expires_at = None
        await session.commit()
    await worker.compensate_content_structure(session_factory, task)
    await worker.compensate_content_structure(session_factory, task)
    async with session_factory() as session:
        outcomes = list(
            await session.scalars(
                select(SiteContentStructureEvent).where(
                    SiteContentStructureEvent.run_id == run.id,
                    SiteContentStructureEvent.kind == "outcome",
                )
            )
        )
    assert [str(row.candidate_id) for row in outcomes] == [candidates[0]["id"]]
    owner.reserve_metered_usage.assert_not_awaited()
    owner.settle_metered_usage.assert_not_awaited()


@pytest.mark.parametrize("interrupted", [False, True])
async def test_dispatch_is_committed_before_provider_and_replay_does_not_resend(
    session_factory, monkeypatch, interrupted
):
    async with session_factory() as session:
        seed = await _seed_scenario(session)
        candidate_id = uuid.uuid4()
        run = SiteContentStructureRun(
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
                    {"id": str(candidate_id), "request": {"state": {}, "questions": {}}}
                ]
            },
        )
        session.add(run)
        task = AnalyticsTask(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            task_kind="content_structure_judgment",
            payload={"run_id": str(run.id)},
            idempotency_key=str(uuid.uuid4()),
            status="running",
            lease_owner="test",
            available_at=datetime.now(UTC),
        )
        task.lease_expires_at = datetime.now(UTC) + timedelta(minutes=5)
        session.add(task)
        await session.commit()
    monkeypatch.setattr(
        owner, "jev_settings", SimpleNamespace(enabled=True, model="fixture")
    )
    monkeypatch.setattr(
        owner, "billing_account_id_for", AsyncMock(return_value=uuid.uuid4())
    )
    monkeypatch.setattr(
        owner,
        "reserve_metered_usage",
        AsyncMock(return_value=SimpleNamespace(reservation_id=uuid.uuid4())),
    )
    settlement = AsyncMock()
    monkeypatch.setattr(owner, "settle_metered_usage", settlement)
    monkeypatch.setattr(
        worker,
        "jev_settings",
        worker.jev_settings.model_copy(update={"api_key": SecretStr("fixture-only")}),
    )

    class Client:
        calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def decide(self, *_):
            self.calls += 1
            async with session_factory() as session:
                dispatch = await session.scalar(
                    select(SiteContentStructureEvent).where(
                        SiteContentStructureEvent.run_id == run.id,
                        SiteContentStructureEvent.kind == "dispatch",
                    )
                )
                assert dispatch is not None
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
            await worker.judge_content_structure(session_factory, task)
    else:
        await worker.judge_content_structure(session_factory, task)
    await worker.judge_content_structure(session_factory, task)
    assert client.calls == 1
    assert settlement.await_count == 1
    async with session_factory() as session:
        events = list(
            await session.scalars(
                select(SiteContentStructureEvent).where(
                    SiteContentStructureEvent.run_id == run.id
                )
            )
        )
        assert [row.kind for row in events].count("outcome") == 1
        outcome = next(row for row in events if row.kind == "outcome")
        assert outcome.evidence["state"] == (
            "uncertain" if interrupted else "completed"
        )
        queued = list(
            await session.scalars(
                select(AnalyticsTask).where(
                    AnalyticsTask.task_kind == "content_structure_publish"
                )
            )
        )
        assert len(queued) == 1
