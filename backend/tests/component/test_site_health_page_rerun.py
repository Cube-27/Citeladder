"""Site Health page reruns (the Python-served half of the page routes)."""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_contracts import (
    TASK_KIND_ANALYZE,
)
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.queue import SiteCrawlTask
from app.models.site_health.urls import SiteUrlObservation
from tests.component.site_health_api_helpers import (
    _register,
    _seed_scenario,
)
from tests.component.site_health_helpers import seed_monitored_urls_allowance

pytestmark = pytest.mark.asyncio


async def test_rerun_page_from_completed_crawl_mints_new_crawl(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Handoff finding 1: 'Re-audit this page' must work from a COMPLETED crawl.

    The source crawl is terminal, so enqueuing an analyze task into it would be
    cooperatively cancelled by the worker and never run. The endpoint must mint
    a FRESH single-page rerun crawl and return its identity so the client polls
    the new run rather than the terminal source crawl.
    """
    from app.core.config.site_health_contracts import (
        CRAWL_ACTIVE_STATUSES,
    )
    from tests.component.site_health_helpers import seed_monitored_urls_allowance

    await _register(client, "rerun@example.com")
    async with session_factory() as session:
        scn = await _seed_scenario(session, email="rerun@example.com")
        # The monitored URL is user-source, so a positive allowance is
        # required to rerun it.
        await seed_monitored_urls_allowance(
            session, workspace_id=scn.workspace_id, monitored_urls=50
        )
        await session.commit()
    headers = {"X-Workspace-Id": str(scn.workspace_id)}

    resp = await client.post(
        f"/api/v1/site-crawls/{scn.crawl_id}/pages/{scn.monitored_url_id}/rerun",
        headers=headers,
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    # Response shape: identity to poll the fresh rerun.
    assert set(body) == {
        "crawl_id",
        "site_url_id",
        "task_id",
        "created_new_crawl",
        "analysis_status",
    }
    assert body["created_new_crawl"] is True
    assert body["site_url_id"] == str(scn.monitored_url_id)
    # A brand-new crawl id, distinct from the terminal source crawl.
    new_crawl_id = uuid.UUID(body["crawl_id"])
    assert new_crawl_id != scn.crawl_id
    assert body["analysis_status"] == "pending"

    async with session_factory() as session:
        new_crawl = await session.get(SiteCrawl, new_crawl_id)
        assert new_crawl is not None
        # The new crawl is active (runnable), not terminal.
        assert new_crawl.status in CRAWL_ACTIVE_STATUSES
        # Exactly one analyze task was seeded for the reran URL — and no
        # discover root task (so the worker never re-crawls the whole site).
        seeded = (
            (
                await session.execute(
                    select(SiteCrawlTask).where(SiteCrawlTask.crawl_id == new_crawl_id)
                )
            )
            .scalars()
            .all()
        )
        assert len(seeded) == 1
        assert seeded[0].task_kind == TASK_KIND_ANALYZE
        assert seeded[0].site_url_id == scn.monitored_url_id
        assert str(seeded[0].id) == body["task_id"]
        # The returned URL is resolvable on the NEW crawl (an observation row
        # exists) so page-detail polling of the new crawl works.
        obs = await session.scalar(
            select(SiteUrlObservation.id).where(
                SiteUrlObservation.crawl_id == new_crawl_id,
                SiteUrlObservation.site_url_id == scn.monitored_url_id,
            )
        )
        assert obs is not None


async def test_rerun_page_unmonitored_url_is_conflict(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A URL that is not in the active monitored selection cannot be rerun."""

    await _register(client, "rerun-conflict@example.com")
    async with session_factory() as session:
        scn = await _seed_scenario(session, email="rerun-conflict@example.com")
        await seed_monitored_urls_allowance(
            session, workspace_id=scn.workspace_id, monitored_urls=50
        )
        await session.commit()
    headers = {"X-Workspace-Id": str(scn.workspace_id)}

    # ``issue_url_id`` (url_b) is analyzed/admitted but NOT monitored.
    resp = await client.post(
        f"/api/v1/site-crawls/{scn.crawl_id}/pages/{scn.issue_url_id}/rerun",
        headers=headers,
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["code"] == "rerun_not_allowed"
