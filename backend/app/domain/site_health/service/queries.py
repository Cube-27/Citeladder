"""Site Health read paths retained for Agent/MCP callers: crawl summary and pages.

The workspace-scoped projections behind the list/detail endpoints. Every query
here is bounded by the resolved workspace and (for crawl-scoped reads) by what
the crawl actually admitted, so a later downgraded crawl can never surface an
earlier, fuller catalog. Row shaping lives in ``presentation``; the grouped
issue catalog — the other half of the read surface — lives in ``issues``.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from typing import Any

from sqlalchemy import case, func, literal, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.site_health_contracts import (
    CRAWL_STATUS_FAILED,
    PAGE_ANALYSIS_STATUS_COMPLETED,
    PAGE_ANALYSIS_STATUS_PARTIALLY_COMPLETED,
    TASK_KIND_ANALYZE,
)
from app.domain.site_health.failure import load_root_errors, load_root_failure_summary
from app.domain.site_health.inventory_scope import (
    inventory_site_url_subquery,
)
from app.domain.site_health.normalization import encode_keyset_cursor
from app.domain.site_health.service.common import (
    _decode_url_keyset,
    _load_crawl,
)
from app.domain.site_health.service.link_projections import (
    PAGE_SORTS,
    _page_link_fields,
    _sorted_page_stmt,
)
from app.domain.site_health.service.measurement_projection import (
    page_measurement_fields,
)
from app.domain.site_health.service.presentation import (
    _matches_page_status,
    _page_kind_matches,
    presentation_status_for,
    project_crawl,
)
from app.models.site_health.analysis import SiteIssue, SitePageAnalysis
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.links import SitePageLinkMetric
from app.models.site_health.queue import SiteCrawlTask
from app.models.site_health.urls import MonitoredSiteUrl, SiteUrl


# =========================================================================
# Crawl summary / list
# =========================================================================
async def _failure_summary_for(session: AsyncSession, crawl: SiteCrawl) -> dict | None:
    """B1 failure summary for the single-crawl read paths.

    Only a FAILED crawl can have one (a terminally failed root fetch is what
    makes a crawl fail), so healthy/partial crawls skip the evidence queries
    entirely. List projections stay ``None`` by not calling this (N+1
    avoidance).
    """
    if crawl.status != CRAWL_STATUS_FAILED:
        return None
    return await load_root_failure_summary(session, crawl=crawl)


async def _root_errors_for(session: AsyncSession, crawl: SiteCrawl) -> list[dict]:
    """B3 root-failure rows for the pages/dashboard responses (same guard)."""
    if crawl.status != CRAWL_STATUS_FAILED:
        return []
    return await load_root_errors(session, crawl=crawl)


async def get_crawl_summary(
    session: AsyncSession, *, workspace_id: uuid.UUID, crawl_id: uuid.UUID
) -> dict:
    crawl = await _load_crawl(session, workspace_id=workspace_id, crawl_id=crawl_id)
    return project_crawl(
        crawl, failure_summary=await _failure_summary_for(session, crawl)
    )


async def _monitored_site_url_ids(
    session: AsyncSession, *, project_id: uuid.UUID
) -> set[uuid.UUID]:
    """Set of ACTIVE monitored ``site_url_id`` for a project."""
    rows = await session.execute(
        select(MonitoredSiteUrl.site_url_id).where(
            MonitoredSiteUrl.project_id == project_id,
            MonitoredSiteUrl.active.is_(True),
        )
    )
    return {row[0] for row in rows.all()}


async def _latest_analysis_by_site_url(
    session: AsyncSession,
    *,
    crawl_id: uuid.UUID,
    site_url_ids: list[uuid.UUID],
) -> dict[uuid.UUID, SitePageAnalysis]:
    """Current ``SitePageAnalysis`` per site_url within a crawl.

    ``SitePageAnalysis`` is append-only, so one artifact can hold several rows
    (one per analyzer/pack version pair). Only the ``is_current`` row is the
    live understanding; superseded rows stay queryable as history but must
    never surface as a page's present state.
    """
    if not site_url_ids:
        return {}
    rows = await session.execute(
        select(SitePageAnalysis)
        .where(
            SitePageAnalysis.crawl_id == crawl_id,
            SitePageAnalysis.site_url_id.in_(site_url_ids),
            SitePageAnalysis.is_current.is_(True),
        )
        .order_by(
            SitePageAnalysis.site_url_id,
            SitePageAnalysis.created_at.asc(),
            SitePageAnalysis.id.asc(),
        )
    )
    latest: dict[uuid.UUID, SitePageAnalysis] = {}
    for analysis in rows.scalars().all():
        latest[analysis.site_url_id] = analysis  # last wins = newest
    return latest


async def _latest_analyze_task_by_site_url(
    session: AsyncSession,
    *,
    crawl_id: uuid.UUID,
    site_url_ids: list[uuid.UUID],
) -> dict[uuid.UUID, SiteCrawlTask]:
    """Latest ``analyze`` task per site_url within a crawl (by generation)."""
    if not site_url_ids:
        return {}
    rows = await session.execute(
        select(SiteCrawlTask)
        .where(
            SiteCrawlTask.crawl_id == crawl_id,
            SiteCrawlTask.task_kind == TASK_KIND_ANALYZE,
            SiteCrawlTask.site_url_id.in_(site_url_ids),
        )
        .order_by(
            SiteCrawlTask.site_url_id,
            SiteCrawlTask.generation.asc(),
            SiteCrawlTask.created_at.asc(),
        )
    )
    latest: dict[uuid.UUID, SiteCrawlTask] = {}
    for task in rows.scalars().all():
        if task.site_url_id is not None:
            latest[task.site_url_id] = task  # last wins = newest generation
    return latest


async def _issue_counts_by_site_url(
    session: AsyncSession,
    *,
    crawl_id: uuid.UUID,
    site_url_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    """Count of persisted issues per site_url within a crawl."""
    if not site_url_ids:
        return {}
    rows = await session.execute(
        select(SiteIssue.site_url_id, func.count())
        .where(
            SiteIssue.crawl_id == crawl_id,
            SiteIssue.site_url_id.in_(site_url_ids),
        )
        .group_by(SiteIssue.site_url_id)
    )
    return {row[0]: int(row[1]) for row in rows.all()}


def _matching_page_summaries(
    rows: Sequence[tuple[SiteUrl, Any]],
    *,
    analyses: dict[uuid.UUID, SitePageAnalysis],
    tasks: dict[uuid.UUID, SiteCrawlTask],
    monitored_ids: set[uuid.UUID],
    status: str | None,
    page_kind: str | None,
    limit: int,
    project: Callable[[SiteUrl, SitePageAnalysis | None, str, str | None], dict],
    terminal: bool = False,
) -> tuple[list[dict], tuple[SiteUrl, Any] | None]:
    """Project matching rows and retain the last scanned key for pagination.

    Status and page-kind are derived from persisted analysis/task state rather
    than SQL columns.  Keeping their filtering loop shared ensures inventory
    and pages have identical compound-status semantics and sparse-page cursor
    behavior.
    """
    items: list[dict] = []
    last_scanned: tuple[SiteUrl, Any] | None = None
    for scanned in rows:
        last_scanned = scanned
        row, _sort_value = scanned
        analysis = analyses.get(row.id)
        presentation_status, error_code = presentation_status_for(
            analysis=analysis,
            monitored=row.id in monitored_ids,
            latest_analyze_task=tasks.get(row.id),
            terminal=terminal,
        )
        if not _matches_page_status(presentation_status, status):
            continue
        if not _page_kind_matches(analysis, page_kind):
            continue
        items.append(project(row, analysis, presentation_status, error_code))
        if len(items) >= limit + 1:
            break
    return items, last_scanned


def _page_keyset_result(
    items: list[dict],
    *,
    scanned_sort_values: dict[uuid.UUID, Any],
    last_scanned: tuple[SiteUrl, Any] | None,
    scanned_row_count: int,
    fetch_size: int,
    limit: int,
    sparse_filter: bool,
    scope: str,
    filters: dict,
) -> tuple[list[dict], str | None]:
    """Trim a page and emit either a matched or sparse-scan cursor.

    A full widened scan that yields too few matches advances at the final
    scanned key.  That distinction prevents sparse derived filters from
    repeating an empty window forever.

    The cursor's leading value is whatever the active sort ORDERED BY — the
    normalized URL by default, a link metric otherwise — so the two can never
    disagree about where the next page starts.
    """
    if len(items) > limit:
        kept = items[:limit]
        last_kept = kept[-1]
        return kept, encode_keyset_cursor(
            scope=scope,
            filters=filters,
            sort_values=[
                scanned_sort_values[last_kept["site_url_id"]],
                str(last_kept["site_url_id"]),
            ],
        )
    if sparse_filter and last_scanned is not None and scanned_row_count >= fetch_size:
        row, sort_value = last_scanned
        return items, encode_keyset_cursor(
            scope=scope, filters=filters, sort_values=[sort_value, str(row.id)]
        )
    return items, None


def _pages_summary_row(
    row: SiteUrl,
    analysis: SitePageAnalysis | None,
    presentation_status: str,
    error_code: str | None,
    *,
    crawl_id: uuid.UUID,
    current_observed_ids: set[uuid.UUID],
    inherited_crawl_by_url: dict[uuid.UUID, uuid.UUID],
    monitored_ids: set[uuid.UUID],
    issue_counts: dict[uuid.UUID, int],
    link_metric: SitePageLinkMetric | None = None,
) -> dict:
    """Render one persisted page projection, including inherited inventory.

    Link columns are ``None`` — never ``0`` — when this crawl has no metric row
    for the URL: "not measured" and "nothing links here" are different facts.
    """
    return {
        **_page_link_fields(link_metric),
        **page_measurement_fields(analysis),
        "site_url_id": row.id,
        "crawl_id": (
            crawl_id
            if row.id in current_observed_ids
            else inherited_crawl_by_url.get(row.id, crawl_id)
        ),
        "normalized_url": row.normalized_url,
        "display_url": row.display_url or row.normalized_url,
        "title": row.latest_title or None,
        "monitored": row.id in monitored_ids,
        "analysis_status": presentation_status,
        "error_code": error_code,
        "issue_count": issue_counts.get(row.id, 0) if analysis is not None else None,
    }


def _scan_window(limit: int, *, over_fetch: bool) -> int:
    """Rows to scan for one page: the page itself, widened for sparse filters.

    Shared so the SELECT's LIMIT and the callers' "did we scan a full window?"
    cursor-advance check can never disagree — if they drift, a sparse filter
    either stops paginating early or loops on the same window forever.
    """
    fetch = limit + 1
    return fetch * 4 if over_fetch else fetch


_PERSISTED_ANALYSIS_STATUSES = {
    PAGE_ANALYSIS_STATUS_COMPLETED,
    PAGE_ANALYSIS_STATUS_PARTIALLY_COMPLETED,
}


def _analysis_page_filters(
    *, crawl_id: uuid.UUID, status: str | None, page_kind: str | None
) -> tuple[list[Any], str | None]:
    """Push persisted-analysis filters ahead of keyset pagination.

    Completed status and page kind come directly from the current analysis row.
    Filtering them after the URL window produced sparse pages with a valid Next
    cursor even when many matching analyses existed later in the crawl.
    Task-derived statuses still use the bounded presentation scan.
    """
    analysis_filters: list[Any] = [
        SitePageAnalysis.crawl_id == crawl_id,
        SitePageAnalysis.is_current.is_(True),
    ]
    persisted_status = status in _PERSISTED_ANALYSIS_STATUSES
    if persisted_status:
        analysis_filters.append(SitePageAnalysis.status == status)
    if page_kind is not None:
        analysis_filters.append(SitePageAnalysis.page_kind == page_kind)
    clauses: list[Any] = []
    if persisted_status or page_kind is not None:
        clauses.append(
            SiteUrl.id.in_(
                select(SitePageAnalysis.site_url_id).where(*analysis_filters)
            )
        )
    return clauses, None if persisted_status else status


_DEFAULT_PAGE_SORT = "status"


def _status_sort_expression(crawl_id: uuid.UUID):
    """Measured rows first, then terminal failures/unmeasured rows by URL."""
    measured = (
        select(SitePageAnalysis.id)
        .where(
            SitePageAnalysis.crawl_id == crawl_id,
            SitePageAnalysis.site_url_id == SiteUrl.id,
            SitePageAnalysis.is_current.is_(True),
            SitePageAnalysis.status.in_(_PERSISTED_ANALYSIS_STATUSES),
        )
        .exists()
    )
    rank = case((measured, literal("0:")), else_=literal("1:"))
    return rank + SiteUrl.normalized_url


def _site_url_page_stmt(
    crawl: SiteCrawl,
    *,
    monitored: bool | None,
    monitored_ids: set[uuid.UUID] | frozenset[uuid.UUID],
    cursor: str | None,
    scope: str,
    filters: dict,
    limit: int,
    over_fetch: bool,
    extra_where: Sequence[Any] = (),
    sort: str = _DEFAULT_PAGE_SORT,
):
    """The shared keyset page over a crawl's SiteUrls, as ``(row, sort_value)``.

    Returns ``None`` when the filters select nothing, so callers short-circuit
    to an empty page.

    ``over_fetch`` widens the fetch when a status/page_kind filter is applied
    in Python from the derived presentation status, so a filtered page can
    still come back full. ``extra_where`` carries caller-specific predicates
    (the inventory's substring search) so they are applied with the rest of
    the filtering, before ordering and limiting. ``sort`` selects the keyset:
    ``status`` (measured rows first), ``url``, or one of the link-metric sorts,
    which LEFT JOIN this crawl's ``SitePageLinkMetric`` projection.

    The statement always yields ``(SiteUrl, sort_value)`` so the caller's
    cursor is built from the value the database actually ordered by.
    """
    stmt = select(SiteUrl).where(
        SiteUrl.project_id == crawl.project_id,
        SiteUrl.id.in_(inventory_site_url_subquery(crawl)),
    )
    for clause in extra_where:
        stmt = stmt.where(clause)
    if monitored is True:
        if not monitored_ids:
            return None
        stmt = stmt.where(SiteUrl.id.in_(list(monitored_ids)))
    elif monitored is False and monitored_ids:
        stmt = stmt.where(SiteUrl.id.notin_(list(monitored_ids)))

    window = _scan_window(limit, over_fetch=over_fetch)
    if sort == _DEFAULT_PAGE_SORT:
        expression = _status_sort_expression(crawl.id)
        stmt = stmt.add_columns(expression.label("sort_value"))
        if cursor:
            cur_value, cur_id = _decode_url_keyset(cursor, scope=scope, filters=filters)
            stmt = stmt.where(tuple_(expression, SiteUrl.id) > (cur_value, cur_id))
        return stmt.order_by(expression.asc(), SiteUrl.id.asc()).limit(window)
    if sort in PAGE_SORTS and sort not in {_DEFAULT_PAGE_SORT, "url"}:
        stmt = _sorted_page_stmt(
            stmt, crawl=crawl, sort=sort, cursor=cursor, scope=scope, filters=filters
        )
        return stmt.limit(window)

    stmt = stmt.add_columns(SiteUrl.normalized_url.label("sort_value"))
    if cursor:
        cur_url, cur_id = _decode_url_keyset(cursor, scope=scope, filters=filters)
        stmt = stmt.where(
            tuple_(SiteUrl.normalized_url, SiteUrl.id) > (cur_url, cur_id)
        )
    return stmt.order_by(SiteUrl.normalized_url.asc(), SiteUrl.id.asc()).limit(window)
