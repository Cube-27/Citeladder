"""Paid response accounting and review scope regressions at the database boundary."""

import uuid
from dataclasses import replace
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.connectors.search_intelligence_dataforseo import ResearchResponse
from app.core.config.dataforseo import pack_credential
from app.core.security import encrypt_secret
from app.domain.demand.search_intelligence import executor, service
from app.models.analytics import AnalyticsTask
from app.models.brand import Competitor
from app.models.project import Project
from app.models.provider import ProviderConnection
from app.models.search_intelligence import (
    SearchIntelligenceCall,
    SearchIntelligenceDataset,
    SearchIntelligenceRun,
)
from tests.component.auth_helpers import register_and_login


async def connected_project(client, db_session):
    await register_and_login(client, "search-results@example.com")
    response = await client.post(
        "/api/v1/projects",
        json={"name": "Results", "website_url": "https://www.example.com"},
    )
    assert response.status_code == 201
    project = response.json()
    db_session.add(
        ProviderConnection(
            workspace_id=uuid.UUID(project["workspace_id"]),
            label="DataForSEO",
            transport_provider="dataforseo",
            api_key_encrypted=encrypt_secret(
                pack_credential(login="test@example.com", password="test-only")
            ),
            active=True,
            last_test_status="ok",
        )
    )
    await db_session.commit()
    return project, f"/api/v1/projects/{project['id']}/search-intelligence"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("kind", "result", "coverage", "status"),
    [
        (
            "footprint",
            {
                "items": [
                    {
                        "subdomain": "www.example.com",
                        "metrics": {"organic": {"count": 4233, "etv": 8632.703566}},
                    }
                ],
                "total_count": 1,
            },
            "complete",
            "succeeded",
        ),
        (
            "backlink_summary",
            {"backlinks": 0, "referring_main_domains": 0},
            "complete",
            "succeeded",
        ),
        ("backlink_summary", None, "unknown", "partial"),
        ("ranking_keywords", {"items": [], "total_count": 0}, "empty", "succeeded"),
        (
            "ranking_keywords",
            {
                "items": [
                    {
                        "keyword_data": {"keyword": "outside"},
                        "ranked_serp_element": {
                            "serp_item": {"url": "https://other.test/page"}
                        },
                    }
                ]
            },
            "unknown",
            "partial",
        ),
    ],
)
async def test_saved_response_preserves_cost_and_result_state(
    client, db_session, session_factory, monkeypatch, kind, result, coverage, status
):
    _, base = await connected_project(client, db_session)
    review = await client.post(
        f"{base}/reviews",
        headers={"Idempotency-Key": "result"},
        json={
            "location_code": 2036,
            "language_code": "en",
            "reuse_recent": False,
            "datasets": [{"kind": kind, "depth": 1}],
        },
    )
    assert review.status_code == 201, review.text
    run_id = uuid.UUID(review.json()["id"])
    confirmed = await client.post(f"{base}/runs/{run_id}/confirm", json={})
    assert confirmed.status_code == 202
    body = {"tasks": [{"result": [result] if result is not None else None}]}
    paid_call = AsyncMock(
        return_value=ResearchResponse(
            body, "saved-response", "task", Decimal("0.01"), "task"
        )
    )
    monkeypatch.setattr(executor, "execute_live", paid_call)
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id)
        task = await session.get(AnalyticsTask, run.analytics_task_id)
    await executor.execute_search_intelligence(session_factory, task)
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id)
        dataset = await session.scalar(
            select(SearchIntelligenceDataset).where(
                SearchIntelligenceDataset.run_id == run_id
            )
        )
        call = await session.scalar(
            select(SearchIntelligenceCall).where(
                SearchIntelligenceCall.run_id == run_id
            )
        )
        assert run.status == status
        assert run.provider_reported_cost_usd == Decimal("0.01")
        assert dataset.coverage == coverage
        assert call.sanitized_response == body
        assert call.dataset_id == dataset.id
        if kind == "footprint":
            assert dataset.summary["organic_keywords"] == 4233
            assert dataset.raw_rows_received == 1
            assert dataset.unique_rows_saved == 0
    paid_call.assert_awaited_once()


@pytest.mark.asyncio
async def test_review_inherits_market_and_freezes_resolved_competitor(
    client, db_session, monkeypatch
):
    project, base = await connected_project(client, db_session)
    row = await db_session.get(Project, uuid.UUID(project["id"]))
    row.serp_location_code = 2036
    row.serp_language_code = "en"
    competitor = Competitor(project_id=row.id, name="Rival", domains=["example.org"])
    db_session.add(competitor)
    await db_session.commit()

    async def resolve(target):
        return replace(
            target, hostname="www.example.org", origin="https://www.example.org"
        )

    resolver = AsyncMock(side_effect=resolve)
    monkeypatch.setattr(service, "resolve_competitor", resolver)
    readiness = await client.get(base)
    assert readiness.json()["preferences"]["location_code"] == 2036
    resolver.assert_not_awaited()
    payload = {
        "datasets": [
            {"kind": "footprint", "competitor_id": str(competitor.id)},
            {
                "kind": "shared_keywords",
                "competitor_id": str(competitor.id),
                "depth": 100,
            },
        ]
    }
    review = await client.post(
        f"{base}/reviews", headers={"Idempotency-Key": "resolved"}, json=payload
    )
    assert review.status_code == 201, review.text
    plan = review.json()["call_plan"]
    assert plan[0]["request"]["location_code"] == 2036
    assert plan[0]["request"]["filters"] == ["subdomain", "=", "www.example.org"]
    assert plan[1]["request"]["pages"]["1"] == "https://www.example.org/*"
    repeat = await client.post(
        f"{base}/reviews", headers={"Idempotency-Key": "resolved"}, json=payload
    )
    assert repeat.json()["id"] == review.json()["id"]
    resolver.assert_awaited_once()
