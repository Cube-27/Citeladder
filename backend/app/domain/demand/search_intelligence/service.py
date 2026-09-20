"""Authorized Search Intelligence reviews, confirmation, and persisted reads."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config.provider_catalog import TEST_STATUS_OK, TRANSPORT_DATAFORSEO
from app.core.config.search_intelligence import (
    DEFAULT_DEPTHS,
    PRICE_VERSION,
    REUSE_DAYS,
    REVIEW_TTL_SECONDS,
    QuoteLine,
    estimate_dataset,
    page_sizes,
    quote_total,
)
from app.core.config.task_queue import TASK_STATUS_CANCELLED
from app.domain.analytics.enqueue import enqueue_search_intelligence
from app.domain.demand.search_intelligence.pagination import (
    UnsupportedSortError,
    sorted_rows,
)
from app.domain.demand.search_intelligence.requests import (
    build_request,
    request_identity,
    scope_hash,
)
from app.domain.demand.search_intelligence.schemas import (
    ContentHandoffResponse,
    DatasetSelection,
    ReadinessResponse,
    ReviewCreate,
    SearchIntelligencePreferences,
)
from app.domain.demand.search_intelligence.targets import (
    CanonicalTarget,
    TargetScopeError,
    competitor_target,
    owned_targets,
    resolve_competitor,
    select_owned_target,
)
from app.domain.providers.dataforseo_identity import dataforseo_account_identity
from app.models.analytics import AnalyticsTask
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


def _utcnow() -> datetime:
    return datetime.now(UTC)


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


async def _connection(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    connection_id: uuid.UUID | None,
) -> ProviderConnection:
    query = select(ProviderConnection).where(
        ProviderConnection.workspace_id == workspace_id,
        ProviderConnection.transport_provider == TRANSPORT_DATAFORSEO,
        ProviderConnection.active.is_(True),
        ProviderConnection.last_test_status == TEST_STATUS_OK,
        ProviderConnection.api_key_encrypted != "",
    )
    if connection_id is not None:
        query = query.where(ProviderConnection.id == connection_id)
    rows = list(
        (await session.scalars(query.order_by(ProviderConnection.created_at))).all()
    )
    if len(rows) != 1:
        code = (
            "dataforseo_connection_required"
            if not rows
            else "dataforseo_connection_ambiguous"
        )
        raise SearchIntelligenceError(code, "Select one eligible DataForSEO connection")
    return rows[0]


def _comparison(project: Project, competitor_id: uuid.UUID | None) -> CanonicalTarget:
    if competitor_id is None:
        raise SearchIntelligenceError(
            "competitor_not_found", "Select one saved project competitor"
        )
    competitor = next(
        (row for row in project.competitors if row.id == competitor_id), None
    )
    if competitor is None:
        raise SearchIntelligenceError(
            "competitor_not_found", "Selected competitor is not in this project"
        )
    try:
        return competitor_target(competitor)
    except TargetScopeError as exc:
        raise SearchIntelligenceError("unsupported_target", str(exc)) from exc


async def _reusable(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    scope_hash: str,
    requested_rows: int,
    now: datetime,
) -> SearchIntelligenceDataset | None:
    return await session.scalar(
        select(SearchIntelligenceDataset)
        .where(
            SearchIntelligenceDataset.workspace_id == workspace_id,
            SearchIntelligenceDataset.project_id == project_id,
            SearchIntelligenceDataset.scope_hash == scope_hash,
            SearchIntelligenceDataset.status == "published",
            SearchIntelligenceDataset.coverage.in_(("complete", "empty")),
            SearchIntelligenceDataset.requested_rows >= requested_rows,
            SearchIntelligenceDataset.published_at >= now - timedelta(days=REUSE_DAYS),
        )
        .order_by(SearchIntelligenceDataset.published_at.desc())
    )


def _selection_targets(
    project: Project,
    owned_target: CanonicalTarget,
    selection: DatasetSelection,
) -> tuple[CanonicalTarget, CanonicalTarget | None]:
    if selection.kind in {"missing_keywords", "shared_keywords"}:
        return owned_target, _comparison(project, selection.competitor_id)
    if selection.competitor_id is not None:
        return _comparison(project, selection.competitor_id), None
    return owned_target, None


def _reused_dataset(snapshot: SearchIntelligenceDataset) -> dict[str, Any]:
    return {
        "dataset_id": str(snapshot.id),
        "dataset_kind": snapshot.dataset_kind,
        "published_at": snapshot.published_at.isoformat()
        if snapshot.published_at
        else None,
    }


async def _build_call_plan(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    project: Project,
    owned_target: CanonicalTarget,
    payload: ReviewCreate,
    location: int | None,
    language: str,
    now: datetime,
    resolved_competitors: dict[str, CanonicalTarget],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[QuoteLine]]:
    call_plan: list[dict[str, Any]] = []
    reused: list[dict[str, Any]] = []
    quote_lines: list[QuoteLine] = []
    for index, selection in enumerate(payload.datasets):
        dataset_target, comparison = _selection_targets(
            project, owned_target, selection
        )
        dataset_target = resolved_competitors.get(
            dataset_target.identity, dataset_target
        )
        if comparison is not None:
            comparison = resolved_competitors[comparison.identity]
        depth = (
            1
            if selection.kind in {"footprint", "backlink_summary"}
            else selection.depth
        )
        endpoint, first_request = build_request(
            kind=selection.kind,
            target=dataset_target,
            comparison=comparison,
            location_code=location,
            language_code=language,
            limit=min(depth, 1000),
            offset=0,
            seed=selection.seed,
        )
        dataset_scope_hash = scope_hash(
            request_identity(
                selection.kind,
                dataset_target,
                comparison,
                location,
                language,
                first_request,
            )
        )
        snapshot = None
        if payload.reuse_recent:
            snapshot = await _reusable(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                scope_hash=dataset_scope_hash,
                requested_rows=depth,
                now=now,
            )
        quote = estimate_dataset(selection.kind, rows=depth)
        if snapshot is not None:
            reused.append(_reused_dataset(snapshot))
            continue
        quote_lines.append(quote)
        sizes = (
            page_sizes(depth)
            if selection.kind not in {"footprint", "backlink_summary"}
            else (1,)
        )
        for page, page_size in enumerate(sizes):
            _, request = build_request(
                kind=selection.kind,
                target=dataset_target,
                comparison=comparison,
                location_code=location,
                language_code=language,
                limit=page_size,
                offset=page * 1000,
                seed=selection.seed,
            )
            call_plan.append(
                {
                    "dataset_key": f"{index}:{dataset_scope_hash}",
                    "dataset_kind": selection.kind,
                    "scope_hash": dataset_scope_hash,
                    "target": dataset_target.public_dict(),
                    "comparison": comparison.public_dict() if comparison else None,
                    "requested_rows": depth,
                    "endpoint": endpoint,
                    "request": request,
                    "page": page,
                    "estimated_cost_usd": str(quote.estimated_usd / quote.calls),
                }
            )
    return call_plan, reused, quote_lines


def _owned_target(project: Project, identity: str | None) -> CanonicalTarget:
    try:
        return select_owned_target(project, identity)
    except TargetScopeError as exc:
        raise SearchIntelligenceError("unsupported_target", str(exc)) from exc


def _market_scope(project: Project, payload: ReviewCreate) -> tuple[int | None, str]:
    location = payload.location_code or project.serp_location_code or None
    language = (
        payload.language_code.strip().lower()
        or project.serp_language_code
        or project.language_code
    )
    backlink_kinds = {"backlink_summary", "referring_domains", "destination_pages"}
    needs_market = any(item.kind not in backlink_kinds for item in payload.datasets)
    if needs_market and (location is None or not language):
        raise SearchIntelligenceError(
            "unsupported_market", "Select a supported Labs location and language"
        )
    return location, language


def _new_review_run(
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    idempotency_key: str,
    payload: ReviewCreate,
    target: CanonicalTarget,
    connection: ProviderConnection,
    location: int | None,
    language: str,
    call_plan: list[dict[str, Any]],
    reused: list[dict[str, Any]],
    quote_lines: list[QuoteLine],
    now: datetime,
) -> SearchIntelligenceRun:
    return SearchIntelligenceRun(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        previous_run_id=payload.previous_run_id,
        connection_id=connection.id,
        connection_revision=connection.credential_revision,
        account_identity=dataforseo_account_identity(connection.api_key_encrypted),
        status="reviewed",
        action=payload.action,
        idempotency_key=idempotency_key,
        frozen_scope={
            "owned_target": target.public_dict(),
            "location_code": location,
            "language_code": language,
            "datasets": [item.model_dump(mode="json") for item in payload.datasets],
            "connection_id": str(connection.id),
            "connection_revision": str(connection.credential_revision),
        },
        call_plan=call_plan,
        reused_datasets=reused,
        pricing_version=PRICE_VERSION,
        estimated_cost_usd=quote_total(tuple(quote_lines)),
        planned_calls=len(call_plan),
        planned_rows=sum(line.requested_rows for line in quote_lines),
        expires_at=now + timedelta(seconds=REVIEW_TTL_SECONDS),
    )


def _save_review_defaults(
    project: Project, payload: ReviewCreate, location: int | None, language: str
) -> None:
    project.search_intelligence_preferences = SearchIntelligencePreferences(
        owned_target_id=payload.owned_target_id,
        competitor_ids=[
            item.competitor_id for item in payload.datasets if item.competitor_id
        ],
        location_code=location,
        language_code=language,
        reuse_recent=payload.reuse_recent,
        depths={
            item.kind: item.depth
            for item in payload.datasets
            if item.depth > 1 and item.kind in DEFAULT_DEPTHS
        },
    ).model_dump(mode="json")


async def create_review(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    idempotency_key: str,
    payload: ReviewCreate,
) -> SearchIntelligenceRun:
    existing = await session.scalar(
        select(SearchIntelligenceRun).where(
            SearchIntelligenceRun.workspace_id == workspace_id,
            SearchIntelligenceRun.project_id == project_id,
            SearchIntelligenceRun.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        return existing
    project = await _project(session, workspace_id, project_id)
    saved_competitors = {
        str(item.competitor_id): _comparison(project, item.competitor_id)
        for item in payload.datasets
        if item.competitor_id is not None
    }
    # Website resolution is unpaid network I/O; hold no transaction or lock across it.
    await session.commit()
    try:
        resolved_competitors = {
            key: await resolve_competitor(target)
            for key, target in saved_competitors.items()
        }
    except TargetScopeError as exc:
        raise SearchIntelligenceError("unsupported_target", str(exc)) from exc
    await session.scalar(
        select(Project.id)
        .where(Project.workspace_id == workspace_id, Project.id == project_id)
        .with_for_update()
    )
    existing = await session.scalar(
        select(SearchIntelligenceRun).where(
            SearchIntelligenceRun.workspace_id == workspace_id,
            SearchIntelligenceRun.project_id == project_id,
            SearchIntelligenceRun.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        return existing
    project = await _project(session, workspace_id, project_id)
    if any(
        _comparison(project, uuid.UUID(key)) != target
        for key, target in saved_competitors.items()
    ):
        raise SearchIntelligenceError(
            "target_changed", "Competitors changed; review again"
        )
    target = _owned_target(project, payload.owned_target_id)
    connection = await _connection(session, workspace_id, payload.connection_id)
    location, language = _market_scope(project, payload)
    now = _utcnow()
    call_plan, reused, quote_lines = await _build_call_plan(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        project=project,
        owned_target=target,
        payload=payload,
        location=location,
        language=language,
        now=now,
        resolved_competitors=resolved_competitors,
    )
    run = _new_review_run(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
        target=target,
        connection=connection,
        location=location,
        language=language,
        call_plan=call_plan,
        reused=reused,
        quote_lines=quote_lines,
        now=now,
    )
    session.add(run)
    if payload.save_as_defaults:
        _save_review_defaults(project, payload, location, language)
    await session.commit()
    await session.refresh(run)
    return run


def _validate_confirmation(run: SearchIntelligenceRun, now: datetime) -> None:
    if run.status != "reviewed":
        raise SearchIntelligenceError(
            "review_not_confirmable", "Review is no longer confirmable"
        )
    if run.expires_at <= now:
        raise SearchIntelligenceError(
            "review_expired", "Review expired; create a new cost review"
        )
    if run.pricing_version != PRICE_VERSION:
        raise SearchIntelligenceError(
            "pricing_changed", "Pricing changed; create a new cost review"
        )


async def confirm_review(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    run_id: uuid.UUID,
) -> SearchIntelligenceRun:
    await session.scalar(
        select(Project.id)
        .where(
            Project.workspace_id == workspace_id,
            Project.id == project_id,
        )
        .with_for_update()
    )
    run = await session.scalar(
        select(SearchIntelligenceRun)
        .where(
            SearchIntelligenceRun.workspace_id == workspace_id,
            SearchIntelligenceRun.project_id == project_id,
            SearchIntelligenceRun.id == run_id,
        )
        .with_for_update()
    )
    if run is None:
        raise SearchIntelligenceError("not_found", "Review not found")
    if run.confirmed_at is not None:
        return run
    now = _utcnow()
    _validate_confirmation(run, now)
    connection = await session.get(ProviderConnection, run.connection_id)
    if (
        connection is None
        or not connection.active
        or connection.credential_revision != run.connection_revision
    ):
        raise SearchIntelligenceError(
            "connection_changed", "DataForSEO connection changed; create a new review"
        )
    active_run = await session.scalar(
        select(SearchIntelligenceRun.id).where(
            SearchIntelligenceRun.workspace_id == workspace_id,
            SearchIntelligenceRun.project_id == project_id,
            SearchIntelligenceRun.id != run.id,
            SearchIntelligenceRun.status.in_(("queued", "running")),
        )
    )
    if active_run is not None:
        raise SearchIntelligenceError(
            "acquisition_in_progress",
            "Another Search Intelligence acquisition is already active",
        )
    run.confirmed_at = now
    if not run.call_plan:
        run.status = "succeeded"
        run.completed_at = now
        await session.commit()
        return run
    task_id = await enqueue_search_intelligence(
        session, workspace_id=workspace_id, project_id=project_id, run_id=run.id
    )
    if task_id is None:
        task = await session.scalar(
            select(AnalyticsTask).where(
                AnalyticsTask.idempotency_key
                == f"analytics:search_intelligence_acquisition:{run.id}"
            )
        )
        task_id = task.id if task else None
    run.analytics_task_id = task_id
    run.status = "queued"
    await session.commit()
    return run


async def cancel_run(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    run_id: uuid.UUID,
) -> SearchIntelligenceRun:
    run = await session.scalar(
        select(SearchIntelligenceRun)
        .where(
            SearchIntelligenceRun.workspace_id == workspace_id,
            SearchIntelligenceRun.project_id == project_id,
            SearchIntelligenceRun.id == run_id,
        )
        .with_for_update()
    )
    if run is None:
        raise SearchIntelligenceError("not_found", "Run not found")
    if run.status not in {"succeeded", "failed", "cancelled", "partial"}:
        run.status = "cancelled"
        run.cancelled_at = _utcnow()
        if run.analytics_task_id:
            task = await session.get(AnalyticsTask, run.analytics_task_id)
            if task and task.status not in {"succeeded", "failed", "cancelled"}:
                task.status = TASK_STATUS_CANCELLED
                task.completed_at = run.cancelled_at
        await session.commit()
    return run


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
            session, dataset, cursor=cursor, limit=limit, sort=sort, direction=direction
        )
    except UnsupportedSortError as exc:
        raise SearchIntelligenceError(
            "invalid_sort", "Dataset sort or direction is unsupported"
        ) from exc
    except ValueError as exc:
        raise SearchIntelligenceError(
            "invalid_cursor", "Dataset cursor is invalid"
        ) from exc
    return dataset_dict(dataset), [row_dict(row) for row in rows], next_cursor


async def update_preferences(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    preferences: SearchIntelligencePreferences,
) -> SearchIntelligencePreferences:
    project = await _project(session, workspace_id, project_id)
    project.search_intelligence_preferences = preferences.model_dump(mode="json")
    await session.commit()
    return preferences


async def content_handoff(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    row_ids: list[uuid.UUID],
) -> ContentHandoffResponse:
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
    rows = list(
        (
            await session.scalars(
                select(SearchIntelligenceRow).where(
                    SearchIntelligenceRow.workspace_id == workspace_id,
                    SearchIntelligenceRow.project_id == project_id,
                    SearchIntelligenceRow.dataset_id == dataset_id,
                    SearchIntelligenceRow.id.in_(row_ids),
                )
            )
        ).all()
    )
    if len(rows) != len(set(row_ids)):
        raise SearchIntelligenceError(
            "evidence_not_found", "One or more evidence rows are unavailable"
        )
    return ContentHandoffResponse(
        project_id=project_id,
        dataset_id=dataset_id,
        row_ids=row_ids,
        evidence=[{**row_dict(row), "dataset": dataset_dict(dataset)} for row in rows],
    )
