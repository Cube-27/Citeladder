"""Detailed persisted-evidence readers exposed through MCP."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.mcp import MCP_MAX_VISIBILITY_SOURCE_OFFSET
from app.domain.analysis.evidence import get_visibility_evidence
from app.domain.analysis.source_projection import get_visibility_sources
from app.domain.demand.query_evidence_reads import (
    QueryEvidenceCursorError,
    latest_query_evidence_snapshot,
    list_query_evidence,
)
from app.domain.demand.search_intelligence.service import (
    SearchIntelligenceError,
    dataset_page,
)
from app.domain.demand.search_intelligence.service import (
    readiness as search_intelligence_readiness,
)
from app.domain.mcp.common import (
    _authorized_project,
    _cursor_decode,
    _cursor_encode,
    _limit,
    _reference,
)
from app.domain.mcp.schemas import page
from app.domain.site_health import service as site_health_service
from app.models.analysis import Citation
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.links import SitePageLinkMetric
from app.models.source_pages import (
    SourcePage,
)


async def read_prompt_portfolio(
    session: AsyncSession,
    project_id: str,
    *,
    prompt_set_id: str | None = None,
    cohort: str | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    bounded = _limit(limit)
    statement = (
        select(Prompt, PromptSet)
        .join(PromptSet, PromptSet.id == Prompt.prompt_set_id)
        .where(PromptSet.project_id == project.id)
    )
    if prompt_set_id:
        try:
            set_id = uuid.UUID(prompt_set_id)
        except ValueError as exc:
            raise ValueError("prompt_set_id must be a UUID") from exc
        statement = statement.where(PromptSet.id == set_id)
    if cohort:
        statement = statement.where(Prompt.cohort == cohort)
    if cursor:
        created_at, row_id = _cursor_decode(cursor, 2)
        try:
            cursor_at = datetime.fromisoformat(created_at)
            cursor_id = uuid.UUID(row_id)
        except ValueError as exc:
            raise ValueError("cursor is invalid") from exc
        statement = statement.where(
            or_(
                Prompt.created_at > cursor_at,
                and_(Prompt.created_at == cursor_at, Prompt.id > cursor_id),
            )
        )
    rows = list(
        (
            await session.execute(
                statement.order_by(Prompt.created_at.asc(), Prompt.id.asc()).limit(
                    bounded + 1
                )
            )
        ).all()
    )
    emitted = rows[:bounded]
    next_cursor = (
        _cursor_encode(emitted[-1][0].created_at.isoformat(), emitted[-1][0].id)
        if len(rows) > bounded
        else None
    )
    items = [
        {
            "id": str(prompt.id),
            "record_uri": f"citeladder://prompt/{prompt.id}",
            "prompt_set_id": str(prompt.prompt_set_id),
            "prompt_set_name": prompt_set.name,
            "text": prompt.text,
            "theme": prompt.theme,
            "intent": prompt.intent,
            "buyer_stage": prompt.buyer_stage,
            "prompt_intent": prompt.prompt_intent,
            "cohort": prompt.cohort,
            "active": prompt.enabled and prompt.status == "active",
            "status": prompt.status,
            "origin": prompt.origin,
            "generation_evidence": prompt.generation_evidence,
            "created_at": prompt.created_at,
        }
        for prompt, prompt_set in emitted
    ]
    return {
        "state": "available",
        "project_id": str(project.id),
        "items": items,
        "pagination": page(items=items, next_cursor=next_cursor),
    }


async def read_query_evidence(
    session: AsyncSession,
    project_id: str,
    *,
    window_start: str,
    window_end: str,
    query: str | None = None,
    site_url_id: str | None = None,
    resolution_outcome: str | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    try:
        start = date.fromisoformat(window_start)
        end = date.fromisoformat(window_end)
    except ValueError as exc:
        raise ValueError("window_start and window_end must be ISO dates") from exc
    if start > end:
        raise ValueError("window_start must not be after window_end")
    site_id: uuid.UUID | None = None
    if site_url_id:
        try:
            site_id = uuid.UUID(site_url_id)
        except ValueError as exc:
            raise ValueError("site_url_id must be a UUID") from exc
    snapshot = await latest_query_evidence_snapshot(
        session,
        workspace_id=project.workspace_id,
        project_id=project.id,
        window_start=start,
        window_end=end,
    )
    if snapshot is None:
        return {
            "state": "unavailable",
            "reason": "exact_query_evidence_window_not_projected",
            "project_id": str(project.id),
            "window": {"start": start, "end": end},
            "items": [],
            "pagination": page(items=[], next_cursor=None),
        }
    try:
        result = await list_query_evidence(
            session,
            snapshot=snapshot,
            limit=_limit(limit),
            cursor=cursor,
            query=query,
            site_url_id=site_id,
            resolution_outcome=resolution_outcome,
        )
    except QueryEvidenceCursorError as exc:
        raise ValueError(str(exc)) from exc
    items = [
        {
            "id": str(row.id),
            "record_uri": f"citeladder://query_row/{row.id}",
            "date": row.date,
            "query": row.normalized_query,
            "observed_page_url": row.observed_page_url,
            "site_url_id": str(row.site_url_id) if row.site_url_id else None,
            "resolved_page_url": row.resolved_page_url or None,
            "resolution_outcome": row.resolution_outcome,
            "resolution_candidates": row.resolution_candidates,
            "property_ref": row.property_ref,
            "impressions": row.impressions,
            "clicks": row.clicks,
            "ctr": row.ctr,
            "position": row.position,
            "source_metric_row_id": str(row.source_metric_row_id),
            "source_artifact_id": str(row.source_artifact_id),
            "importer_version": row.importer_version,
            "resolver_version": row.resolver_version,
        }
        for row in result.rows
    ]
    return {
        "state": snapshot.state,
        "project_id": str(project.id),
        "snapshot": {
            "id": str(snapshot.id),
            "record_uri": f"citeladder://query_snapshot/{snapshot.id}",
            "window_start": snapshot.window_start,
            "window_end": snapshot.window_end,
            "created_at": snapshot.created_at,
            "coverage": snapshot.coverage,
            "limitations": snapshot.limitations,
            "analyzer_version": snapshot.analyzer_version,
            "resolver_version": snapshot.resolver_version,
        },
        "scope": {
            "country": None,
            "device": None,
            "search_type": None,
            "unsupported_dimensions": ["country", "device", "search_type"],
        },
        "items": items,
        "pagination": page(items=items, next_cursor=result.next_cursor),
    }


async def _selected_crawl(
    session: AsyncSession, project: Project, crawl_id: str | None
) -> SiteCrawl | None:
    statement = select(SiteCrawl).where(
        SiteCrawl.workspace_id == project.workspace_id,
        SiteCrawl.project_id == project.id,
    )
    if crawl_id:
        try:
            parsed = uuid.UUID(crawl_id)
        except ValueError as exc:
            raise ValueError("crawl_id must be a UUID") from exc
        statement = statement.where(SiteCrawl.id == parsed)
    else:
        statement = statement.order_by(
            SiteCrawl.created_at.desc(), SiteCrawl.id.desc()
        ).limit(1)
    return await session.scalar(statement)


async def read_site_pages(
    session: AsyncSession,
    project_id: str,
    *,
    crawl_id: str | None = None,
    page_kind: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    crawl = await _selected_crawl(session, project, crawl_id)
    if crawl is None:
        return {
            "state": "unavailable",
            "reason": "no_site_crawl",
            "items": [],
            "pagination": page(items=[], next_cursor=None),
        }
    result = await site_health_service.get_pages(
        session,
        workspace_id=project.workspace_id,
        crawl_id=crawl.id,
        limit=_limit(limit),
        cursor=cursor,
        status=status,
        page_kind=page_kind,
        sort="url",
    )
    items = result["items"]
    analysis_ids = await site_health_service.get_current_page_analysis_ids(
        session,
        workspace_id=project.workspace_id,
        crawl_id=crawl.id,
        site_url_ids=[item["site_url_id"] for item in items],
    )
    for item in items:
        analysis_id = analysis_ids.get(item["site_url_id"])
        item["id"] = str(analysis_id or item["site_url_id"])
        item["record_uri"] = (
            f"citeladder://site_page/{analysis_id}" if analysis_id else None
        )
        item["retrievable"] = analysis_id is not None
        if analysis_id is None:
            item["retrieval_reason"] = "page_analysis_not_available"
    return {
        "state": "available",
        "project_id": str(project.id),
        "crawl": {
            "id": str(crawl.id),
            "record_uri": f"citeladder://site_crawl/{crawl.id}",
            "status": crawl.status,
            "inventory_complete": crawl.inventory_complete,
            "created_at": crawl.created_at,
            "completed_at": crawl.completed_at,
        },
        "coverage": {
            "admitted_urls": crawl.admitted_url_count,
            "analyzed_urls": crawl.analyzed_url_count,
            "failed_urls": crawl.failed_url_count,
            "inventory_complete": crawl.inventory_complete,
            "root_errors": result.get("root_errors", []),
        },
        "items": items,
        "pagination": page(items=items, next_cursor=result["next_cursor"]),
        "limitations": ["bounded_normalized_facts", "raw_html_not_retained"],
    }


async def read_site_links(
    session: AsyncSession,
    project_id: str,
    *,
    crawl_id: str,
    site_url_id: str | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    crawl = await _selected_crawl(session, project, crawl_id)
    if crawl is None:
        raise LookupError("Crawl was not found in this project")
    bounded = _limit(limit)
    statement = select(SitePageLinkMetric).where(
        SitePageLinkMetric.workspace_id == project.workspace_id,
        SitePageLinkMetric.project_id == project.id,
        SitePageLinkMetric.crawl_id == crawl.id,
    )
    if site_url_id:
        try:
            statement = statement.where(
                SitePageLinkMetric.site_url_id == uuid.UUID(site_url_id)
            )
        except ValueError as exc:
            raise ValueError("site_url_id must be a UUID") from exc
    if cursor:
        (cursor_id,) = _cursor_decode(cursor, 1)
        try:
            statement = statement.where(SitePageLinkMetric.id > uuid.UUID(cursor_id))
        except ValueError as exc:
            raise ValueError("cursor is invalid") from exc
    rows = list(
        (
            await session.scalars(
                statement.order_by(SitePageLinkMetric.id.asc()).limit(bounded + 1)
            )
        ).all()
    )
    emitted = rows[:bounded]
    next_cursor = _cursor_encode(emitted[-1].id) if len(rows) > bounded else None
    items = [
        {
            "id": str(row.id),
            "record_uri": f"citeladder://site_link/{row.id}",
            "site_url_id": str(row.site_url_id),
            "grain": "page_link_metrics_with_bounded_neighbors",
            "inbound_count": row.inbound_count,
            "outbound_count": row.outbound_count,
            "main_content_inbound_count": row.main_content_inbound_count,
            "main_content_outbound_count": row.main_content_outbound_count,
            "nofollow_inbound_count": row.nofollow_inbound_count,
            "depth_from_home": row.depth_from_home,
            "source_page_count": row.source_page_count,
            "top_inbound": row.top_inbound or [],
            "top_outbound": row.top_outbound or [],
            "anchor_diagnostics": row.anchor_diagnostics or [],
            "extractor_version": row.extractor_version,
            "formula_version": row.formula_version,
            "created_at": row.created_at,
        }
        for row in emitted
    ]
    return {
        "state": "available",
        "project_id": str(project.id),
        "crawl_id": str(crawl.id),
        "items": items,
        "pagination": page(items=items, next_cursor=next_cursor),
        "limitations": [
            "aggregate_metrics_are_not_individual_edges",
            "placement_is_reported_only_when_captured_in_bounded_neighbors",
        ],
    }


async def read_visibility_results(
    session: AsyncSession,
    project_id: str,
    *,
    audit_id: str,
    prompt_id: str | None = None,
    engine: str | None = None,
    cohort: str = "core",
    cursor: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    try:
        parsed_audit = uuid.UUID(audit_id)
        parsed_prompt = uuid.UUID(prompt_id) if prompt_id else None
    except ValueError as exc:
        raise ValueError("audit_id and prompt_id must be UUIDs") from exc
    response = await get_visibility_evidence(
        session,
        workspace_id=project.workspace_id,
        project_id=project.id,
        audit_id=parsed_audit,
        prompt_id=parsed_prompt,
        logical_engine=engine,
        cohort=cohort,
        cursor=cursor,
        limit=_limit(limit),
    )
    items = [item.model_dump(mode="json") for item in response.items]
    analysis_ids = [uuid.UUID(item["analysis_id"]) for item in items]
    citation_rows = list(
        (
            await session.scalars(
                select(Citation)
                .where(
                    Citation.workspace_id == project.workspace_id,
                    Citation.analysis_id.in_(analysis_ids),
                )
                .order_by(Citation.analysis_id.asc(), Citation.ordinal.asc())
            )
        ).all()
    )
    citation_ids = {
        (str(row.analysis_id), row.ordinal): str(row.id) for row in citation_rows
    }
    for item in items:
        item["id"] = item["task_id"]
        item["record_uri"] = f"citeladder://visibility_result/{item['task_id']}"
        for citation in item["citations"]:
            citation_id = citation_ids.get((item["analysis_id"], citation["ordinal"]))
            if citation_id:
                citation["id"] = citation_id
                citation["record_uri"] = f"citeladder://citation/{citation_id}"
    return {
        "state": "available",
        "project_id": str(project.id),
        "audit_id": str(parsed_audit),
        "observed_at": response.as_of,
        "scope": {"engine": engine, "cohort": cohort},
        "items": items,
        "pagination": page(
            items=items,
            next_cursor=response.next_cursor,
            total_count=response.total,
        ),
    }


async def read_visibility_sources(
    session: AsyncSession,
    project_id: str,
    *,
    audit_id: str,
    level: str = "domain",
    engine: str | None = None,
    cohort: str = "core",
    cursor: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    if level not in {"domain", "url"}:
        raise ValueError("level must be domain or url")
    try:
        parsed_audit = uuid.UUID(audit_id)
        offset = int(_cursor_decode(cursor, 1)[0]) if cursor else 0
    except ValueError as exc:
        raise ValueError("audit_id or cursor is invalid") from exc
    if offset < 0 or offset > MCP_MAX_VISIBILITY_SOURCE_OFFSET:
        raise ValueError("cursor offset is outside the supported range")
    response = await get_visibility_sources(
        session,
        workspace_id=project.workspace_id,
        project_id=project.id,
        audit_id=parsed_audit,
        logical_engine=engine,
        cohort=cohort,
        dimension=level,
        offset=offset,
        limit=_limit(limit),
    )
    items = [item.model_dump(mode="json") for item in response.items]
    source_pages = await _visibility_source_pages(session, project, level, items)
    _attach_inspection_evidence(items, source_pages, level)
    next_cursor = (
        _cursor_encode(response.next_offset)
        if response.next_offset is not None
        else None
    )
    return {
        "state": "available",
        "project_id": str(project.id),
        "audit_id": str(parsed_audit),
        "level": level,
        "scope": {"engine": engine, "cohort": cohort},
        "coverage": {
            "responses": response.responses,
            "prompts": response.prompts,
            "citations": response.total_citations,
        },
        "items": items,
        "pagination": page(
            items=items,
            next_cursor=next_cursor,
            total_count=response.total,
        ),
        "as_of": response.as_of,
    }


async def _visibility_source_pages(
    session: AsyncSession, project: Project, level: str, items: list[dict[str, Any]]
) -> dict[str, SourcePage]:
    if level != "url":
        return {}
    hashes = [item["url_hash"] for item in items if item.get("url_hash")]
    if not hashes:
        return {}
    rows = await session.scalars(
        select(SourcePage).where(
            SourcePage.workspace_id == project.workspace_id,
            SourcePage.project_id == project.id,
            SourcePage.url_hash.in_(hashes),
        )
    )
    return {row.url_hash: row for row in rows.all()}


def _attach_inspection_evidence(
    items: list[dict[str, Any]], source_pages: dict[str, SourcePage], level: str
) -> None:
    for item in items:
        item["observation"] = (
            "citation_occurrence_and_answer_cooccurrence"
            if level == "url"
            else "citation_occurrence"
        )
        item["inspected_page_presence_is_separate"] = True
        source_page = source_pages.get(item.get("url_hash") or "")
        if source_page and source_page.latest_snapshot_id:
            item["inspection_evidence"] = _reference(
                "earned_source_snapshot", source_page.latest_snapshot_id
            )
        else:
            item["inspection_evidence"] = {
                "record_uri": None,
                "retrievable": False,
                "reason": (
                    source_page.inspection_reason
                    if source_page and source_page.inspection_reason
                    else "source_page_not_inspected"
                ),
            }


async def read_search_intelligence(
    session: AsyncSession, project_id: str
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    response = await search_intelligence_readiness(
        session, workspace_id=project.workspace_id, project_id=project.id
    )
    body = response.model_dump(mode="json")
    if body["latest_run"]:
        body["latest_run"]["record_uri"] = (
            f"citeladder://search_run/{body['latest_run']['id']}"
        )
    for dataset in body["datasets"]:
        dataset["record_uri"] = f"citeladder://search_dataset/{dataset['id']}"
        dataset["grain_limitation"] = (
            "aggregate_not_individual_backlink_edges"
            if dataset["dataset_kind"]
            in {"backlink_summary", "referring_domains", "destination_pages"}
            else None
        )
    return {
        "state": "available",
        "project_id": str(project.id),
        "connected": body["connected"],
        "owned_targets": body["owned_targets"],
        "competitors": body["competitors"],
        "latest_run": body["latest_run"],
        "datasets": body["datasets"],
        "pagination": page(
            items=body["datasets"], next_cursor=None, total_count=len(body["datasets"])
        ),
        "read_only": True,
    }


async def read_search_dataset(
    session: AsyncSession,
    project_id: str,
    *,
    dataset_id: str,
    cursor: str | None = None,
    limit: int | None = None,
    sort: str = "id",
    direction: str = "asc",
) -> dict[str, Any]:
    project = await _authorized_project(session, project_id)
    try:
        parsed_dataset = uuid.UUID(dataset_id)
    except ValueError as exc:
        raise ValueError("dataset_id must be a UUID") from exc
    try:
        dataset, rows, next_cursor = await dataset_page(
            session,
            workspace_id=project.workspace_id,
            project_id=project.id,
            dataset_id=parsed_dataset,
            cursor=cursor,
            limit=_limit(limit),
            sort=sort,
            direction=direction,
        )
    except SearchIntelligenceError as exc:
        if exc.code == "not_found":
            raise LookupError("Dataset was not found in this project") from exc
        raise ValueError(str(exc)) from exc
    dataset["record_uri"] = f"citeladder://search_dataset/{dataset['id']}"
    for row in rows:
        row["record_uri"] = f"citeladder://search_row/{row['id']}"
    return {
        "state": "available",
        "project_id": str(project.id),
        "dataset": dataset,
        "items": rows,
        "pagination": page(
            items=rows,
            next_cursor=next_cursor,
            total_count=dataset.get("filtered_saved_count"),
        ),
        "grain": dataset["dataset_kind"],
        "limitations": (
            ["aggregate_not_individual_backlink_edges"]
            if dataset["dataset_kind"]
            in {"backlink_summary", "referring_domains", "destination_pages"}
            else []
        ),
    }
