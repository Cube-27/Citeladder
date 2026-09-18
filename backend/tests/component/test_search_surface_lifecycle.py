"""The submit/park/poll/finalize lifecycle, against real PostgreSQL.

These are the boundary cases, not breadth. The whole reason this path is
separate from the LLM path is that the provider is PAID at submission and
answers later, so everything worth testing lives in the gap between those two
moments: crash-after-submit recovery, repeated retrieval without duplicate
charges, and incomplete retrieval versus genuine absence.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.workers.audit.search_surface as search_surface
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.contracts import (
    ERROR_CREDENTIAL_UNAVAILABLE,
    ERROR_SUBMISSION_UNRECONCILED,
    OUTCOME_AI_OVERVIEW_PRESENT,
    OUTCOME_EXECUTION_FAILURE,
    OUTCOME_NO_AI_OVERVIEW,
    OUTCOME_PROVIDER_ERROR,
    SearchSurfaceSubmission,
)
from app.core.config.dataforseo import pack_credential
from app.core.config.provider_catalog import (
    ENGINE_GOOGLE_AI_OVERVIEW,
    TRANSPORT_DATAFORSEO,
)
from app.core.config.task_queue import (
    TASK_STATUS_AWAITING_PROVIDER_RESULT,
    TASK_STATUS_FAILED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_SUBMISSION_UNCERTAIN,
    TASK_STATUS_SUCCEEDED,
)
from app.core.security import encrypt_secret
from app.models.audit import AuditTask
from app.models.provider import ProviderConnection, ProviderRoute
from app.models.search_surfaces import AioEntityLink, AioObservation
from app.workers.audit_worker import AuditWorker
from tests.component.audit_helpers import seed_audit_fixtures
from tests.fixtures import ai_overview_payloads as payloads

_SECRET = pack_credential(login="user@example.com", password="s3cret")


class _RecordingAdapter:
    """Counts what actually reached the provider.

    Every assertion about double-charging is really an assertion about
    ``submits``, so the stub counts calls rather than simulating billing.
    """

    def __init__(
        self,
        *,
        fetch_payloads: list[dict[str, Any]] | None = None,
        submit_error: ProviderError | None = None,
        fetch_error: ProviderError | None = None,
        listing: dict[str, Any] | None = None,
        list_error: ProviderError | None = None,
    ) -> None:
        self.submits = 0
        self.fetches = 0
        self.lists = 0
        self.last_tag = ""
        self._fetch_payloads = fetch_payloads or []
        self._submit_error = submit_error
        self._fetch_error = fetch_error
        self._listing = listing or {"tasks": []}
        self._list_error = list_error

    async def submit(self, request: Any) -> SearchSurfaceSubmission:
        self.submits += 1
        self.last_tag = request.provider_submission_ref
        if self._submit_error is not None:
            raise self._submit_error
        from datetime import UTC, datetime

        return SearchSurfaceSubmission(
            provider_task_id="provider-task-1",
            submitted_at=datetime.now(UTC),
            provider_cost_microusd=1200,
        )

    async def fetch(self, provider_task_id: str) -> dict[str, Any]:
        self.fetches += 1
        if self._fetch_error is not None:
            raise self._fetch_error
        if not self._fetch_payloads:
            raise AssertionError("fetch called more times than the test scripted")
        return self._fetch_payloads.pop(0)

    async def list_task_ids(self, **_: Any) -> dict[str, Any]:
        self.lists += 1
        if self._list_error is not None:
            raise self._list_error
        return self._listing


@pytest.fixture
def adapter(monkeypatch: pytest.MonkeyPatch):
    """Install one recording adapter and hand it back for assertions."""
    holder: dict[str, _RecordingAdapter] = {}

    def _install(stub: _RecordingAdapter) -> _RecordingAdapter:
        holder["stub"] = stub
        monkeypatch.setattr(
            search_surface,
            "DataForSeoSearchSurfaceAdapter",
            lambda **_: stub,
        )
        return stub

    return _install


async def _seed_search_task(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    active: bool = True,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """One audit with a single Google AI Overview task ready to submit.

    The task is built directly rather than through `create_audit`: selection
    is gated on `adapter_shipped` until activation, and this exercises the
    WORKER, which is a different gate.
    """
    from app.core.config.audits import AUDIT_STATUS_RUNNING
    from app.models.audit import Audit, AuditEngineSnapshot, AuditPromptSnapshot

    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=1)
        connection = ProviderConnection(
            workspace_id=seed.workspace_id,
            label="DataForSEO",
            transport_provider=TRANSPORT_DATAFORSEO,
            api_key_encrypted=encrypt_secret(_SECRET),
            active=active,
            last_test_status="ok",
        )
        session.add(connection)
        await session.flush()
        session.add(
            ProviderRoute(
                workspace_id=seed.workspace_id,
                connection_id=connection.id,
                logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
                transport_provider=TRANSPORT_DATAFORSEO,
                transport_model="google-organic-serp",
                is_default=True,
            )
        )
        audit = Audit(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            status=AUDIT_STATUS_RUNNING,
            trigger="manual",
            configuration={},
        )
        session.add(audit)
        await session.flush()
        prompt_snapshot = AuditPromptSnapshot(
            audit_id=audit.id,
            prompt_index=0,
            text="best value school uniforms",
        )
        engine_snapshot = AuditEngineSnapshot(
            audit_id=audit.id,
            logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
            transport_provider=TRANSPORT_DATAFORSEO,
            transport_model="google-organic-serp",
        )
        session.add_all([prompt_snapshot, engine_snapshot])
        await session.flush()
        task = AuditTask(
            audit_id=audit.id,
            workspace_id=seed.workspace_id,
            prompt_snapshot_id=prompt_snapshot.id,
            engine_snapshot_id=engine_snapshot.id,
            prompt_index=0,
            repetition=0,
            logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
            transport_provider=TRANSPORT_DATAFORSEO,
            transport_model="google-organic-serp",
            prompt_text="best value school uniforms",
            idempotency_key=f"{audit.id}:0:0:{ENGINE_GOOGLE_AI_OVERVIEW}",
            status=TASK_STATUS_QUEUED,
            provider_route_snapshot={"connection_id": str(connection.id)},
            request_snapshot={
                "location_code": 2036,
                "language_code": "en",
                "device": "desktop",
            },
        )
        session.add(task)
        await session.commit()
        return audit.id, task.id, connection.id


async def _task(
    session_factory: async_sessionmaker[AsyncSession], task_id: uuid.UUID
) -> AuditTask:
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        return task


async def _observation(
    session_factory: async_sessionmaker[AsyncSession], task_id: uuid.UUID
) -> AioObservation | None:
    async with session_factory() as session:
        return await session.scalar(
            select(AioObservation).where(AioObservation.task_id == task_id)
        )


def _worker(session_factory: async_sessionmaker[AsyncSession]) -> AuditWorker:
    return AuditWorker(session_factory=session_factory, owner="test-worker")


async def _claim_and_run(
    session_factory: async_sessionmaker[AsyncSession], worker: AuditWorker
) -> int:
    return await worker.run_once()


@pytest.mark.asyncio
async def test_a_submission_parks_awaiting_the_provider_without_spending_an_attempt(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """Polling is free, so waiting for a result must not cost retry budget."""
    stub = adapter(_RecordingAdapter())
    _audit_id, task_id, _ = await _seed_search_task(session_factory)

    await _claim_and_run(session_factory, _worker(session_factory))

    task = await _task(session_factory, task_id)
    assert stub.submits == 1
    assert task.status == TASK_STATUS_AWAITING_PROVIDER_RESULT
    assert task.provider_task_id == "provider-task-1"
    assert task.attempt_count == 0
    # The submission charge is recorded the moment it is known: a task whose
    # retrieval never succeeds has still cost money.
    assert (task.provider_metadata or {}).get(
        "provider_submission_cost_microusd"
    ) == 1200


@pytest.mark.asyncio
async def test_the_submission_intent_is_committed_before_the_post(
    session_factory: async_sessionmaker[AsyncSession], monkeypatch
) -> None:
    """The ordering that makes crash recovery possible at all.

    The adapter raises the instant it is called, standing in for a process
    that died mid-POST. The ref must already be on the row.
    """
    seen: dict[str, Any] = {}

    class _DyingAdapter(_RecordingAdapter):
        async def submit(self, request: Any) -> SearchSurfaceSubmission:
            seen["ref_at_post_time"] = request.provider_submission_ref
            raise ProviderError("boom", error_code="timeout", retryable=True)

    stub = _DyingAdapter()
    monkeypatch.setattr(
        search_surface, "DataForSeoSearchSurfaceAdapter", lambda **_: stub
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)

    await _claim_and_run(session_factory, _worker(session_factory))

    task = await _task(session_factory, task_id)
    assert task.provider_submission_ref
    assert seen["ref_at_post_time"] == task.provider_submission_ref
    # Uncertain, NOT retry: the POST may have landed and been charged.
    assert task.status == TASK_STATUS_SUBMISSION_UNCERTAIN


@pytest.mark.asyncio
async def test_an_uncertain_submission_is_never_resubmitted(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """The single most expensive bug this design exists to prevent."""
    stub = adapter(_RecordingAdapter(listing={"tasks": []}))
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_SUBMISSION_UNCERTAIN
        await session.commit()

    for _ in range(3):
        await _claim_and_run(session_factory, _worker(session_factory))

    # It reconciled repeatedly and never once paid again.
    assert stub.submits == 0
    assert stub.lists >= 1


@pytest.mark.asyncio
async def test_a_reclaimed_task_holding_an_intent_enters_reconciliation(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """However it died.

    The committed intent is the only evidence either way, and it is enough.
    This closes the gap between a handled network timeout and a process that
    died before it could handle anything.
    """
    adapter(_RecordingAdapter())
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    from datetime import UTC, datetime, timedelta

    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        # A worker that was killed: lease held, intent written, no task id.
        task.provider_submission_ref = "audit-ref-1"
        task.status = "running"
        task.lease_owner = "dead-worker"
        task.lease_expires_at = datetime.now(UTC) - timedelta(minutes=5)
        await session.commit()

    worker = _worker(session_factory)
    await worker._queue.release_expired_detailed()

    task = await _task(session_factory, task_id)
    assert task.status == TASK_STATUS_SUBMISSION_UNCERTAIN
    # No attempt spent: nothing failed, the question is simply still open.
    assert task.attempt_count == 0


@pytest.mark.asyncio
async def test_reconciliation_binds_only_on_a_verified_tag_match(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    stub = adapter(
        _RecordingAdapter(
            listing={
                "tasks": [
                    {
                        "result": [
                            {"id": "other-task", "metadata": {"tag": "someone-else"}},
                            {"id": "our-task", "metadata": {"tag": "audit-ref-1"}},
                        ]
                    }
                ]
            }
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_SUBMISSION_UNCERTAIN
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    task = await _task(session_factory, task_id)
    assert task.provider_task_id == "our-task"
    assert stub.submits == 0


@pytest.mark.asyncio
async def test_two_identical_submissions_without_readable_tags_stay_unreconciled(
    session_factory: async_sessionmaker[AsyncSession], adapter, monkeypatch
) -> None:
    """No context-only fallback, ever.

    Same account, prompt, location, language, device and depth — the contexts
    are identical, so binding on anything but the tag would attach a real AI
    Overview to the wrong repetition and never fail loudly.
    """
    from app.core.config import dataforseo as cfg

    monkeypatch.setattr(cfg, "POLL_CEILING", 0)
    adapter(
        _RecordingAdapter(
            listing={
                "tasks": [
                    {
                        "result": [
                            {"id": "task-a", "metadata": {"keyword": "same"}},
                            {"id": "task-b", "metadata": {"keyword": "same"}},
                        ]
                    }
                ]
            }
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_SUBMISSION_UNCERTAIN
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    observation = await _observation(session_factory, task_id)
    assert observation is not None
    assert observation.outcome == OUTCOME_EXECUTION_FAILURE
    assert observation.error_code == ERROR_SUBMISSION_UNRECONCILED
    # Never reported as a measurement.
    assert observation.aio_present is None


@pytest.mark.asyncio
async def test_a_completed_overview_finalizes_with_its_analysis(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(payloads.completed_task(task_id="provider-task-1"))
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_submission_ref = "audit-ref-1"
        task.provider_task_id = "provider-task-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    observation = await _observation(session_factory, task_id)
    assert observation is not None
    assert observation.outcome == OUTCOME_AI_OVERVIEW_PRESENT
    assert observation.aio_present is True
    assert observation.aio_serp_position == 3
    assert observation.reference_count == 5
    # The search context recorded is the FROZEN one, not the live project.
    assert observation.location_code == 2036

    task = await _task(session_factory, task_id)
    assert task.status == TASK_STATUS_SUCCEEDED
    assert task.result_artifact_id is not None
    assert task.answer_text


@pytest.mark.asyncio
async def test_link_rows_come_from_inline_links_and_not_from_references(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(payloads.completed_task(task_id="provider-task-1"))
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    async with session_factory() as session:
        links = (await session.scalars(select(AioEntityLink))).all()
    domains = {link.domain for link in links}
    assert domains == {payloads.BRAND_DOMAIN, payloads.COMPETITOR_DOMAIN}
    # Cited but never linked: proving the two signals stay independent.
    assert "choice.com.au" not in domains


@pytest.mark.asyncio
async def test_a_completed_task_with_no_overview_is_measured_absence(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(
                    payloads.completed_task(
                        task_id="provider-task-1", with_overview=False
                    )
                )
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    observation = await _observation(session_factory, task_id)
    assert observation is not None
    assert observation.outcome == OUTCOME_NO_AI_OVERVIEW
    # The ONLY outcome permitted to say False.
    assert observation.aio_present is False
    task = await _task(session_factory, task_id)
    assert task.status == TASK_STATUS_SUCCEEDED


@pytest.mark.asyncio
async def test_a_pending_task_reparks_without_spending_an_attempt(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    stub = adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(
                    payloads.task_with_status(40602, task_id="provider-task-1")
                )
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    task = await _task(session_factory, task_id)
    assert task.status == TASK_STATUS_AWAITING_PROVIDER_RESULT
    assert task.attempt_count == 0
    assert task.provider_poll_count == 1
    assert stub.submits == 0
    assert await _observation(session_factory, task_id) is None


@pytest.mark.asyncio
async def test_a_definitively_failed_task_finalizes_instead_of_being_repolled(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """Re-polling a task the provider gave up on is the bug this prevents.

    It would burn the poll ceiling and then report `poll_ceiling_exceeded`,
    destroying the real cause.
    """
    stub = adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(
                    payloads.task_with_status(40103, task_id="provider-task-1")
                )
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    observation = await _observation(session_factory, task_id)
    assert observation is not None
    assert observation.outcome == OUTCOME_PROVIDER_ERROR
    # The provider's own code, preserved.
    assert observation.provider_status_code == 40103
    assert observation.aio_present is None
    assert stub.fetches == 1
    assert (await _task(session_factory, task_id)).status == TASK_STATUS_FAILED


@pytest.mark.asyncio
async def test_transient_retrieval_faults_never_resubmit_or_charge_again(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """One submission, several failed polls, exactly one charge.

    Customer consumption is never derived from `attempt_count`.
    """
    stub = adapter(
        _RecordingAdapter(
            fetch_error=ProviderError("flaky", error_code="timeout", retryable=True)
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    for _ in range(3):
        await _claim_and_run(session_factory, _worker(session_factory))

    task = await _task(session_factory, task_id)
    assert stub.submits == 0
    assert task.provider_poll_count >= 1
    # Retry state moved; the customer's attempt budget did not.
    assert task.attempt_count == 0


@pytest.mark.asyncio
async def test_a_rotated_connection_mid_flight_terminates_with_a_name(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """Rather than silently polling a different account.

    DataForSEO task ids are scoped to the account that created them, so a
    different account would answer "task not found" and look like a provider
    fault.
    """
    stub = adapter(_RecordingAdapter())
    _audit_id, task_id, connection_id = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        connection = await session.get(ProviderConnection, connection_id)
        assert task is not None
        assert connection is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.provider_connection_id = connection_id
        task.provider_credential_revision = uuid.uuid4()  # bound at submission
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        # ...and the credential has since been rotated.
        connection.credential_revision = uuid.uuid4()
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    observation = await _observation(session_factory, task_id)
    assert observation is not None
    assert observation.outcome == OUTCOME_EXECUTION_FAILURE
    assert observation.error_code == ERROR_CREDENTIAL_UNAVAILABLE
    assert observation.aio_present is None
    assert stub.fetches == 0


@pytest.mark.asyncio
async def test_a_late_poll_after_finalization_duplicates_nothing(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    payload = payloads.response(payloads.completed_task(task_id="provider-task-1"))
    adapter(_RecordingAdapter(fetch_payloads=[payload, dict(payload)]))
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))
    # Force a second collection of the same finished task.
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        task.lease_owner = None
        await session.commit()
    await _claim_and_run(session_factory, _worker(session_factory))

    async with session_factory() as session:
        observations = (await session.scalars(select(AioObservation))).all()
    assert len(observations) == 1


@pytest.mark.asyncio
async def test_the_poll_ceiling_is_a_named_failure_not_a_silent_absence(
    session_factory: async_sessionmaker[AsyncSession], adapter, monkeypatch
) -> None:
    from app.connectors.search_surfaces.contracts import ERROR_POLL_CEILING_EXCEEDED
    from app.core.config import dataforseo as cfg

    monkeypatch.setattr(cfg, "POLL_CEILING", 2)
    adapter(_RecordingAdapter())
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.provider_poll_count = 2
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    observation = await _observation(session_factory, task_id)
    assert observation is not None
    assert observation.outcome == OUTCOME_EXECUTION_FAILURE
    assert observation.error_code == ERROR_POLL_CEILING_EXCEEDED
    # Giving up is not the same as Google showing nothing.
    assert observation.aio_present is None


async def _seed_connected_project(
    session_factory: async_sessionmaker[AsyncSession], *, location_code: int
):
    """A workspace that CAN reach DataForSEO, with a given search location."""
    from app.models.project import Project

    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=1)
        connection = ProviderConnection(
            workspace_id=seed.workspace_id,
            transport_provider=TRANSPORT_DATAFORSEO,
            api_key_encrypted=encrypt_secret(_SECRET),
            active=True,
            last_test_status="ok",
        )
        session.add(connection)
        await session.flush()
        session.add(
            ProviderRoute(
                workspace_id=seed.workspace_id,
                connection_id=connection.id,
                logical_engine=ENGINE_GOOGLE_AI_OVERVIEW,
                transport_provider=TRANSPORT_DATAFORSEO,
                transport_model="google-organic-serp",
                is_default=True,
            )
        )
        project = await session.get(Project, seed.project_id)
        assert project is not None
        project.serp_location_code = location_code
        project.serp_language_code = "en"
        project.serp_device = "desktop"
        await session.commit()
    return seed


@pytest.mark.asyncio
async def test_a_run_without_configured_credentials_is_rejected_at_admission(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Rather than queueing tasks that can never execute.

    The alternative is a run that submits nothing, retries to exhaustion, and
    reports a provider fault for what is a missing connection.
    """
    from app.core.config.audits import AUDIT_TRIGGER_MANUAL
    from app.domain.audits.creation import create_audit
    from app.domain.audits.errors import AuditValidationError

    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=1)

    async with session_factory() as session:
        with pytest.raises(AuditValidationError, match="No active provider route"):
            await create_audit(
                session,
                trigger=AUDIT_TRIGGER_MANUAL,
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                engines=[ENGINE_GOOGLE_AI_OVERVIEW],
                prompt_set_id=seed.prompt_set_id,
                repetitions=1,
                random_seed="1",
            )


