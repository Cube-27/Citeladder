from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import select

from app.core.config.dataforseo import pack_credential
from app.core.security import encrypt_secret
from app.domain.demand.search_intelligence import executor as executor_module
from app.models.analytics import AnalyticsTask
from app.models.provider import ProviderConnection
from app.models.search_intelligence import (
    SearchIntelligenceCall,
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
    SearchIntelligenceRun,
)
from tests.component.auth_helpers import register_and_login


async def _project(client: httpx.AsyncClient, name: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/projects",
        json={"name": name, "website_url": "https://www.example.com"},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_review_is_provider_free_and_reads_are_workspace_scoped(
    client: httpx.AsyncClient,
    db_session,
    session_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await register_and_login(client, "search-owner@example.com")
    project = await _project(client, "SearchOwner")
    connection = ProviderConnection(
        workspace_id=uuid.UUID(project["workspace_id"]),
        label="DataForSEO",
        transport_provider="dataforseo",
        api_key_encrypted=encrypt_secret(
            pack_credential(login="test@example.com", password="not-a-real-secret")
        ),
        active=True,
        last_test_status="ok",
    )
    db_session.add(connection)
    await db_session.commit()

    async def forbidden_live_call(**_kwargs: object) -> object:
        raise AssertionError("review/read path called the paid provider")

    monkeypatch.setattr(
        "app.connectors.search_intelligence_dataforseo.execute_live",
        forbidden_live_call,
    )
    base = f"/api/v1/projects/{project['id']}/search-intelligence"
    readiness = await client.get(base)
    assert readiness.status_code == 200, readiness.text
    assert readiness.json()["connected"] is True

    review = await client.post(
        f"{base}/reviews",
        headers={"Idempotency-Key": "provider-free-review"},
        json={
            "action": "analysis",
            "owned_target_id": "primary",
            "reuse_recent": False,
            "location_code": 2840,
            "language_code": "en",
            "datasets": [{"kind": "ranking_keywords", "depth": 1001}],
        },
    )
    assert review.status_code == 201, review.text
    body = review.json()
    assert body["status"] == "reviewed"
    assert body["planned_calls"] == 2
    assert Decimal(body["estimated_cost_usd"]) == Decimal("0.14412")

    repeated = await client.post(
        f"{base}/reviews",
        headers={"Idempotency-Key": "provider-free-review"},
        json={
            "action": "analysis",
            "owned_target_id": "primary",
            "reuse_recent": False,
            "location_code": 2840,
            "language_code": "en",
            "datasets": [{"kind": "ranking_keywords", "depth": 1001}],
        },
    )
    assert repeated.status_code == 201
    assert repeated.json()["id"] == body["id"]

    confirmed = await client.post(f"{base}/runs/{body['id']}/confirm", json={})
    assert confirmed.status_code == 202, confirmed.text
    async with session_factory() as state_session:
        run = await state_session.get(SearchIntelligenceRun, uuid.UUID(body["id"]))
        assert run is not None and run.analytics_task_id is not None
        task = await state_session.scalar(
            select(AnalyticsTask).where(AnalyticsTask.id == run.analytics_task_id)
        )
        assert task is not None
    plan = run.call_plan[0]
    dataset = executor_module._dataset_from_plan(run, plan)
    db_session.add(dataset)
    await db_session.flush()
    db_session.add(
        SearchIntelligenceCall(
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
        )
    )
    await db_session.commit()
    monkeypatch.setattr(executor_module, "execute_live", forbidden_live_call)
    await executor_module.execute_search_intelligence(session_factory, task)
    async with session_factory() as verification_session:
        recovered = await verification_session.get(SearchIntelligenceRun, run.id)
        assert recovered is not None
        assert recovered.status == "uncertain"
        assert recovered.uncertain_calls == 1

    await db_session.rollback()
    reviewed_run = await db_session.get(SearchIntelligenceRun, uuid.UUID(body["id"]))
    assert reviewed_run is not None
    first_plan = body["call_plan"][0]
    reusable = SearchIntelligenceDataset(
        workspace_id=reviewed_run.workspace_id,
        project_id=reviewed_run.project_id,
        run_id=reviewed_run.id,
        dataset_kind="ranking_keywords",
        scope_hash=first_plan["scope_hash"],
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
    reused_review = await client.post(
        f"{base}/reviews",
        headers={"Idempotency-Key": "reuse-complete-snapshot"},
        json={
            "action": "analysis",
            "owned_target_id": "primary",
            "reuse_recent": True,
            "location_code": 2840,
            "language_code": "en",
            "datasets": [{"kind": "ranking_keywords", "depth": 1001}],
        },
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
    rows_url = f"{base}/datasets/{reusable.id}/rows"
    first_page = await client.get(rows_url, params={"limit": 1})
    assert first_page.status_code == 200
    first = first_page.json()
    second_page = await client.get(
        rows_url, params={"limit": 1, "cursor": first["next_cursor"]}
    )
    assert second_page.status_code == 200
    second = second_page.json()
    assert second["next_cursor"] is None
    assert {row["id"] for row in first["rows"] + second["rows"]} == {
        str(row.id) for row in rows
    }
    for cursor in ("a", "!!!!", base64.urlsafe_b64encode(b"\xff").decode()):
        invalid = await client.get(rows_url, params={"cursor": cursor})
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "invalid_cursor"

    client.cookies.clear()
    await register_and_login(client, "search-outsider@example.com")
    assert (await client.get(base)).status_code == 404
    assert (await client.get(f"{base}/runs/{body['id']}")).status_code == 404
    assert (await client.get(rows_url)).status_code == 404
