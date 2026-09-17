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
from app.domain.analysis.source_mentions import attach_row_mentions
from app.domain.analysis.source_page_links import attach_page_links
from app.models.analysis import Citation, ResponseAnalysis
from app.models.audit import AuditPromptSnapshot
from app.models.source_pages import SourcePage


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
    dimension: str = "domain",
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
    scope = await _scope(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=audit_id,
        audit_ids=audit_ids,
        logical_engine=logical_engine,
        cohort=cohort,
        from_at=from_at,
        to_at=to_at,
        as_of=as_of,
    )
    denominator, prompts = (
        await session.execute(
            select(
                func.count(scope.c.analysis_id),
                func.count(func.distinct(scope.c.prompt_key)),
            )
        )
    ).one()
    # A domain row groups a publisher; a URL row is one page. Selecting a
    # domain implies pages, because that is the drill-down; asking for the URL
    # dimension gets pages across every domain, which is the URL table.
    pages = bool(domain) or dimension == "url"
    grouped = _grouped_sources(
        scope,
        workspace_id=workspace_id,
        project_id=project_id,
        domain=domain,
        source_class=source_class,
        pages=pages,
    )
    key = Citation.url if pages else Citation.domain
    source_groups = grouped.group_by(key).subquery()
    total = await session.scalar(select(func.count()).select_from(source_groups))
    # The share denominator follows the SAME filters as the rows, so the
    # shares of a filtered table add to 100% within that filter rather than
    # to whatever fraction of the project it happens to be.
    total_citations = int(
        await session.scalar(
            select(func.coalesce(func.sum(source_groups.c.annotations), 0)).select_from(
                source_groups
            )
        )
        or 0
    )
    category_totals = await _category_totals(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        scope=scope,
        domain=domain,
        source_class=source_class,
        pages=pages,
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
        total_citations=total_citations,
        as_of=as_of,
        next_offset=offset + limit if offset + limit < (total or 0) else None,
        category_totals=category_totals,
        items=[
            _source_row(
                row,
                denominator,
                prompts,
                total_citations,
                pages=pages,
            )
            for row in rows
        ],
    )
    await attach_page_links(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        items=response.items,
    )
    if pages:
        await attach_row_mentions(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            scope=scope,
            items=response.items,
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


async def _scope(
    session,
    *,
    workspace_id,
    project_id,
    audit_id,
    audit_ids,
    logical_engine,
    cohort,
    from_at,
    to_at,
    as_of,
):
    """Every response the selection covers, with the prompt it answered.

    The denominator for every rate below it. Bounded by ``as_of`` as well as by
    the period, so paging through a table cannot silently include rows written
    by a run that finished while the reader was on page two.
    """
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
    return (
        statement.with_only_columns(
            ResponseAnalysis.id.label("analysis_id"),
            prompt_key.label("prompt_key"),
        )
        .order_by(None)
        .subquery()
    )


def _grouped_sources(scope, *, workspace_id, project_id, domain, source_class, pages):
    """One row per source, with every count the table and the ring need.

    A domain row groups a publisher; a URL row is one page. Selecting a domain
    implies pages, because that is the drill-down; asking for the URL dimension
    gets pages across every domain, which is the URL table.
    """
    key = Citation.url if pages else Citation.domain
    grouped = (
        select(
            key.label("key"),
            # Page identity, grouped alongside everything else rather than
            # re-scanned: ``citations`` has no index on ``url``, so a second
            # lookup by URL would sweep the workspace's whole history.
            # Meaningless for a domain row, which is why it is only read
            # through for page rows.
            func.min(Citation.url_hash).label("url_hash"),
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
        .where(Citation.workspace_id == workspace_id)
    )
    if domain:
        grouped = grouped.where(Citation.domain == domain)
    # Filtering here rather than on the loaded page keeps `total`, `next_offset`
    # and the rows describing the same set. A client-side filter left the footer
    # counting domains the table was no longer showing.
    #
    # WHICH taxonomy the filter means follows what a row is, exactly as the
    # type ring above the table does: a domain row is filtered by its
    # publisher class, a page row by its own page format.
    if not source_class:
        return grouped
    if pages:
        return grouped.join(
            SourcePage,
            (SourcePage.url_hash == Citation.url_hash)
            & (SourcePage.project_id == project_id),
        ).where(SourcePage.page_format == source_class)
    return grouped.where(Citation.source_class == source_class)


def _ratio(numerator, denominator):
    """A rate, or ``None`` when its denominator says the question was not asked.

    Zero over zero is not zero: a selection with no responses has not observed
    a rate of nought, it has observed nothing.
    """
    return numerator / denominator if denominator else None


def _source_row(row, denominator, prompts, total_citations, *, pages: bool = False):
    responses = row["responses"]
    annotations = row["annotations"]
    return SourceRow(
        key=row["key"],
        url_hash=row["url_hash"] if pages else None,
        responses=responses,
        prompts=row["prompts"],
        annotations=annotations,
        urls=row["urls"],
        response_rate=_ratio(responses, denominator),
        prompt_coverage=_ratio(row["prompts"], prompts),
        # Unique URLs per response, which is a question about a PUBLISHER: how
        # much of its site the engines reached. A page row is one URL by
        # construction, so the same arithmetic there is just `1 / responses`
        # wearing a metric's name. Left unset rather than computed.
        retrieval_rate=None if pages else _ratio(row["urls"], denominator),
        citation_share=_ratio(annotations, total_citations),
        # Per response the source was RETRIEVED in, never per response in the
        # selection: the question is how heavily a source is quoted when it is
        # used, which a project-wide denominator would flatten.
        citation_rate=_ratio(annotations, responses),
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


async def _category_totals(
    session, *, workspace_id, project_id, scope, domain, source_class, pages
) -> dict[str, int]:
    """Citations per type, across the whole selection.

    Counted server-side because the rows are paginated: a client folding the
    page it happens to hold would present page one as the mix.

    CITATIONS rather than distinct domains or pages: the source-type ring
    reports a citation total and each segment's share of it, so a mix counted
    in anything else would not add up to the number printed in its centre.

    Which taxonomy is counted follows what a row IS. Domain rows are grouped by
    the publisher class carried on the citation itself. Page rows are grouped by
    page format, which lives on the page record, so those have to be counted
    through the identity join -- and a citation whose identity was never
    resolved is absent rather than counted as an unknown kind.

    The type filter applies here too. The ring prints the same
    ``total_citations`` the rows are shares of, and that total follows the
    filter -- so a ring that ignored it would disagree with the number in its
    own centre.
    """
    if pages:
        return await _format_totals(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            scope=scope,
            domain=domain,
            source_class=source_class,
        )
    statement = (
        select(
            Citation.source_class,
            func.count(Citation.id).label("citations"),
        )
        .join(scope, scope.c.analysis_id == Citation.analysis_id)
        .where(
            Citation.workspace_id == workspace_id,
            Citation.source_class.is_not(None),
        )
    )
    if domain:
        statement = statement.where(Citation.domain == domain)
    if source_class:
        statement = statement.where(Citation.source_class == source_class)
    rows = (await session.execute(statement.group_by(Citation.source_class))).all()
    return {
        str(source_class): int(count) for source_class, count in rows if source_class
    }


async def _format_totals(
    session, *, workspace_id, project_id, scope, domain, source_class
) -> dict[str, int]:
    """Citations per page format, joined through page identity."""
    statement = (
        select(SourcePage.page_format, func.count(Citation.id).label("citations"))
        .join(scope, scope.c.analysis_id == Citation.analysis_id)
        .join(
            SourcePage,
            (SourcePage.url_hash == Citation.url_hash)
            & (SourcePage.project_id == project_id),
        )
        .where(
            Citation.workspace_id == workspace_id,
            Citation.url_hash.is_not(None),
        )
    )
    if domain:
        statement = statement.where(Citation.domain == domain)
    if source_class:
        statement = statement.where(SourcePage.page_format == source_class)
    rows = (await session.execute(statement.group_by(SourcePage.page_format))).all()
    return {str(page_format): int(count) for page_format, count in rows if page_format}