@pytest.mark.asyncio
async def test_a_connected_run_without_a_search_location_is_still_rejected(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Credentials are not the only precondition.

    A project with a working connection but no configured vantage point has
    nowhere to observe FROM, and guessing a market would measure the wrong
    country and present it as the right one.
    """
    from app.core.config.audits import AUDIT_TRIGGER_MANUAL
    from app.domain.audits.creation import create_audit
    from app.domain.audits.errors import AuditValidationError

    seed = await _seed_connected_project(session_factory, location_code=0)

    async with session_factory() as session:
        with pytest.raises(AuditValidationError, match="search location"):
            await create_audit(
                session,
                trigger=AUDIT_TRIGGER_MANUAL,
                workspace_id=seed.workspace_id,
                project_id=seed.project_id,
                engines=[ENGINE_GOOGLE_AI_OVERVIEW],
                prompt_set_id=seed.prompt_set_id,
                repetitions=1,
                random_seed="1",
            )


@pytest.mark.asyncio
async def test_a_fully_configured_run_plans_tasks_with_a_frozen_context(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Activation, end to end: the surface is selectable and plans work.

    The frozen context is the part worth asserting — a queued execution must
    carry what it was asked to measure, not a pointer to settings that can
    change under it.
    """
    from app.core.config.audits import AUDIT_TRIGGER_MANUAL
    from app.domain.audits.creation import create_audit

    seed = await _seed_connected_project(session_factory, location_code=2036)

    async with session_factory() as session:
        audit = await create_audit(
            session,
            trigger=AUDIT_TRIGGER_MANUAL,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=[ENGINE_GOOGLE_AI_OVERVIEW],
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
            random_seed="1",
        )
        audit_id = audit.id

    async with session_factory() as session:
        tasks = (
            await session.scalars(
                select(AuditTask).where(AuditTask.audit_id == audit_id)
            )
        ).all()
    assert tasks
    for task in tasks:
        assert task.logical_engine == ENGINE_GOOGLE_AI_OVERVIEW
        assert task.request_snapshot == {
            "location_code": 2036,
            "language_code": "en",
            "device": "desktop",
        }


@pytest.mark.asyncio
async def test_an_llm_run_is_unaffected_by_the_search_context_gate(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The gate must not become a new precondition for the shipped engines."""
    from app.core.config.audits import AUDIT_TRIGGER_MANUAL
    from app.domain.audits.creation import create_audit

    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=1)

    async with session_factory() as session:
        audit = await create_audit(
            session,
            trigger=AUDIT_TRIGGER_MANUAL,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            prompt_set_id=seed.prompt_set_id,
            repetitions=1,
            random_seed="1",
        )
    assert audit is not None


@pytest.mark.asyncio
async def test_the_surface_folds_into_the_existing_projections_unchanged(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """The plan's central structural claim, checked rather than assumed.

    A fourth surface was supposed to need no new scoring path and no formula
    change: it produces a `ResponseAnalysis` with mentions and citations
    through the unchanged scorer, and every downstream projection groups on
    whatever distinct engines exist. This asserts that end to end.
    """
    from app.models.analysis import Citation, ResponseAnalysis

    adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(payloads.completed_task(task_id="provider-task-1"))
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    async with session_factory() as session:
        analysis = await session.scalar(
            select(ResponseAnalysis).where(ResponseAnalysis.task_id == task_id)
        )
        assert analysis is not None
        # The engine dimension is a plain string column with no CHECK
        # constraint, so the fourth surface simply appears in it.
        assert analysis.logical_engine == ENGINE_GOOGLE_AI_OVERVIEW
        assert analysis.artifact_id is not None

        citations = (
            await session.scalars(
                select(Citation).where(Citation.analysis_id == analysis.id)
            )
        ).all()

    # Root references became citations through the SAME path the LLM engines
    # use — five of them, matching the block's root reference list.
    assert len(citations) == 5
    # The exact citation domains. The two Google Shopping URLs collapse to one
    # `google.com` identity and are present as citations, but they are
    # Google's rather than the brand's.
    assert {citation.domain for citation in citations} == {
        payloads.BRAND_DOMAIN,
        payloads.COMPETITOR_DOMAIN,
        "choice.com.au",
        "google.com",
    }


@pytest.mark.asyncio
async def test_a_measured_absence_scores_as_a_completed_empty_answer(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """Deliberate, and stated so it is not discovered later as a surprise.

    A successful `no_ai_overview` is a completed execution with an empty
    answer, so it contributes measured absence to the per-prompt components
    exactly as an answer that never names the brand does.
    """
    from app.models.analysis import ResponseAnalysis

    adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(
                    payloads.completed_task(
                        task_id="provider-task-1", with_overview=False
                    )
                )
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    async with session_factory() as session:
        analysis = await session.scalar(
            select(ResponseAnalysis).where(ResponseAnalysis.task_id == task_id)
        )
    assert analysis is not None
    assert analysis.logical_engine == ENGINE_GOOGLE_AI_OVERVIEW
    # A real execution that measured nothing — not a failure, and not skipped.
    task = await _task(session_factory, task_id)
    assert task.answer_text == ""
    assert task.status == TASK_STATUS_SUCCEEDED


@pytest.mark.asyncio
async def test_a_failed_observation_produces_no_analysis_but_is_still_recorded(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """Why the observation is keyed on the task and not the analysis."""
    from app.models.analysis import ResponseAnalysis

    adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(
                    payloads.task_with_status(40103, task_id="provider-task-1")
                )
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    async with session_factory() as session:
        analysis = await session.scalar(
            select(ResponseAnalysis).where(ResponseAnalysis.task_id == task_id)
        )
    assert analysis is None
    # The outcome is still recorded — which it could not be if it hung off
    # the analysis row.
    observation = await _observation(session_factory, task_id)
    assert observation is not None
    assert observation.outcome == OUTCOME_PROVIDER_ERROR


@pytest.mark.asyncio
async def test_reconciliation_does_not_spend_the_polling_budget(
    session_factory: async_sessionmaker[AsyncSession], adapter, monkeypatch
) -> None:
    """One counter, two phases — they must not share a budget.

    A submission reconciled on its LAST sweep would otherwise enter polling
    already at the ceiling and finalize as `poll_ceiling_exceeded` before a
    single fetch, throwing away a paid, matched provider task and naming the
    wrong cause.
    """
    from app.core.config import dataforseo as cfg

    monkeypatch.setattr(cfg, "POLL_CEILING", 3)
    adapter(
        _RecordingAdapter(
            listing={
                "tasks": [
                    {"result": [{"id": "our-task", "metadata": {"tag": "audit-ref-1"}}]}
                ]
            }
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_SUBMISSION_UNCERTAIN
        # Every sweep so far has been spent looking for the task.
        task.provider_poll_count = 3
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    task = await _task(session_factory, task_id)
    assert task.provider_task_id == "our-task"
    # The polling phase starts fresh, so the very next claim actually fetches.
    assert task.provider_poll_count == 0
    assert await _observation(session_factory, task_id) is None


@pytest.mark.asyncio
async def test_a_recorded_observation_repairs_a_stranded_queue_row(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """The observation and the queue status commit separately.

    A lease lost between them leaves a recorded observation on a claimable
    task. Without repair it would be polled, hit the existing-observation
    branch, return without terminalizing, and repeat until the sweeper marked
    a SUCCESSFUL observation as failed.
    """
    payload = payloads.response(payloads.completed_task(task_id="provider-task-1"))
    adapter(_RecordingAdapter(fetch_payloads=[payload, dict(payload)]))
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    # Simulate the queue write having been lost mid-run: the observation
    # stands, the run is still in flight, and the row is claimable again.
    async with session_factory() as session:
        from app.core.config.audits import AUDIT_STATUS_RUNNING
        from app.models.audit import Audit

        task = await session.get(AuditTask, task_id)
        audit = await session.get(Audit, _audit_id)
        assert task is not None
        assert audit is not None
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        task.completed_at = None
        task.lease_owner = None
        audit.status = AUDIT_STATUS_RUNNING
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    task = await _task(session_factory, task_id)
    # Terminal again, and terminal as the SUCCESS it actually was.
    assert task.status == TASK_STATUS_SUCCEEDED
    async with session_factory() as session:
        observations = (await session.scalars(select(AioObservation))).all()
    assert len(observations) == 1


@pytest.mark.asyncio
async def test_the_execution_dto_exposes_the_search_surface_outcome(
    session_factory: async_sessionmaker[AsyncSession], adapter
) -> None:
    """So the client never has to infer absence from an empty answer.

    An overview that was present but carried no extractable text looks
    identical to a measured absence from the outside; only this token
    separates them.
    """
    from app.domain.audits.schemas import AuditTaskResponse

    adapter(
        _RecordingAdapter(
            fetch_payloads=[
                payloads.response(
                    payloads.completed_task(
                        task_id="provider-task-1", with_overview=False
                    )
                )
            ]
        )
    )
    _audit_id, task_id, _ = await _seed_search_task(session_factory)
    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        assert task is not None
        task.provider_task_id = "provider-task-1"
        task.provider_submission_ref = "audit-ref-1"
        task.status = TASK_STATUS_AWAITING_PROVIDER_RESULT
        await session.commit()

    await _claim_and_run(session_factory, _worker(session_factory))

    async with session_factory() as session:
        task = await session.get(AuditTask, task_id)
        dto = AuditTaskResponse.model_validate(task)
    assert dto.search_surface_outcome == OUTCOME_NO_AI_OVERVIEW
    assert dto.answer_text == ""
