"""Turning an audit's citations into the project's inventory of cited pages.

Runs after an audit terminalizes and before anything is fetched. It creates a
record for each newly cited page, refreshes recurrence and last-cited for ones
already known, and marks aged records stale so they become candidates again.

Recurrence here counts DISTINCT ANSWERS in the audit that cited a page, and it
exists to rank inspection candidates. It is not the figure any view reports as
a citation count: a reader filtering by engine, cohort or period is asking a
different question, and the source projection answers that one from the full
captured evidence. Conflating the two would let a scheduling number masquerade
as a measurement.

Unresolved redirect tokens are grouped by the domain their title implies and
admitted a few per publisher. Before resolution every token looks unique, so
ranking purely by recurrence would starve exactly the engines that redirect,
while admitting all of them would let one publisher consume the window.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, case, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.content_differentiation import organic_results
from app.analysis.source_pages.url_format import derive_url_format
from app.core.config.content_differentiation import DIFFERENTIATION_RESULT_LIMIT
from app.core.config.source_pages import (
    INSPECTION_INSPECTED,
    INSPECTION_STALE,
    PAGE_FORMAT_METHOD_NONE,
    PAGE_FORMAT_METHOD_URL_PATTERN,
    SOURCE_PAGE_FORMAT_VERSION,
    SOURCE_PAGE_INSPECTOR_VERSION,
    SOURCE_PAGE_MAX_REDIRECTS_PER_DOMAIN,
    SOURCE_PAGE_STALE_AFTER_HOURS,
    URL_IDENTITY_UNRESOLVED,
)
from app.domain.source_pages.identity import CitationIdentity, identify_citation_url
from app.models.analysis import Citation, ResponseAnalysis
from app.models.audit import Audit, AuditTask, RawResponseArtifact
from app.models.content_differentiation import ContentDifferentiationCandidate
from app.models.source_pages import SourcePage


@dataclass(frozen=True, slots=True)
class UnresolvedCitation:
    """A redirect token awaiting resolution."""

    url: str


def _stale_before(now: datetime) -> datetime:
    return now - timedelta(hours=SOURCE_PAGE_STALE_AFTER_HOURS)


# Which existing page-format evidence a URL-derived verdict is allowed to
# replace. NULL is included explicitly: rows written before the format column
# carried a method have no method at all, and `IN (...)` is never true for
# NULL, so without this they would be the only pages that never got a format.
_weak_format = SourcePage.page_format_method.is_(None) | (
    SourcePage.page_format_method.in_(
        (PAGE_FORMAT_METHOD_URL_PATTERN, PAGE_FORMAT_METHOD_NONE)
    )
)


async def _resolved_rows(
    session: AsyncSession, *, audit: Audit
) -> list[tuple[str, str, str, str | None, str | None, int]]:
    """Per cited page: identity, classification, and distinct answers citing it."""
    statement = (
        select(
            Citation.url_hash,
            func.min(Citation.canonical_url),
            func.min(Citation.domain),
            func.min(Citation.source_class),
            func.min(Citation.source_taxonomy_version),
            func.count(func.distinct(Citation.analysis_id)),
        )
        .where(
            Citation.workspace_id == audit.workspace_id,
            Citation.audit_id == audit.id,
            Citation.url_hash.is_not(None),
            Citation.is_owned.is_(False),
        )
        .group_by(Citation.url_hash)
    )
    return [tuple(row) for row in (await session.execute(statement)).all()]


async def _unresolved_rows(
    session: AsyncSession, *, audit: Audit
) -> tuple[UnresolvedCitation, ...]:
    statement = (
        select(Citation.url, Citation.domain)
        .where(
            Citation.workspace_id == audit.workspace_id,
            Citation.audit_id == audit.id,
            Citation.url_identity_method == URL_IDENTITY_UNRESOLVED,
            Citation.is_owned.is_(False),
        )
        .join(ResponseAnalysis, ResponseAnalysis.id == Citation.analysis_id)
        .order_by(Citation.domain, Citation.url)
    )
    per_domain: dict[str, list[UnresolvedCitation]] = defaultdict(list)
    seen: set[str] = set()
    for url, domain in (await session.execute(statement)).all():
        raw = str(url or "")
        if not raw or raw in seen:
            continue
        seen.add(raw)
        bucket = per_domain[str(domain or "")]
        if len(bucket) < SOURCE_PAGE_MAX_REDIRECTS_PER_DOMAIN:
            bucket.append(UnresolvedCitation(url=raw))
    return tuple(item for bucket in per_domain.values() for item in bucket)


async def sync_cited_pages(
    session: AsyncSession, *, audit: Audit, now: datetime | None = None
) -> tuple[UnresolvedCitation, ...]:
    """Record every page this audit cited, and report tokens needing a hop."""
    moment = now or datetime.now(UTC)
    rows = await _resolved_rows(session, audit=audit)
    for (
        url_hash,
        canonical_url,
        domain,
        source_class,
        taxonomy_version,
        answers,
    ) in rows:
        url_format, url_format_method = derive_url_format(canonical_url or "")
        statement = (
            pg_insert(SourcePage)
            .values(
                workspace_id=audit.workspace_id,
                project_id=audit.project_id,
                url_hash=url_hash,
                canonical_url=canonical_url or "",
                registrable_domain=domain or "",
                source_class=source_class,
                source_taxonomy_version=taxonomy_version,
                recurrence_count=answers,
                page_format=url_format,
                page_format_method=url_format_method,
                page_format_version=SOURCE_PAGE_FORMAT_VERSION,
                last_cited_at=moment,
                first_seen_audit_id=audit.id,
                last_seen_audit_id=audit.id,
                inspector_version=SOURCE_PAGE_INSPECTOR_VERSION,
            )
            .on_conflict_do_update(
                constraint="uq_source_page_project_url",
                set_={
                    # Recurrence accumulates across audits: a page cited once
                    # per run for months is a stronger candidate than one cited
                    # three times in a single run and never again.
                    #
                    # Guarded on the audit, because this runs more than once
                    # per audit -- the inventory is refreshed after redirects
                    # resolve. Without the guard a re-sync would inflate a
                    # page's rank purely by being processed twice.
                    "recurrence_count": case(
                        (
                            SourcePage.last_seen_audit_id.is_distinct_from(audit.id),
                            SourcePage.recurrence_count + answers,
                        ),
                        else_=SourcePage.recurrence_count,
                    ),
                    "last_cited_at": moment,
                    "last_seen_audit_id": audit.id,
                    "source_class": source_class,
                    "source_taxonomy_version": taxonomy_version,
                    # The URL shape is the WEAKEST evidence for a page kind,
                    # so it only fills a gap. Once a page has been read, a
                    # re-sync must not replace what the page said about itself
                    # with a guess from its address.
                    #
                    # All three columns move together. Leaving the version
                    # behind would stamp a URL-derived format with the version
                    # of the reading it just replaced.
                    "page_format": case(
                        (_weak_format, url_format),
                        else_=SourcePage.page_format,
                    ),
                    "page_format_method": case(
                        (_weak_format, url_format_method),
                        else_=SourcePage.page_format_method,
                    ),
                    "page_format_version": case(
                        (_weak_format, SOURCE_PAGE_FORMAT_VERSION),
                        else_=SourcePage.page_format_version,
                    ),
                    "updated_at": moment,
                },
            )
        )
        await session.execute(statement)

    await session.execute(
        update(SourcePage)
        .where(
            SourcePage.project_id == audit.project_id,
            SourcePage.inspection_state == INSPECTION_INSPECTED,
            SourcePage.last_inspected_at < _stale_before(moment),
        )
        .values(inspection_state=INSPECTION_STALE, updated_at=moment)
    )
    return await _unresolved_rows(session, audit=audit)


def _canonical_differentiation_results(
    payload: dict[str, Any] | None,
) -> tuple[tuple[dict[str, Any], CitationIdentity], ...]:
    selected: list[tuple[dict[str, Any], CitationIdentity]] = []
    seen: set[str] = set()
    for result in organic_results(payload, limit=None):
        identity = identify_citation_url(result["url"], provider_resolved=True)
        if (
            not identity.is_resolved
            or identity.url_hash is None
            or identity.url_hash in seen
        ):
            continue
        seen.add(identity.url_hash)
        selected.append((result, identity))
        if len(selected) >= DIFFERENTIATION_RESULT_LIMIT:
            break
    return tuple(selected)


async def sync_differentiation_pages(
    session: AsyncSession, *, audit: Audit, now: datetime | None = None
) -> int:
    """Admit selected organic pages without creating citation evidence."""
    moment = now or datetime.now(UTC)
    statement = (
        select(RawResponseArtifact, AuditTask)
        .join(AuditTask, AuditTask.id == RawResponseArtifact.task_id)
        .where(
            RawResponseArtifact.audit_id == audit.id,
            RawResponseArtifact.transport_provider == "dataforseo",
        )
        .order_by(RawResponseArtifact.created_at, RawResponseArtifact.id)
    )
    admitted = 0
    for artifact, task in (await session.execute(statement)).all():
        for result, identity in _canonical_differentiation_results(
            artifact.provider_metadata
        ):
            page_format, method = derive_url_format(identity.canonical_url or "")
            page_id = await session.scalar(
                pg_insert(SourcePage)
                .values(
                    workspace_id=audit.workspace_id,
                    project_id=audit.project_id,
                    url_hash=identity.url_hash,
                    canonical_url=identity.canonical_url or "",
                    registrable_domain=identity.registrable_domain or "",
                    recurrence_count=0,
                    page_format=page_format,
                    page_format_method=method,
                    page_format_version=SOURCE_PAGE_FORMAT_VERSION,
                    first_seen_audit_id=audit.id,
                    last_seen_audit_id=audit.id,
                    inspector_version=SOURCE_PAGE_INSPECTOR_VERSION,
                )
                .on_conflict_do_update(
                    constraint="uq_source_page_project_url",
                    set_={"updated_at": moment},
                )
                .returning(SourcePage.id)
            )
            if page_id is None:
                continue
            await session.execute(
                pg_insert(ContentDifferentiationCandidate)
                .values(
                    workspace_id=audit.workspace_id,
                    project_id=audit.project_id,
                    audit_id=audit.id,
                    audit_task_id=task.id,
                    source_page_id=page_id,
                    query_text=task.prompt_text,
                    rank=result["rank"],
                    result_title=result["title"],
                    search_context={
                        "logical_engine": task.logical_engine,
                        "provider": artifact.transport_provider,
                        "observed_at": artifact.created_at.isoformat(),
                        "request": dict(task.request_snapshot or {}),
                    },
                )
                .on_conflict_do_nothing(
                    constraint="uq_content_diff_candidate_task_page"
                )
            )
            admitted += 1
    return admitted


async def backfill_citation_identity(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    redirect_url: str,
    resolved_url: str,
    canonical_url: str,
    url_hash: str,
    method: str,
    version: str,
) -> int:
    """Record where a redirect token pointed, for the citations that used it.

    Scoped to the citations carrying that exact raw URL within ONE PROJECT.
    A workspace-wide update would let one project's resolution rewrite
    another's evidence, and the two are separately authorized. This is not a
    historical migration of anything else: the provider's own ``url`` is left
    untouched, and a citation written by an older analyzer keeps its null
    identity rather than acquiring one after the fact.
    """
    result = await session.execute(
        update(Citation)
        .where(
            Citation.workspace_id == workspace_id,
            Citation.url == redirect_url,
            # ``url_hash IS NULL`` alone also matches citations written before
            # identity existed. Those are a different state -- "never
            # established" -- and writing an identity onto them now would
            # claim a derivation that never happened.
            Citation.url_identity_method == URL_IDENTITY_UNRESOLVED,
            Citation.audit_id.in_(
                select(Audit.id).where(Audit.project_id == project_id)
            ),
        )
        .values(
            resolved_url=resolved_url,
            canonical_url=canonical_url,
            url_hash=url_hash,
            url_identity_method=method,
            url_identity_version=version,
        )
    )
    return int(cast(CursorResult[Any], result).rowcount or 0)
