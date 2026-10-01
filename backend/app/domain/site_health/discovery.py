"""Crawl-creation seeding of the automatic root.

Link discovery and frontier admission run in the TypeScript Site Health
worker; crawl creation stays Python until PR 18b5.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.site_health_contracts import OBSERVATION_SOURCE_ROOT
from app.core.config.site_health_crawl_policy import SELECTION_SOURCE_BOOTSTRAP
from app.domain.site_health.frontier_support import (
    FrontierCandidate,
    _add_free_sample,
    _automatic_remaining,
    _upsert_site_url,
)
from app.domain.site_health.normalization import canonical_identity
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.runtime import WorkspaceSiteHealthRuntime


async def add_automatic_root(
    session: AsyncSession,
    crawl: SiteCrawl,
    *,
    runtime: WorkspaceSiteHealthRuntime | None = None,
) -> None:
    """Persist and queue analysis for a user-triggered standard crawl root.

    The root keeps its own analyze task rather than waiting on the root
    discover to hand one over: a root whose discovery fails can still be
    analyzed, and the homepage is the one page a crawl must not drop.
    """
    remaining = await _automatic_remaining(session, crawl, runtime=runtime)
    if remaining is None or remaining <= 0:
        return
    canonical_url, url_hash_value = canonical_identity(crawl.root_url)
    candidate = FrontierCandidate(
        url=canonical_url,
        url_hash=url_hash_value,
        depth=0,
        source_kind=OBSERVATION_SOURCE_ROOT,
    )
    site_url_id, _created = await _upsert_site_url(
        session, crawl=crawl, candidate=candidate
    )
    await _add_free_sample(
        session,
        crawl=crawl,
        site_url_id=site_url_id,
        candidate=candidate,
        selection_source=SELECTION_SOURCE_BOOTSTRAP,
    )
