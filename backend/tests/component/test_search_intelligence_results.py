"""Persisted Search Intelligence bridges for MCP and Agent readers."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.domain.agent.context_refs import SearchIntelligenceReference
from app.domain.agent.search_intelligence_context import (
    SearchIntelligenceEvidenceNotFound,
    search_intelligence_context,
)
from app.domain.demand.search_intelligence import service
from app.models.provider import ProviderConnection
from app.models.search_intelligence import (
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
    SearchIntelligenceRun,
)
from app.models.workspace import WorkspaceMember
from tests.component.audit_helpers import seed_audit_fixtures


@pytest.fixture
async def published_dataset(db_session):
    seed = await seed_audit_fixtures(db_session, prompt_count=1)
    member = await db_session.scalar(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == seed.workspace_id)
    )
    connection = await db_session.scalar(
        select(ProviderConnection).where(
            ProviderConnection.workspace_id == seed.workspace_id
        )
    )
    run = SearchIntelligenceRun(
        workspace_id=seed.workspace_id,
        project_id=seed.project_id,
        actor_user_id=member.user_id,
        connection_id=connection.id,
        connection_revision=connection.credential_revision,
        account_identity="fixture",
        idempotency_key="persisted-reader",
        frozen_scope={},
        call_plan=[],
        estimated_cost_usd=Decimal("0"),
        planned_calls=0,
        planned_rows=3,
        expires_at=datetime.now(UTC),
        status="succeeded",
    )
    db_session.add(run)
    await db_session.flush()
    dataset = SearchIntelligenceDataset(
        workspace_id=seed.workspace_id,
        project_id=seed.project_id,
        run_id=run.id,
        dataset_kind="organic_pages",
        scope_hash="fixture",
        target_domain="example.com",
        target_hostname="www.example.com",
        target_origin="https://www.example.com",
        status="published",
        coverage="complete",
        provider_filters={"research_scope": "domain_subdomains"},
        published_at=datetime.now(UTC),
        unique_rows_saved=3,
    )
    db_session.add(dataset)
    await db_session.flush()
    rows = [
        SearchIntelligenceRow(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            dataset_id=dataset.id,
            provider_row_key=f"row:{index}",
            row_kind="organic_pages",
            keyword=keyword,
            url=f"https://www.example.com/{keyword}",
            etv=value,
            auxiliary={"organic_keywords": 12},
        )
        for index, (keyword, value) in enumerate(
            [
                ("needle", Decimal("4")),
                ("needle-two", None),
                ("unrelated", Decimal("9")),
            ]
        )
    ]
    db_session.add_all(rows)
    await db_session.commit()
    return dataset, rows


async def test_saved_filters_bind_cursor_and_keep_unknown_values(
    db_session, published_dataset
):
    dataset, _ = published_dataset
    page = dict(
        workspace_id=dataset.workspace_id,
        project_id=dataset.project_id,
        dataset_id=dataset.id,
        limit=1,
        sort="etv",
    )
    metadata, rows, cursor = await service.dataset_page(
        db_session, cursor=None, search="needle", **page
    )
    assert metadata["filtered_saved_count"] == 2
    assert metadata["research_scope"] == "domain_subdomains"
    assert rows[0]["url"].endswith("/needle")
    assert rows[0]["organic_keywords"] == 12
    assert cursor
    with pytest.raises(service.SearchIntelligenceError, match="cursor"):
        await service.dataset_page(
            db_session, cursor=cursor, search="different", **page
        )
    _, second, _ = await service.dataset_page(
        db_session, cursor=cursor, search="needle", **page
    )
    assert second[0]["url"].endswith("needle-two")
    assert second[0]["etv"] is None
    with pytest.raises(service.SearchIntelligenceError, match="not found"):
        await service.dataset_page(
            db_session, cursor=None, **{**page, "workspace_id": uuid.uuid4()}
        )


async def test_agent_resolves_only_selected_rows_within_workspace(
    db_session, published_dataset
):
    dataset, rows = published_dataset
    reference = SearchIntelligenceReference(dataset_id=dataset.id, row_ids=[rows[1].id])
    evidence = await search_intelligence_context(
        db_session, dataset.workspace_id, dataset.project_id, reference
    )
    assert "needle-two" in evidence
    assert "unrelated" not in evidence
    with pytest.raises(SearchIntelligenceEvidenceNotFound):
        await search_intelligence_context(
            db_session, uuid.uuid4(), dataset.project_id, reference
        )
