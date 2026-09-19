"""Bounded database input assembly for pure Demand query detectors."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.site_health_contracts import PAGE_ANALYSIS_STATUS_COMPLETED
from app.domain.demand.projection import QueryEvidenceInput, SearchDemandInput
from app.domain.demand.query_classification import classify_project_queries
from app.models.demand import QueryEvidenceRow, QueryEvidenceSnapshot
from app.models.site_health.acquisition import SiteFetchArtifact
from app.models.site_health.analysis import SitePageAnalysis


async def _query_rows(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
) -> list[QueryEvidenceRow]:
    return list(
        (
            await session.scalars(
                select(QueryEvidenceRow)
                .where(
                    QueryEvidenceRow.workspace_id == workspace_id,
                    QueryEvidenceRow.project_id == project_id,
                    QueryEvidenceRow.snapshot_id == snapshot_id,
                )
                .order_by(QueryEvidenceRow.date, QueryEvidenceRow.id)
            )
        ).all()
    )


def _analysis_window(snapshot: QueryEvidenceSnapshot) -> tuple[datetime, datetime]:
    return (
        datetime.combine(snapshot.window_start, time.min, tzinfo=UTC),
        datetime.combine(snapshot.window_end + timedelta(days=1), time.min, tzinfo=UTC),
    )


async def _page_facts(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    snapshot: QueryEvidenceSnapshot,
    rows: list[QueryEvidenceRow],
) -> dict[uuid.UUID, tuple[SitePageAnalysis, SiteFetchArtifact]]:
    site_url_ids = {row.site_url_id for row in rows if row.site_url_id is not None}
    if not site_url_ids:
        return {}
    window_start, window_end = _analysis_window(snapshot)
    fact_rows = (
        await session.execute(
            select(SitePageAnalysis, SiteFetchArtifact)
            .join(
                SiteFetchArtifact,
                SiteFetchArtifact.id == SitePageAnalysis.artifact_id,
            )
            .where(
                SitePageAnalysis.workspace_id == workspace_id,
                SitePageAnalysis.project_id == project_id,
                SitePageAnalysis.site_url_id.in_(site_url_ids),
                SitePageAnalysis.status == PAGE_ANALYSIS_STATUS_COMPLETED,
                SitePageAnalysis.created_at >= window_start,
                SitePageAnalysis.created_at < window_end,
                SiteFetchArtifact.workspace_id == workspace_id,
            )
            .order_by(SitePageAnalysis.site_url_id, SitePageAnalysis.created_at.desc())
        )
    ).all()
    page_facts: dict[uuid.UUID, tuple[SitePageAnalysis, SiteFetchArtifact]] = {}
    for analysis, artifact in fact_rows:
        page_facts.setdefault(analysis.site_url_id, (analysis, artifact))
    return page_facts


@dataclass(frozen=True, slots=True)
class _PageContent:
    title: str = ""
    h1_texts: tuple[str, ...] = ()
    primary_content: str = ""
    usable: bool = False
    analysis_id: str | None = None
    artifact_id: str | None = None


def _page_content(
    row: QueryEvidenceRow,
    matched_facts: tuple[SitePageAnalysis, SiteFetchArtifact] | None,
) -> _PageContent:
    if matched_facts is None:
        return _PageContent()
    analysis, artifact = matched_facts
    facts = dict(artifact.normalized_facts or {})
    headings = facts.get("headings") or {}
    title = str(facts.get("title") or "")
    h1_texts = tuple(str(value) for value in headings.get("h1_texts") or [])
    primary_content = str(facts.get("primary_content_text") or "")
    has_content = bool(
        title.strip()
        or any(value.strip() for value in h1_texts)
        or primary_content.strip()
    )
    return _PageContent(
        title=title,
        h1_texts=h1_texts,
        primary_content=primary_content,
        usable=row.resolution_outcome in {"exact", "resolved"} and has_content,
        analysis_id=str(analysis.id),
        artifact_id=str(artifact.id),
    )


def _query_input(
    row: QueryEvidenceRow,
    classification: Any,
    matched_facts: tuple[SitePageAnalysis, SiteFetchArtifact] | None,
) -> QueryEvidenceInput:
    content = _page_content(row, matched_facts)
    override_id = classification.override_id
    return QueryEvidenceInput(
        observed_date=row.date,
        property_ref=row.property_ref,
        normalized_query=row.normalized_query,
        resolved_page_url=row.resolved_page_url,
        resolution_outcome=row.resolution_outcome,
        classification=classification.classification,
        classifier_version=classification.classifier_version,
        classification_override_id=str(override_id) if override_id else None,
        impressions=row.impressions,
        clicks=row.clicks,
        position=row.position,
        source_metric_row_id=str(row.source_metric_row_id),
        source_artifact_id=str(row.source_artifact_id),
        page_title=content.title,
        page_h1_texts=content.h1_texts,
        page_primary_content=content.primary_content,
        page_content_usable=content.usable,
        page_analysis_id=content.analysis_id,
        page_artifact_id=content.artifact_id,
    )


async def load_query_detector_inputs(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    snapshot: QueryEvidenceSnapshot,
) -> list[QueryEvidenceInput]:
    rows = await _query_rows(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        snapshot_id=snapshot.id,
    )
    page_facts = await _page_facts(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        snapshot=snapshot,
        rows=rows,
    )
    classifications = await classify_project_queries(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        queries=[row.normalized_query for row in rows],
    )
    inputs: list[QueryEvidenceInput] = []
    for row in rows:
        classification = classifications.get(row.normalized_query)
        if classification is None:
            continue
        matched_facts = (
            page_facts.get(row.site_url_id) if row.site_url_id is not None else None
        )
        inputs.append(_query_input(row, classification, matched_facts))
    return inputs


def page_revision_material(rows: list[QueryEvidenceInput]) -> list[tuple[str, str]]:
    """Identify the exact inspected page revisions used by query detectors."""
    return sorted(
        {
            (row.page_analysis_id, row.page_artifact_id)
            for row in rows
            if row.page_analysis_id is not None and row.page_artifact_id is not None
        }
    )


async def classification_revision_material(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    search_inputs: list[SearchDemandInput],
    query_inputs: list[QueryEvidenceInput],
) -> list[dict[str, Any]]:
    queries = {row.target for row in search_inputs if row.target_kind == "query"} | {
        row.normalized_query for row in query_inputs
    }
    classifications = await classify_project_queries(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        queries=sorted(queries),
    )
    return [
        {
            "query": key,
            "classification": value.classification,
            "classifier_version": value.classifier_version,
            "override_id": str(value.override_id) if value.override_id else None,
        }
        for key, value in sorted(classifications.items())
    ]
