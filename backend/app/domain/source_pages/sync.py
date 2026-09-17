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

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.source_pages import (
    INSPECTION_INSPECTED,
    INSPECTION_STALE,
    SOURCE_PAGE_INSPECTOR_VERSION,
    SOURCE_PAGE_MAX_REDIRECTS_PER_DOMAIN,
    SOURCE_PAGE_STALE_AFTER_HOURS,
    URL_IDENTITY_UNRESOLVED,
)
from app.models.analysis import Citation, ResponseAnalysis
from app.models.audit import Audit
from app.models.source_pages import SourcePage


@dataclass(frozen=True, slots=True)
class UnresolvedCitation:
    """A redirect token awaiting resolution, and where it appears to point."""

    url: str
    implied_domain: str


@dataclass(frozen=True, slots=True)
class SyncResult:
    resolved_pages: int
    unresolved: tuple[UnresolvedCitation, ...]


def _stale_before(now: datetime) -> datetime:
    return now - timedelta(hours=SOURCE_PAGE_STALE_AFTER_HOURS)


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
            bucket.append(UnresolvedCitation(url=raw, implied_domain=str(domain or "")))
    return tuple(item for bucket in per_domain.values() for item in bucket)


async def sync_cited_pages(
    session: AsyncSession, *, audit: Audit, now: datetime | None = None
) -> SyncResult:
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
                    "recurrence_count": SourcePage.recurrence_count + answers,
                    "last_cited_at": moment,
                    "last_seen_audit_id": audit.id,
                    "source_class": source_class,
                    "source_taxonomy_version": taxonomy_version,
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
    return SyncResult(
        resolved_pages=len(rows),
        unresolved=await _unresolved_rows(session, audit=audit),
    )


async def backfill_citation_identity(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    redirect_url: str,
    resolved_url: str,
    canonical_url: str,
    url_hash: str,
    method: str,
    version: str,
) -> int:
    """Record where a redirect token pointed, for the citations that used it.

    Scoped to the citations carrying that exact raw URL inside one workspace.
    This is not a historical migration of anything else: the provider's own
    ``url`` is left untouched, and a citation written by an older analyzer
    keeps its null identity rather than acquiring one after the fact.
    """
    result = await session.execute(
        update(Citation)
        .where(
            Citation.workspace_id == workspace_id,
            Citation.url == redirect_url,
            Citation.url_hash.is_(None),
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
