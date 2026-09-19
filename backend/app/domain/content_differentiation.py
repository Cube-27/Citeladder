"""Persist content-differentiation projections after source inspection."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import and_, or_, select, tuple_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.content_differentiation import (
    DifferentiationPage,
    analyze_content_differentiation,
)
from app.connectors.web_evidence.url_policy import registrable_domain
from app.core.config.content_differentiation import (
    DIFFERENTIATION_FORMULA_VERSION,
    DIFFERENTIATION_MAX_OWNED_PAGE_CANDIDATES,
    DIFFERENTIATION_MIN_SOURCE_CHARS,
)
from app.core.config.site_health_contracts import PAGE_ANALYSIS_STATUS_COMPLETED
from app.domain.content.lexical import lexical_tokens, normalized_coverage
from app.models.audit import Audit
from app.models.content_differentiation import (
    ContentDifferentiationCandidate,
    ContentDifferentiationReport,
)
from app.models.site_health.acquisition import SiteFetchArtifact
from app.models.site_health.analysis import SitePageAnalysis
from app.models.site_health.urls import SiteUrl
from app.models.source_pages import SourcePage, SourcePageSnapshot


def _headings(facts: dict[str, Any]) -> tuple[str, ...]:
    return tuple(
        str(item.get("text") or "")
        for item in facts.get("primary_heading_outline") or ()
        if isinstance(item, dict) and item.get("text")
    )


def _table_headers(facts: dict[str, Any]) -> tuple[tuple[str, ...], ...]:
    return tuple(
        tuple(str(value) for value in headers if str(value).strip())
        for headers in facts.get("primary_table_headers") or ()
        if isinstance(headers, list)
    )


def _outbound_domains(facts: dict[str, Any], *, owned_host: str) -> tuple[str, ...]:
    domains: set[str] = set()
    owned_domain = registrable_domain(owned_host) or owned_host.casefold()
    links = facts.get("links") or {}
    for anchor in links.get("anchors") or () if isinstance(links, dict) else ():
        if not isinstance(anchor, dict) or anchor.get("is_internal"):
            continue
        domain = registrable_domain(str(anchor.get("url") or ""))
        if domain and domain != owned_domain:
            domains.add(domain)
    return tuple(sorted(domains))


def _owned_page(site_url: SiteUrl, facts: dict[str, Any]) -> DifferentiationPage:
    return DifferentiationPage(
        page_id=str(site_url.id),
        headings=_headings(facts),
        table_headers=_table_headers(facts),
        outbound_domains=_outbound_domains(facts, owned_host=site_url.host),
    )


def _source_page(page: SourcePage, snapshot: SourcePageSnapshot) -> DifferentiationPage:
    facts = snapshot.page_facts or {}
    return DifferentiationPage(
        page_id=str(page.id),
        headings=tuple(str(value) for value in facts.get("headings") or ()),
        table_headers=tuple(
            tuple(str(value) for value in headers)
            for headers in facts.get("table_headers") or ()
            if isinstance(headers, list)
        ),
        outbound_domains=tuple(
            str(value) for value in facts.get("outbound_domains") or ()
        ),
    )


def _owned_relevance(query: str, site_url: SiteUrl, facts: dict[str, Any]) -> float:
    terms = lexical_tokens(query, min_length=2)
    if not terms:
        return 0.0
    text = " ".join(
        (
            str(facts.get("title") or site_url.latest_title or ""),
            " ".join(_headings(facts)),
            str(facts.get("primary_content_text") or ""),
        )
    )
    return float(normalized_coverage(terms, text) or 0.0)


CandidateRow = tuple[
    ContentDifferentiationCandidate, SourcePage, SourcePageSnapshot | None
]
OwnedRow = tuple[SitePageAnalysis, SiteFetchArtifact, SiteUrl]


def _candidate_snapshot(
    candidate: ContentDifferentiationCandidate,
    *,
    candidate_audit_created_at: datetime,
    snapshots: list[tuple[SourcePageSnapshot, datetime]],
) -> SourcePageSnapshot | None:
    for snapshot, _snapshot_audit_created_at in snapshots:
        if snapshot.audit_id == candidate.audit_id:
            return snapshot
    eligible = [
        (snapshot_audit_created_at, snapshot)
        for snapshot, snapshot_audit_created_at in snapshots
        if snapshot_audit_created_at < candidate_audit_created_at
    ]
    if not eligible:
        return None
    return max(eligible, key=lambda item: item[0])[1]


async def _load_candidates(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID,
    source_page_ids: set[uuid.UUID] | None = None,
) -> list[CandidateRow]:
    scopes = [ContentDifferentiationCandidate.audit_id == audit_id]
    if source_page_ids:
        affected_tasks = (
            select(
                ContentDifferentiationCandidate.audit_id,
                ContentDifferentiationCandidate.audit_task_id,
            )
            .where(
                ContentDifferentiationCandidate.workspace_id == workspace_id,
                ContentDifferentiationCandidate.project_id == project_id,
                ContentDifferentiationCandidate.source_page_id.in_(source_page_ids),
            )
            .distinct()
        )
        scopes.append(
            tuple_(
                ContentDifferentiationCandidate.audit_id,
                ContentDifferentiationCandidate.audit_task_id,
            ).in_(affected_tasks)
        )
    rows = (
        await session.execute(
            select(ContentDifferentiationCandidate, SourcePage)
            .join(
                SourcePage,
                and_(
                    SourcePage.id == ContentDifferentiationCandidate.source_page_id,
                    SourcePage.workspace_id
                    == ContentDifferentiationCandidate.workspace_id,
                    SourcePage.project_id == ContentDifferentiationCandidate.project_id,
                ),
            )
            .where(
                ContentDifferentiationCandidate.workspace_id == workspace_id,
                ContentDifferentiationCandidate.project_id == project_id,
                or_(*scopes),
            )
            .order_by(
                ContentDifferentiationCandidate.audit_id,
                ContentDifferentiationCandidate.audit_task_id,
                ContentDifferentiationCandidate.rank,
            )
        )
    ).all()
    if not rows:
        return []

    audit_ids = {candidate.audit_id for candidate, _page in rows}
    audit_time_rows = (
        await session.execute(
            select(Audit.id, Audit.created_at).where(
                Audit.workspace_id == workspace_id,
                Audit.project_id == project_id,
                Audit.id.in_(audit_ids),
            )
        )
    ).all()
    audit_times: dict[uuid.UUID, datetime] = {
        row.id: row.created_at for row in audit_time_rows
    }
    page_ids = {candidate.source_page_id for candidate, _page in rows}
    snapshot_rows = (
        await session.execute(
            select(SourcePageSnapshot, Audit.created_at)
            .join(Audit, Audit.id == SourcePageSnapshot.audit_id)
            .where(
                SourcePageSnapshot.workspace_id == workspace_id,
                SourcePageSnapshot.project_id == project_id,
                SourcePageSnapshot.source_page_id.in_(page_ids),
                Audit.workspace_id == workspace_id,
                Audit.project_id == project_id,
            )
            .order_by(
                SourcePageSnapshot.fetched_at.desc(),
                SourcePageSnapshot.id.desc(),
            )
        )
    ).all()
    snapshots_by_page: dict[uuid.UUID, list[tuple[SourcePageSnapshot, datetime]]] = (
        defaultdict(list)
    )
    for snapshot, snapshot_audit_created_at in snapshot_rows:
        snapshots_by_page[snapshot.source_page_id].append(
            (snapshot, snapshot_audit_created_at)
        )

    result: list[CandidateRow] = []
    for candidate, page in rows:
        candidate_time = audit_times.get(candidate.audit_id)
        snapshot = (
            _candidate_snapshot(
                candidate,
                candidate_audit_created_at=candidate_time,
                snapshots=snapshots_by_page[candidate.source_page_id],
            )
            if candidate_time is not None
            else None
        )
        result.append((candidate, page, snapshot))
    return result


async def _load_owned_pages(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> list[OwnedRow]:
    rows = await session.execute(
        select(SitePageAnalysis, SiteFetchArtifact, SiteUrl)
        .join(SiteFetchArtifact, SiteFetchArtifact.id == SitePageAnalysis.artifact_id)
        .join(SiteUrl, SiteUrl.id == SitePageAnalysis.site_url_id)
        .where(
            SitePageAnalysis.workspace_id == workspace_id,
            SitePageAnalysis.project_id == project_id,
            SitePageAnalysis.is_current.is_(True),
            SitePageAnalysis.crawl_id == SiteUrl.last_seen_crawl_id,
            SitePageAnalysis.status == PAGE_ANALYSIS_STATUS_COMPLETED,
        )
        .order_by(SiteFetchArtifact.fetched_at.desc(), SiteUrl.id)
        .limit(DIFFERENTIATION_MAX_OWNED_PAGE_CANDIDATES)
    )
    return [tuple(row) for row in rows.all()]


def _group_candidates(
    rows: list[CandidateRow],
) -> dict[tuple[uuid.UUID, uuid.UUID], list[CandidateRow]]:
    grouped: dict[tuple[uuid.UUID, uuid.UUID], list[CandidateRow]] = defaultdict(list)
    for candidate, page, snapshot in rows:
        grouped[(candidate.audit_id, candidate.audit_task_id)].append(
            (candidate, page, snapshot)
        )
    return grouped


def _select_owned_page(
    query: str, rows: list[OwnedRow]
) -> tuple[SiteUrl, dict[str, Any]] | None:
    choices: list[tuple[float, str, SiteUrl, dict[str, Any]]] = []
    for _analysis, artifact, site_url in rows:
        facts = artifact.normalized_facts or {}
        score = _owned_relevance(query, site_url, facts)
        if score > 0:
            choices.append((score, str(site_url.id), site_url, facts))
    if not choices:
        return None
    _score, _identity, site_url, facts = max(choices, key=lambda item: item[:2])
    return site_url, facts


def _usable_source(
    page: SourcePage, snapshot: SourcePageSnapshot | None
) -> DifferentiationPage | None:
    if snapshot is None or snapshot.outcome != "inspected":
        return None
    facts = snapshot.page_facts or {}
    usable = (
        bool(facts.get("parsed"))
        and facts.get("text_truncated") is False
        and snapshot.extracted_chars >= DIFFERENTIATION_MIN_SOURCE_CHARS
    )
    return _source_page(page, snapshot) if usable else None


def _comparison_evidence(
    rows: list[CandidateRow],
) -> tuple[list[DifferentiationPage], list[str], list[str]]:
    competitors: list[DifferentiationPage] = []
    candidate_ids: list[str] = []
    snapshot_ids: list[str] = []
    for candidate, page, snapshot in rows:
        candidate_ids.append(str(candidate.id))
        source = _usable_source(page, snapshot)
        if source is None or snapshot is None:
            continue
        competitors.append(source)
        snapshot_ids.append(str(snapshot.id))
    return competitors, candidate_ids, snapshot_ids


def _build_report(
    rows: list[CandidateRow], owned_rows: list[OwnedRow]
) -> tuple[uuid.UUID | None, dict[str, Any]]:
    query = rows[0][0].query_text
    selected = _select_owned_page(query, owned_rows)
    if selected is None:
        owned = DifferentiationPage("unresolved")
        owned_site_url_id = None
    else:
        site_url, facts = selected
        owned = _owned_page(site_url, facts)
        owned_site_url_id = site_url.id
    competitors, candidate_ids, snapshot_ids = _comparison_evidence(rows)
    report = analyze_content_differentiation(
        owned,
        competitors,
        selected_result_count=len(rows),
        candidate_ids=candidate_ids,
        snapshot_ids=snapshot_ids,
        search_context=rows[0][0].search_context,
    )
    report["query"] = query
    report["owned_page_selection"] = {
        "method": "highest_normalized_query_coverage",
        "site_url_id": str(owned_site_url_id) if owned_site_url_id else None,
    }
    if owned_site_url_id is None:
        report.update(
            state="insufficient_evidence",
            parity=[],
            gaps=[],
            unique_contributions=[],
        )
        report.setdefault("limitations", []).append(
            "No current owned page had usable lexical relevance to the measured prompt."
        )
    return owned_site_url_id, report


async def _upsert_report(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID,
    task_id: uuid.UUID,
    owned_site_url_id: uuid.UUID | None,
    report: dict[str, Any],
) -> None:
    values = {
        "owned_site_url_id": owned_site_url_id,
        "formula_version": DIFFERENTIATION_FORMULA_VERSION,
        "report": report,
    }
    await session.execute(
        pg_insert(ContentDifferentiationReport)
        .values(
            workspace_id=workspace_id,
            project_id=project_id,
            audit_id=audit_id,
            audit_task_id=task_id,
            **values,
        )
        .on_conflict_do_update(constraint="uq_content_diff_report_task", set_=values)
    )


async def refresh_content_differentiation_reports(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID,
    source_page_ids: set[uuid.UUID] | None = None,
) -> int:
    """Refresh current prompts plus reports linked to newly inspected pages."""
    grouped = _group_candidates(
        await _load_candidates(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            audit_id=audit_id,
            source_page_ids=source_page_ids,
        )
    )
    if not grouped:
        return 0
    owned_rows = await _load_owned_pages(
        session, workspace_id=workspace_id, project_id=project_id
    )
    for (report_audit_id, task_id), rows in grouped.items():
        owned_site_url_id, report = _build_report(rows, owned_rows)
        await _upsert_report(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            audit_id=report_audit_id,
            task_id=task_id,
            owned_site_url_id=owned_site_url_id,
            report=report,
        )
    return len(grouped)


async def list_content_differentiation_reports(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int = 50,
) -> list[ContentDifferentiationReport]:
    return list(
        (
            await session.scalars(
                select(ContentDifferentiationReport)
                .where(
                    ContentDifferentiationReport.workspace_id == workspace_id,
                    ContentDifferentiationReport.project_id == project_id,
                )
                .order_by(
                    ContentDifferentiationReport.created_at.desc(),
                    ContentDifferentiationReport.id.desc(),
                )
                .limit(limit)
            )
        ).all()
    )
