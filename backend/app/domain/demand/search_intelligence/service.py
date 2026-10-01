"""Persisted Search Intelligence reads for MCP until migration PR 19.

Review, acquisition and HTTP lifecycle operations are TypeScript-owned.
``readiness``, ``dataset_page``,
``dataset_dict`` and ``row_dict`` remain for the MCP readers until MCP moves.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config.provider_catalog import TEST_STATUS_OK, TRANSPORT_DATAFORSEO
from app.domain.demand.search_intelligence.pagination import (
    UnsupportedSortError,
    filtered_count,
    sorted_rows,
)
from app.domain.demand.search_intelligence.schemas import (
    ReadinessResponse,
    SearchIntelligencePreferences,
)
from app.domain.demand.search_intelligence.targets import (
    TargetScopeError,
    competitor_target,
    owned_targets,
)
from app.models.project import Project
from app.models.provider import ProviderConnection
from app.models.search_intelligence import (
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
    SearchIntelligenceRun,
)


class SearchIntelligenceError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


async def _project(
    session: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> Project:
    row = await session.scalar(
        select(Project)
        .options(selectinload(Project.owned_domains), selectinload(Project.competitors))
        .where(Project.workspace_id == workspace_id, Project.id == project_id)
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise SearchIntelligenceError("not_found", "Project not found")
    return row


async def readiness(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> ReadinessResponse:
    project = await _project(session, workspace_id, project_id)
    connections = list(
        (
            await session.scalars(
                select(ProviderConnection).where(
                    ProviderConnection.workspace_id == workspace_id,
                    ProviderConnection.transport_provider == TRANSPORT_DATAFORSEO,
                    ProviderConnection.active.is_(True),
                    ProviderConnection.last_test_status == TEST_STATUS_OK,
                    ProviderConnection.api_key_encrypted != "",
                )
            )
        ).all()
    )
    competitors: list[dict[str, str]] = []
    for row in project.competitors:
        try:
            competitors.append(competitor_target(row).public_dict())
        except TargetScopeError:
            continue
    latest = await session.scalar(
        select(SearchIntelligenceRun)
        .where(
            SearchIntelligenceRun.workspace_id == workspace_id,
            SearchIntelligenceRun.project_id == project_id,
        )
        .order_by(SearchIntelligenceRun.created_at.desc())
    )
    datasets = list(
        (
            await session.scalars(
                select(SearchIntelligenceDataset)
                .where(
                    SearchIntelligenceDataset.workspace_id == workspace_id,
                    SearchIntelligenceDataset.project_id == project_id,
                    SearchIntelligenceDataset.status == "published",
                )
                .order_by(SearchIntelligenceDataset.published_at.desc())
            )
        ).all()
    )
    preference_values = dict(project.search_intelligence_preferences or {})
    preference_values["location_code"] = (
        preference_values.get("location_code") or project.serp_location_code or None
    )
    preference_values["language_code"] = (
        preference_values.get("language_code")
        or project.serp_language_code
        or project.language_code
    )
    return ReadinessResponse(
        connected=len(connections) == 1,
        connection_id=connections[0].id if len(connections) == 1 else None,
        owned_targets=[target.public_dict() for target in owned_targets(project)],
        competitors=competitors,
        preferences=SearchIntelligencePreferences.model_validate(preference_values),
        latest_run=latest,
        datasets=[dataset_dict(row) for row in datasets],
    )


def dataset_dict(row: SearchIntelligenceDataset) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "run_id": str(row.run_id),
        "dataset_kind": row.dataset_kind,
        "target_domain": row.target_domain,
        "target_hostname": row.target_hostname,
        "target_origin": row.target_origin,
        "research_scope": (row.provider_filters or {}).get(
            "research_scope", "exact_host"
        ),
        "acquisition": row.provider_filters,
        "comparison_origin": row.comparison_origin,
        "location_code": row.location_code,
        "language_code": row.language_code,
        "status": row.status,
        "coverage": row.coverage,
        "requested_rows": row.requested_rows,
        "raw_rows_received": row.raw_rows_received,
        "unique_rows_saved": row.unique_rows_saved,
        "provider_total": row.provider_total,
        "truncated": row.truncated,
        "summary": row.summary,
        "collection_started_at": row.collection_started_at,
        "collection_ended_at": row.collection_ended_at,
        "published_at": row.published_at,
    }


def row_dict(row: SearchIntelligenceRow) -> dict[str, Any]:
    return {
        **(row.auxiliary or {}),
        "id": str(row.id),
        "dataset_id": str(row.dataset_id),
        "call_id": str(row.call_id) if row.call_id else None,
        "row_kind": row.row_kind,
        "keyword": row.keyword,
        "domain": row.domain,
        "url": row.url,
        "search_volume": row.search_volume,
        "difficulty": row.difficulty,
        "intent": row.intent,
        "rank_group": row.rank_group,
        "owned_rank_group": row.owned_rank_group,
        "etv": str(row.etv) if row.etv is not None else None,
        "backlinks": row.backlinks,
        "referring_main_domains": row.referring_main_domains,
        "dataforseo_rank": row.dataforseo_rank,
        "auxiliary": row.auxiliary,
    }


async def dataset_page(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    cursor: str | None,
    limit: int,
    sort: str = "id",
    direction: str = "asc",
    search: str = "",
    min_volume: int | None = None,
    intent: str = "",
) -> tuple[dict, list[dict], str | None]:
    dataset = await session.scalar(
        select(SearchIntelligenceDataset).where(
            SearchIntelligenceDataset.workspace_id == workspace_id,
            SearchIntelligenceDataset.project_id == project_id,
            SearchIntelligenceDataset.id == dataset_id,
            SearchIntelligenceDataset.status == "published",
        )
    )
    if dataset is None:
        raise SearchIntelligenceError("not_found", "Dataset not found")
    try:
        rows, next_cursor = await sorted_rows(
            session,
            dataset,
            cursor=cursor,
            limit=limit,
            sort=sort,
            direction=direction,
            search=search,
            min_volume=min_volume,
            intent=intent,
        )
    except UnsupportedSortError as exc:
        raise SearchIntelligenceError(
            "invalid_sort", "Dataset sort or direction is unsupported"
        ) from exc
    except ValueError as exc:
        raise SearchIntelligenceError(
            "invalid_cursor", "Dataset cursor is invalid"
        ) from exc
    metadata = dataset_dict(dataset)
    metadata["filtered_saved_count"] = await filtered_count(
        session, dataset, search, min_volume, intent
    )
    return metadata, [row_dict(row) for row in rows], next_cursor
