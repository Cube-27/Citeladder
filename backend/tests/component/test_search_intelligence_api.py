"""Python-owned Search Intelligence: cost review creation and paid execution.

Confirmation, cancellation and the persisted reads are TypeScript-owned; the
TypeScript PostgreSQL suite covers them. These tests seed those transitions
through `search_intelligence_helpers` and exercise the review route and the
executor that remain here.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from app.connectors.search_intelligence_dataforseo import ResearchResponse
from app.core.config.dataforseo import pack_credential
from app.core.security import encrypt_secret
from app.domain.agent.context_refs import SearchIntelligenceReference
from app.domain.agent.search_intelligence_context import (
    SearchIntelligenceEvidenceNotFound,
    search_intelligence_context,
)
from app.domain.demand.search_intelligence import executor as executor_module
from app.models.provider import ProviderConnection
from app.models.search_intelligence import (
    SearchIntelligenceCall,
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
    SearchIntelligenceRun,
)
from tests.component.auth_helpers import register_and_login
from tests.component.search_intelligence_helpers import cancel_run, queue_confirmed_run


async def _connected_project(client: httpx.AsyncClient, db_session, name: str) -> str:
    response = await client.post(
        "/api/v1/projects",
        json={"name": name, "website_url": "https://www.example.com"},
    )
    assert response.status_code == 201, response.text
    project = response.json()
    db_session.add(
        ProviderConnection(
            workspace_id=uuid.UUID(project["workspace_id"]),
            label="DataForSEO",
            transport_provider="dataforseo",
            api_key_encrypted=encrypt_secret(
                pack_credential(login="test@example.com", password="not-a-real-secret")
            ),
            active=True,
            last_test_status="ok",
        )
    )
    await db_session.commit()
    return f"/api/v1/projects/{project['id']}/search-intelligence"


async def _review(
    client: httpx.AsyncClient, base: str, key: str, **payload: object
) -> httpx.Response:
    return await client.post(
        f"{base}/reviews",
        headers={"Idempotency-Key": key},
        json={
            "owned_target_id": "primary",
            "location_code": 2840,
            "language_code": "en",
            **payload,
        },
    )


async def _forbidden_live_call(**_kwargs: object) -> object:
    raise AssertionError("review path called the paid provider")


@pytest.mark.asyncio
@pytest.mark.parametrize("response_missing", [False, True])
async def test_cancellation_between_datasets_prevents_next_paid_call(
    client: httpx.AsyncClient,
    db_session,
    session_factory,
    monkeypatch: pytest.MonkeyPatch,
    response_missing: bool,
) -> None:
    await register_and_login(client, f"search-cancel-{response_missing}@example.com")
    base = await _connected_project(client, db_session, "SearchCancel")
    review = await _review(
        client,
        base,
        "cancel-between",
        reuse_recent=False,
        datasets=[
            {"kind": "ranking_keywords", "depth": 1},
            {"kind": "backlink_summary", "depth": 1},
        ],
    )
    assert review.status_code == 201, review.text
    run_id = uuid.UUID(review.json()["id"])
    task = await queue_confirmed_run(session_factory, run_id)
    calls = 0

    async def cancel_after_first_call(**_kwargs: object) -> ResearchResponse | None:
        nonlocal calls
        calls += 1
        await cancel_run(session_factory, run_id)
        if response_missing:
            async with session_factory() as session:
                cancelled = await session.get(SearchIntelligenceRun, run_id)
                assert cancelled is not None
                cancelled.error_code = "prior_error"
                cancelled.error_detail = "Prior cancellation detail"
                cancelled.completed_at = datetime(2025, 1, 1, tzinfo=UTC)
                await session.commit()
            return None
        return ResearchResponse(
            body={"tasks": [{"result": [{"items": [], "total_count": 0}]}]},
            response_sha256="first-response",
            provider_task_id="first-task",
            cost_usd=Decimal("0.001"),
        )

    monkeypatch.setattr(executor_module, "execute_live", cancel_after_first_call)
    await executor_module.execute_search_intelligence(session_factory, task)
    async with session_factory() as session:
        finished = await session.get(SearchIntelligenceRun, run_id)
        assert finished is not None
        assert finished.status == "cancelled"
        assert finished.completed_calls == (0 if response_missing else 1)
        if response_missing:
            assert finished.uncertain_calls == 1
            assert finished.error_code == "prior_error"
            assert finished.error_detail == "Prior cancellation detail"
            assert finished.completed_at == datetime(2025, 1, 1, tzinfo=UTC)
    assert calls == 1


def _dispatched_call(
    run: SearchIntelligenceRun,
    dataset: SearchIntelligenceDataset,
    plan: dict,
    **response: object,
) -> SearchIntelligenceCall:
    return SearchIntelligenceCall(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        run_id=run.id,
        dataset_id=dataset.id,
        request_key=f"{plan['dataset_key']}:{plan['page']}",
        sequence=0,
        status="dispatched",
        endpoint=plan["endpoint"],
        sanitized_request=plan["request"],
        estimated_cost_usd=Decimal(plan["estimated_cost_usd"]),
        **response,
    )


@pytest.mark.asyncio
async def test_review_is_provider_free_and_execution_recovers_without_resend(
    client: httpx.AsyncClient,
    db_session,
    session_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await register_and_login(client, "search-owner@example.com")
    base = await _connected_project(client, db_session, "SearchOwner")
    monkeypatch.setattr(
        "app.connectors.search_intelligence_dataforseo.execute_live",
        _forbidden_live_call,
    )
    paged = {
        "reuse_recent": False,
        "datasets": [{"kind": "ranking_keywords", "depth": 1001}],
    }
    review = await _review(client, base, "provider-free-review", **paged)
    assert review.status_code == 201, review.text
    body = review.json()
    assert body["status"] == "reviewed"
    assert body["planned_calls"] == 2
    assert Decimal(body["estimated_cost_usd"]) == Decimal("0.14412")
    repeated = await _review(client, base, "provider-free-review", **paged)
    assert repeated.status_code == 201
    assert repeated.json()["id"] == body["id"]

    # A call recorded as dispatched without a saved response is never resent.
    run_id = uuid.UUID(body["id"])
    task = await queue_confirmed_run(session_factory, run_id)
    run = await db_session.get(SearchIntelligenceRun, run_id)
    assert run is not None
    plan = run.call_plan[0]
    dataset = executor_module._dataset_from_plan(run, plan)
    db_session.add(dataset)
    await db_session.flush()
    db_session.add(_dispatched_call(run, dataset, plan))
    await db_session.commit()
    monkeypatch.setattr(executor_module, "execute_live", _forbidden_live_call)
    await executor_module.execute_search_intelligence(session_factory, task)
    async with session_factory() as verification_session:
        recovered = await verification_session.get(SearchIntelligenceRun, run_id)
        assert recovered is not None
        assert recovered.status == "uncertain"
        assert recovered.uncertain_calls == 1

    # A saved response is published without another paid call.
    saved_review = await _review(
        client,
        base,
        "saved-response-replay",
        reuse_recent=False,
        datasets=[{"kind": "ranking_keywords", "depth": 1}],
    )
    assert saved_review.status_code == 201, saved_review.text
    saved_id = uuid.UUID(saved_review.json()["id"])
    saved_task = await queue_confirmed_run(session_factory, saved_id)
    async with session_factory() as saved_session:
        saved_run = await saved_session.get(SearchIntelligenceRun, saved_id)
        assert saved_run is not None
        saved_plan = saved_run.call_plan[0]
        saved_dataset = executor_module._dataset_from_plan(saved_run, saved_plan)
        saved_session.add(saved_dataset)
        await saved_session.flush()
        saved_session.add(
            _dispatched_call(
                saved_run,
                saved_dataset,
                saved_plan,
                sanitized_response={
                    "tasks": [{"result": [{"items": [], "total_count": 0}]}]
                },
                response_sha256="saved-response",
                provider_reported_cost_usd=Decimal("0.001"),
            )
        )
        await saved_session.commit()
    await executor_module.execute_search_intelligence(session_factory, saved_task)
    async with session_factory() as verification_session:
        saved_result = await verification_session.get(SearchIntelligenceRun, saved_id)
        assert saved_result is not None
        assert saved_result.status == "succeeded"
        saved_projection = await verification_session.get(
            SearchIntelligenceDataset, saved_dataset.id
        )
        assert saved_projection is not None
        assert saved_projection.coverage == "empty"

    # A complete recent snapshot of the same scope is reused, not bought again.
    await db_session.rollback()
    reusable = SearchIntelligenceDataset(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        run_id=run.id,
        dataset_kind="ranking_keywords",
        scope_hash=body["call_plan"][0]["scope_hash"],
        target_domain="example.com",
        target_hostname="www.example.com",
        target_origin="https://www.example.com",
        comparison_origin="",
        location_code=2840,
        language_code="en",
        status="published",
        coverage="complete",
        requested_rows=1001,
        raw_rows_received=1001,
        unique_rows_saved=1001,
        truncated=False,
        summary={},
        provider_filters={},
        published_at=datetime.now(UTC),
    )
    db_session.add(reusable)
    await db_session.commit()
    reused_review = await _review(
        client,
        base,
        "reuse-complete-snapshot",
        reuse_recent=True,
        datasets=[{"kind": "ranking_keywords", "depth": 1001}],
    )
    assert reused_review.status_code == 201, reused_review.text
    assert reused_review.json()["planned_calls"] == 0
    assert reused_review.json()["reused_datasets"] == [
        {
            "dataset_id": str(reusable.id),
            "dataset_kind": "ranking_keywords",
            "published_at": reusable.published_at.isoformat(),
        }
    ]

    # Concurrent reviews under one key create one run; a capacity wait never
    # revives a run cancelled meanwhile.
    concurrent = {"datasets": [{"kind": "ranking_keywords", "depth": 10}]}
    repeated_reviews = await asyncio.gather(
        *[_review(client, base, "concurrent-review", **concurrent) for _ in range(2)]
    )
    assert [response.status_code for response in repeated_reviews] == [201, 201]
    cancelled_id = uuid.UUID(repeated_reviews[0].json()["id"])
    assert repeated_reviews[1].json()["id"] == str(cancelled_id)
    await cancel_run(session_factory, cancelled_id)
    await executor_module._mark_capacity_wait(session_factory, cancelled_id, 0)
    async with session_factory() as verification_session:
        cancelled = await verification_session.get(SearchIntelligenceRun, cancelled_id)
        assert cancelled is not None
        assert cancelled.status == "cancelled"

    # The Agent reads exactly the referenced rows, only within their workspace.
    rows = [
        SearchIntelligenceRow(
            workspace_id=reusable.workspace_id,
            project_id=reusable.project_id,
            dataset_id=reusable.id,
            provider_row_key=f"keyword:{index}",
            row_kind="ranking_keywords",
            keyword=f"keyword {index}",
        )
        for index in range(2)
    ]
    db_session.add_all(rows)
    await db_session.commit()
    reference = SearchIntelligenceReference(
        dataset_id=reusable.id, row_ids=[rows[1].id]
    )
    evidence_context = await search_intelligence_context(
        db_session, reusable.workspace_id, reusable.project_id, reference
    )
    assert "keyword 1" in evidence_context
    assert "keyword 0" not in evidence_context
    with pytest.raises(SearchIntelligenceEvidenceNotFound):
        await search_intelligence_context(
            db_session, uuid.uuid4(), reusable.project_id, reference
        )

    client.cookies.clear()
    await register_and_login(client, "search-outsider@example.com")
    outsider = await _review(client, base, "outsider", **concurrent)
    assert outsider.status_code == 404
