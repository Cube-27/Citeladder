"""Read-only observed-architecture projection over the persisted model."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.site_health_archetypes import (
    ARCHITECTURE_FORMULA_VERSION,
)
from app.core.config.site_health_link_metrics import COVERAGE_STATE_COMPLETE
from app.domain.site_health.service.common import (
    resolve_usable_crawl,
)
from app.models.site_health.architecture import SiteObservedArchitecture
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.snapshot import SiteHealthSnapshot


def _unavailable(reason: str, *, crawl_id: uuid.UUID | None = None) -> dict:
    return {
        "state": "unavailable",
        "crawl_id": crawl_id,
        "coverage_state": "unknown",
        "coverage_reasons": [],
        "page_count": 0,
        "page_kinds": [],
        "nodes": [],
        "internal_linking": {
            "internal_link_count": 0,
            "pages_with_incoming_count": 0,
            "pages_with_incoming_percentage": None,
            "orphan_page_count": None,
            "orphan_pages": [],
        },
        "structure_depth": {
            "measured_page_count": 0,
            "unmeasured_page_count": 0,
            "buckets": [],
        },
        "architecture_formula_version": ARCHITECTURE_FORMULA_VERSION,
        "limitations": [reason],
    }


async def _latest_model(
    session: AsyncSession, *, crawl: SiteCrawl
) -> SiteObservedArchitecture | None:
    """The newest persisted model for this crawl, whatever version wrote it.

    Selecting by version would blank the tab the moment a formula token moves;
    the response reports the versions the row it actually read carries.
    """
    return await session.scalar(
        select(SiteObservedArchitecture)
        .where(
            SiteObservedArchitecture.workspace_id == crawl.workspace_id,
            SiteObservedArchitecture.project_id == crawl.project_id,
            SiteObservedArchitecture.crawl_id == crawl.id,
        )
        .order_by(
            SiteObservedArchitecture.created_at.desc(),
            SiteObservedArchitecture.id.desc(),
        )
        .limit(1)
    )


def _node(row: dict) -> dict:
    return {
        "site_url_id": str(row.get("site_url_id") or ""),
        "url": str(row.get("url") or ""),
        "title": str(row.get("title") or ""),
        "page_kind": str(row.get("page_kind") or ""),
        "parent_site_url_id": (
            str(row["parent_site_url_id"]) if row.get("parent_site_url_id") else None
        ),
        "parent_source": str(row.get("parent_source") or "unknown"),
        "depth_from_home": row.get("depth_from_home"),
    }


def _page_kind(row: dict) -> dict:
    return {
        "page_kind": str(row.get("page_kind") or "other"),
        "page_count": int(row.get("page_count") or 0),
        "median_depth": row.get("median_depth"),
        "indexable_count": int(row.get("indexable_count") or 0),
        "duplicate_metadata_count": int(row.get("duplicate_metadata_count") or 0),
        "orphan_count": row.get("orphan_count"),
    }


def _limitations(coverage_state: str) -> list[str]:
    if coverage_state == COVERAGE_STATE_COMPLETE:
        return []
    prefix = (
        "This crawl hit its page budget"
        if coverage_state == "partial"
        else "This crawl could not prove it saw the whole site"
    )
    return [
        f"{prefix}, so these are the pages CiteLadder observed — not the whole "
        "site. Counts describe what was crawled. Claims that a structure is "
        "missing site-wide are withheld, because a partial crawl cannot prove "
        "absence."
    ]


async def get_architecture(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    crawl_id: uuid.UUID | None = None,
) -> dict:
    """Project the crawl's persisted observed-architecture model."""
    crawl = await resolve_usable_crawl(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        crawl_id=crawl_id,
    )
    if crawl is None:
        return _unavailable("No usable persisted crawl has an observed architecture.")
    model = await _latest_model(session, crawl=crawl)
    if model is None:
        return _unavailable(
            "This crawl has no observed architecture yet — it is derived after "
            "the crawl finishes.",
            crawl_id=crawl.id,
        )
    return _projection(
        model,
        crawl_id=crawl.id,
        coverage_reasons=await _coverage_reasons(session, crawl=crawl),
    )


async def _coverage_reasons(session: AsyncSession, *, crawl: SiteCrawl) -> list[str]:
    """Why this crawl's coverage is what it is, from the frozen snapshot.

    The architecture row carries the coverage STATE but not the evidence that
    produced it, so a tab that withholds or qualifies a number could never say
    why. The reasons are already persisted and already projected by the
    Overview service; this reads the same field rather than re-assessing, so
    the two surfaces cannot disagree.
    """
    evidence = await session.scalar(
        select(SiteHealthSnapshot.coverage_evidence).where(
            SiteHealthSnapshot.workspace_id == crawl.workspace_id,
            SiteHealthSnapshot.project_id == crawl.project_id,
            SiteHealthSnapshot.crawl_id == crawl.id,
        )
    )
    reasons = (evidence or {}).get("reasons") or []
    return [str(reason) for reason in reasons if reason]


def _orphan_page_count(internal_linking: dict, *, page_count: int) -> int | None:
    """The persisted count, or the one the neighbouring metrics already prove.

    Crawls persisted before the withholding was removed baked ``None`` into
    JSONB and only a re-crawl re-derives them. When every observed page has an
    inbound link the orphan count is zero no matter how it is computed, and
    that is exactly the shape the tab was reporting as withheld while printing
    its two inputs alongside. Any other legacy shape stays ``None`` rather than
    guessing at a number.
    """
    stored = internal_linking.get("orphan_page_count")
    if stored is not None:
        return int(stored)
    with_incoming = internal_linking.get("pages_with_incoming_count")
    if with_incoming is not None and page_count and int(with_incoming) == page_count:
        return 0
    return None


def _projection(
    model: SiteObservedArchitecture,
    *,
    crawl_id: uuid.UUID,
    coverage_reasons: list[str],
) -> dict:
    nodes = [_node(row) for row in model.hierarchy or [] if isinstance(row, dict)]
    coverage_state = model.coverage_state or "unknown"
    page_count = int(model.page_count or 0)
    internal_linking = dict(model.internal_linking or {})
    internal_linking["orphan_page_count"] = _orphan_page_count(
        internal_linking, page_count=page_count
    )
    internal_linking.setdefault("orphan_pages", [])
    return {
        "state": "available",
        "crawl_id": crawl_id,
        "coverage_state": coverage_state,
        "coverage_reasons": coverage_reasons,
        "page_count": page_count,
        "page_kinds": [
            _page_kind(row) for row in model.page_kinds or [] if isinstance(row, dict)
        ],
        "nodes": nodes,
        "internal_linking": internal_linking,
        "structure_depth": dict(model.structure_depth or {}),
        "architecture_formula_version": model.architecture_formula_version,
        "limitations": _limitations(coverage_state),
    }


__all__ = [
    "get_architecture",
]
