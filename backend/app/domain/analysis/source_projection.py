"""Complete selected citation counts, independent of evidence pagination."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import String, cast, func, select

from app.core.config.analysis import VISIBILITY_EVIDENCE_DEFAULT_LIMIT
from app.domain.analysis.errors import TrendQueryError
from app.domain.analysis.evidence import (
    _assert_selected_audit,
    _evidence_statement,
    _validated_evidence_request,
)
from app.domain.analysis.schemas import SourceRow, SourcesResponse
from app.models.analysis import Citation, ResponseAnalysis
from app.models.audit import AuditPromptSnapshot


async def get_visibility_sources(
    session,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID | None = None,
    logical_engine: str | None = None,
    cohort: str = "core",
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    domain: str | None = None,
    source_class: str | None = None,
    offset: int = 0,
    limit: int = VISIBILITY_EVIDENCE_DEFAULT_LIMIT,
    as_of: datetime | None = None,
    audit_ids: list[uuid.UUID] | None = None,
    baseline_audit_ids: list[uuid.UUID] | None = None,
) -> SourcesResponse:
    from_at, to_at = _validated_evidence_request(
        logical_engine=logical_engine,
        from_at=from_at,
        to_at=to_at,
        limit=limit,
        cohort=cohort,
    )
    await _assert_selected_audit(
        session, workspace_id=workspace_id, project_id=project_id, audit_id=audit_id
    )
    as_of = _source_boundary(as_of)
    from app.domain.analysis.selection import authorize_run_set

    await authorize_run_set(
        session, workspace_id=workspace_id, project_id=project_id, audit_ids=audit_ids
    )
    prompt_key = func.coalesce(
        cast(AuditPromptSnapshot.prompt_id, String), AuditPromptSnapshot.text
    )
    statement = _evidence_statement(
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=audit_id,
        prompt_id=None,
        logical_engine=logical_engine,
        from_at=from_at,
        to_at=to_at,
        limit=None,
        cohort=cohort,
    ).where(ResponseAnalysis.created_at <= as_of)
    if audit_ids:
        statement = statement.where(ResponseAnalysis.audit_id.in_(audit_ids))
    scope = (
        statement.with_only_columns(
            ResponseAnalysis.id.label("analysis_id"),
            prompt_key.label("prompt_key"),
        )
        .order_by(None)
        .subquery()
    )
    denominator, prompts = (
        await session.execute(
            select(
                func.count(scope.c.analysis_id),
                func.count(func.distinct(scope.c.prompt_key)),
            )
        )
    ).one()
    key = Citation.url if domain else Citation.domain
    grouped = (
        select(
            key.label("key"),
            func.count(func.distinct(Citation.analysis_id)).label("responses"),
            func.count(func.distinct(scope.c.prompt_key)).label("prompts"),
            func.count(Citation.id).label("annotations"),
            func.count(func.distinct(Citation.url)).label("urls"),
            func.array_agg(func.distinct(Citation.classification)).label("ownership"),
            func.array_agg(func.distinct(Citation.source_class)).label("categories"),
            func.array_agg(func.distinct(Citation.source_taxonomy_version)).label(
                "versions"
            ),
        )
        .join(scope, scope.c.analysis_id == Citation.analysis_id)
        .where(
            Citation.workspace_id == workspace_id,
        )
    )
    if domain:
        grouped = grouped.where(Citation.domain == domain)
    # Filtering here rather than on the loaded page keeps `total`, `next_offset`
    # and the rows describing the same set. A client-side filter left the footer
    # counting domains the table was no longer showing.
    if source_class:
        grouped = grouped.where(Citation.source_class == source_class)
    source_groups = grouped.group_by(key).subquery()
    total = await session.scalar(select(func.count()).select_from(source_groups))
    category_totals = await _category_totals(
        session, workspace_id=workspace_id, scope=scope, domain=domain
    )
    rows = (
        (
            await session.execute(
                select(source_groups)
                .order_by(
                    source_groups.c.responses.desc(),
                    source_groups.c.key.asc(),
                )
                .offset(offset)
                .limit(limit)
            )
        )
        .mappings()
        .all()
    )
    response = SourcesResponse(
        total=total or 0,
        responses=denominator,
        prompts=prompts,
        as_of=as_of,
        next_offset=offset + limit if offset + limit < (total or 0) else None,
        category_totals=category_totals,
        items=[_source_row(row, denominator, prompts) for row in rows],
    )
    if baseline_audit_ids:
        from app.domain.analysis.source_comparison import apply_source_comparison

        await apply_source_comparison(
            session,
            response=response,
            workspace_id=workspace_id,
            project_id=project_id,
            current_ids=audit_ids or ([audit_id] if audit_id else []),
            baseline_ids=baseline_audit_ids,
            engine=logical_engine,
            cohort=cohort,
            domain=domain,
            as_of=as_of,
        )
    return response


def _source_row(row, denominator, prompts):
    return SourceRow(
        key=row["key"],
        responses=row["responses"],
        prompts=row["prompts"],
        annotations=row["annotations"],
        urls=row["urls"],
        response_rate=row["responses"] / denominator if denominator else None,
        prompt_coverage=row["prompts"] / prompts if prompts else None,
        ownership=sorted(value for value in row["ownership"] if value),
        categories=sorted(value for value in row["categories"] if value),
        taxonomy_versions=sorted(value for value in row["versions"] if value),
        category_unavailable=None in row["categories"],
    )


def _source_boundary(as_of):
    boundary = as_of or datetime.now(UTC)
    if boundary.tzinfo is None:
        raise TrendQueryError("'as_of' must be timezone-aware")
    return boundary


async def _category_totals(session, *, workspace_id, scope, domain) -> dict[str, int]:
    """Distinct cited domains per source class, across the whole selection.

    Counted server-side because the rows are paginated: a client folding the
    page it happens to hold would present page one as the mix. Distinct DOMAINS
    rather than citations, so one heavily cited site cannot look like a whole
    category.
    """
    statement = (
        select(
            Citation.source_class,
            func.count(func.distinct(Citation.domain)).label("domains"),
        )
        .join(scope, scope.c.analysis_id == Citation.analysis_id)
        .where(
            Citation.workspace_id == workspace_id,
            Citation.source_class.is_not(None),
        )
    )
    if domain:
        statement = statement.where(Citation.domain == domain)
    rows = (await session.execute(statement.group_by(Citation.source_class))).all()
    return {
        str(source_class): int(count) for source_class, count in rows if source_class
    }
