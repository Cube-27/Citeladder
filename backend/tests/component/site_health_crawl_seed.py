"""Seed a Site Health crawl already through discovery, for schema-isolation tests.

The crawl lifecycle and its tests live in the TypeScript Site Health worker;
these rows only give the Python model tests a realistic tenancy to violate.
"""

from __future__ import annotations

import hashlib
import uuid
from urllib.parse import urlsplit

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.site_health_contracts import (
    ANALYZER_VERSION,
    DISCOVERY_STATUS_COMPLETED,
    EXTRACTOR_VERSION,
    SCORING_VERSION,
    TASK_KIND_ANALYZE,
)
from app.core.config.site_health_crawl_policy import SELECTION_SOURCE_USER
from app.core.config.task_queue import TASK_STATUS_QUEUED
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.queue import SiteCrawlTask
from app.models.site_health.urls import MonitoredSiteUrl, SiteUrl
from tests.component.site_health_helpers import (
    seed_monitored_urls_allowance,
    seed_site_crawl,
)

# Mirrors the old Starter monitored-URL limit of 50.
_MONITORED_URLS = 50


async def _add_monitored_analyze_task(
    session: AsyncSession, seed, url: str
) -> tuple[uuid.UUID, uuid.UUID]:
    """One monitored SiteUrl and its QUEUED analyze task."""
    # These are explicit canonical fixture URLs, not acquisition input.
    canonical = url
    url_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    site_url = SiteUrl(
        workspace_id=seed.workspace_id,
        project_id=seed.project_id,
        normalized_url=canonical,
        url_hash=url_hash,
        display_url=canonical,
        host=urlsplit(canonical).hostname or "",
        depth=0,
    )
    session.add(site_url)
    await session.flush()
    session.add(
        MonitoredSiteUrl(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            profile_id=seed.profile_id,
            site_url_id=site_url.id,
            active=True,
            selection_source=SELECTION_SOURCE_USER,
        )
    )
    analyze_task = SiteCrawlTask(
        crawl_id=seed.crawl_id,
        workspace_id=seed.workspace_id,
        site_url_id=site_url.id,
        task_kind=TASK_KIND_ANALYZE,
        requested_url=url,
        url_hash=url_hash,
        generation=0,
        idempotency_key=f"{seed.crawl_id}:{TASK_KIND_ANALYZE}:{url_hash}:0",
        status=TASK_STATUS_QUEUED,
        priority=1,
        randomized_position=0,
    )
    session.add(analyze_task)
    await session.flush()  # populate the client-side UUID defaults
    return site_url.id, analyze_task.id


async def _seed_analyze_phase_crawl(
    session: AsyncSession, *, root: str, urls: tuple[str, ...]
):
    """A full-allowance crawl past discovery: every URL monitored and queued.

    Returns ``(seed, ids)`` with one ``(site_url_id, analyze_task_id)`` pair
    per URL, in ``urls`` order.
    """
    seed = await seed_site_crawl(session, task_count=0, root_url=root)
    await seed_monitored_urls_allowance(
        session, workspace_id=seed.workspace_id, monitored_urls=_MONITORED_URLS
    )
    await session.commit()
    crawl = await session.get(SiteCrawl, seed.crawl_id)
    assert crawl is not None
    crawl.discovery_status = DISCOVERY_STATUS_COMPLETED
    crawl.discovered_url_count = len(urls)
    crawl.inventory_complete = True
    crawl.extractor_version = EXTRACTOR_VERSION
    crawl.analyzer_version = ANALYZER_VERSION
    crawl.scoring_version = SCORING_VERSION
    crawl.configuration = {
        "root_registrable_domain": urlsplit(root).hostname,
        "include_globs": None,
        "exclude_globs": None,
        "count_disclosure": True,
    }
    ids = [await _add_monitored_analyze_task(session, seed, url) for url in urls]
    await session.commit()
    return seed, ids
