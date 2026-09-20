"""Paid response accounting and review scope regressions at the database boundary."""

import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
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
from app.orchestration import provider_capacity
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
        "research_scope": "exact_host",
        "datasets": [
            {"kind": "footprint", "competitor_id": str(competitor.id)},
            {
                "kind": "shared_keywords",
                "competitor_id": str(competitor.id),
                "depth": 100,
            },
        ],
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


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["remove", "invalidate", "origin"])
async def test_roster_edit_during_resolution_requires_new_review(
    client, db_session, session_factory, monkeypatch, change
):
    project, base = await connected_project(client, db_session)
    competitor = Competitor(
        project_id=uuid.UUID(project["id"]), name="Rival", domains=["example.org"]
    )
    db_session.add(competitor)
    await db_session.commit()
    competitor_id = competitor.id

    async def resolve(target):
        # Independent transaction while the review has released its transaction.
        async with session_factory() as writer:
            row = await writer.get(Competitor, competitor_id)
            if change == "remove":
                await writer.delete(row)
            else:
                row.domains = [
                    "blog.example.org" if change == "invalidate" else "www.example.org"
                ]
            await writer.commit()
        return target

    monkeypatch.setattr(service, "resolve_competitor", resolve)
    paid = AsyncMock(side_effect=AssertionError("unreviewed paid call"))
    monkeypatch.setattr(executor, "execute_live", paid)
    response = await client.post(
        f"{base}/reviews",
        headers={"Idempotency-Key": "roster-race"},
        json={"datasets": [{"kind": "footprint", "competitor_id": str(competitor_id)}]},
    )
    assert response.status_code == 422
    assert "target_changed" in response.text
    async with session_factory() as reader:
        assert (
            await reader.scalar(
                select(SearchIntelligenceRun).where(
                    SearchIntelligenceRun.project_id == uuid.UUID(project["id"])
                )
            )
            is None
        )
    paid.assert_not_awaited()


@pytest.mark.asyncio
async def test_new_datasets_publish_exact_call_provenance_and_saved_filters(
    client, db_session, session_factory, monkeypatch
):
    _, base = await connected_project(client, db_session)
    capacity_time = [datetime(2026, 9, 20, tzinfo=UTC)]
    monkeypatch.setattr(provider_capacity, "_utcnow", lambda: capacity_time[0])
    monkeypatch.setattr(service, "_utcnow", lambda: datetime(2026, 9, 20, tzinfo=UTC))
    response = await client.post(
        f"{base}/reviews",
        headers={"Idempotency-Key": "new-datasets"},
        json={
            "location_code": 2036,
            "language_code": "en",
            "datasets": [
                {"kind": "organic_pages", "depth": 100},
                {"kind": "backlinks", "depth": 100, "grouping": "one_per_domain"},
                {"kind": "backlink_history"},
            ],
        },
    )
    assert response.status_code == 201, response.text
    reviewed = response.json()
    assert reviewed["frozen_scope"]["research_scope"] == "domain_subdomains"
    assert reviewed["call_plan"][1]["request"]["mode"] == "one_per_domain"
    assert reviewed["call_plan"][2]["request"]["date_to"] == "2026-09-19"
    fixtures = {
        "relevant_pages": {
            "items": [
                {
                    "page_address": "https://shop.example.com/one",
                    "metrics": {"organic": {"count": 22, "etv": 100.25}},
                },
                {
                    "page_address": "https://example.com/needle",
                    "metrics": {"organic": {"count": 12, "etv": 50}},
                },
                {
                    "page_address": "https://example.com/needle-two",
                    "metrics": {"organic": {"count": 2, "etv": None}},
                },
            ],
            "total_count": 3,
        },
        "backlinks": {
            "items": [
                {
                    "url_from": "https://external.test/a",
                    "domain_from": "external.test",
                    "url_to": "https://shop.example.com/one",
                    "anchor": "=SUM(A1)",
                    "rank": 65,
                    "page_from_rank": 40,
                    "dofollow": False,
                    "links_count": 3,
                    "first_seen": "2026-08-01 00:00:00 +00:00",
                }
            ],
            "total_count": 800,
        },
        "history": {
            "items": [
                {
                    "date": "2026-06-30 00:00:00 +00:00",
                    "backlinks": 100,
                    "referring_domains": 40,
                    "new_backlinks": 5,
                },
                {
                    "date": "2026-08-31 00:00:00 +00:00",
                    "backlinks": 120,
                    "referring_domains": 45,
                    "lost_backlinks": 2,
                },
            ]
        },
    }

    async def live(**kwargs):
        capacity_time[0] += timedelta(seconds=2)
        result = fixtures[kwargs["endpoint"].split("/")[-2]]
        return ResearchResponse(
            {"tasks": [{"result": [result]}]},
            "response",
            "task",
            Decimal("0.001"),
            "task",
        )

    paid = AsyncMock(side_effect=live)
    monkeypatch.setattr(executor, "execute_live", paid)
    run_id = uuid.UUID(reviewed["id"])
    assert (
        await client.post(f"{base}/runs/{run_id}/confirm", json={})
    ).status_code == 202
    async with session_factory() as session:
        run = await session.get(SearchIntelligenceRun, run_id)
        task = await session.get(AnalyticsTask, run.analytics_task_id)
    await executor.execute_search_intelligence(session_factory, task)
    saved = (await client.get(base)).json()["datasets"]
    assert {item["dataset_kind"] for item in saved} == {
        "organic_pages",
        "backlinks",
        "backlink_history",
    }
    assert all(item["research_scope"] == "domain_subdomains" for item in saved)
    organic = next(item for item in saved if item["dataset_kind"] == "organic_pages")
    url = f"{base}/datasets/{organic['id']}/rows"
    filtered = (
        await client.get(url, params={"search": "needle", "limit": 1, "sort": "etv"})
    ).json()
    assert filtered["dataset"]["filtered_saved_count"] == 2
    assert filtered["rows"][0]["url"].endswith("/needle")
    assert filtered["rows"][0]["call_id"] is not None
    assert filtered["rows"][0]["organic_keywords"] == 12
    cursor = filtered["next_cursor"]
    assert cursor
    assert (
        await client.get(
            url,
            params={"cursor": cursor, "search": "different", "limit": 1, "sort": "etv"},
        )
    ).status_code == 422
    second = (
        await client.get(
            url,
            params={"cursor": cursor, "search": "needle", "limit": 1, "sort": "etv"},
        )
    ).json()
    assert second["rows"][0]["url"].endswith("needle-two")
    assert second["rows"][0]["etv"] is None
    assert paid.await_count == 3
