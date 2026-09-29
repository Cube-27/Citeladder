"""Atomic inventory refresh and task admission at the PostgreSQL boundary."""

import asyncio
from dataclasses import replace

import pytest
from sqlalchemy import select

from app.core.config.site_health_contracts import (
    CRAWL_STATUS_CANCELLED,
    TASK_KIND_DISCOVER,
)
from app.domain.site_health.frontier_support import _enqueue_task, _upsert_site_url
from app.domain.site_health.normalization import canonical_identity
from app.domain.site_health.schemas import FrontierCandidate
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.queue import SiteCrawlTask
from app.models.site_health.urls import SiteUrl, SiteUrlObservation
from app.workers.site_health.lifecycle_finalize import _load_finalize_context
from tests.component.site_health_helpers import seed_site_crawl


def _candidate() -> FrontierCandidate:
    url, url_hash = canonical_identity("https://example.com/products/widget")
    return FrontierCandidate(url=url, url_hash=url_hash, depth=1, source_kind="link")


@pytest.mark.asyncio
async def test_concurrent_identity_upsert_preserves_first_seen_and_workspace(
    session_factory,
):
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=0)
        other = await seed_site_crawl(session, task_count=0)
    candidate = _candidate()

    async def upsert(crawl_id, item):
        async with session_factory() as session:
            crawl = await session.get(SiteCrawl, crawl_id)
            result = await _upsert_site_url(session, crawl=crawl, candidate=item)
            await session.commit()
            return result

    results = await asyncio.gather(
        upsert(seed.crawl_id, candidate), upsert(seed.crawl_id, candidate)
    )
    assert results[0][0] == results[1][0]
    assert sorted(created for _id, created in results) == [False, True]
    other_id, _created = await upsert(other.crawl_id, candidate)
    assert other_id != results[0][0]
    async with session_factory() as session:
        original = await session.get(SiteUrl, results[0][0])
        first_seen_at = original.first_seen_at
        crawl = await session.get(SiteCrawl, seed.crawl_id)
        recrawl = SiteCrawl(
            workspace_id=crawl.workspace_id,
            project_id=crawl.project_id,
            profile_id=crawl.profile_id,
            root_url=crawl.root_url,
            random_seed="2",
        )
        session.add(recrawl)
        await session.commit()
        recrawl_id = recrawl.id
    assert await upsert(recrawl_id, replace(candidate, depth=3)) == (
        results[0][0],
        False,
    )
    async with session_factory() as session:
        refreshed = await session.get(SiteUrl, results[0][0])
        untouched = await session.get(SiteUrl, other_id)
        assert (refreshed.first_seen_crawl_id, refreshed.first_seen_at) == (
            seed.crawl_id,
            first_seen_at,
        )
        assert (refreshed.last_seen_crawl_id, refreshed.depth) == (recrawl_id, 3)
        assert (untouched.last_seen_crawl_id, untouched.depth) == (other.crawl_id, 1)


@pytest.mark.asyncio
async def test_enqueue_rechecks_durable_liveness_and_only_counts_new_tasks(
    session_factory,
):
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=0)
        other = await seed_site_crawl(session, task_count=0)
        crawl = await session.get(SiteCrawl, seed.crawl_id)
        session.expunge(crawl)
    candidate = _candidate()

    async def enqueue(priority=0, generation=0):
        async with session_factory() as session:
            task_id = await _enqueue_task(
                session,
                crawl=crawl,
                site_url_id=None,
                url=candidate.url,
                url_hash_value=candidate.url_hash,
                task_kind=TASK_KIND_DISCOVER,
                depth=1,
                priority=priority,
                generation=generation,
            )
            await session.commit()
            return task_id

    task_id = await enqueue()
    assert task_id is not None
    assert await enqueue(priority=10) is None
    assert await enqueue(priority=1) is None
    async with session_factory() as session:
        task = await session.get(SiteCrawlTask, task_id)
        assert task.priority == 10
    crawl.workspace_id = other.workspace_id
    assert await enqueue(generation=1) is None
    crawl.workspace_id = seed.workspace_id
    async with session_factory() as session:
        persisted = await session.get(SiteCrawl, seed.crawl_id)
        persisted.status = CRAWL_STATUS_CANCELLED
        await session.commit()
    assert await enqueue(generation=1) is None
    async with session_factory() as session:
        tasks = list(
            await session.scalars(
                select(SiteCrawlTask).where(SiteCrawlTask.crawl_id == seed.crawl_id)
            )
        )
        assert [task.id for task in tasks] == [task_id]


@pytest.mark.asyncio
async def test_sitemap_manifest_recognizes_prior_link_observation_without_rewriting_it(
    session_factory,
):
    candidate = _candidate()
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=0)
        other = await seed_site_crawl(session, task_count=0)
        for crawl_id in (seed.crawl_id, other.crawl_id):
            crawl = await session.get(SiteCrawl, crawl_id)
            site_url_id, _created = await _upsert_site_url(
                session, crawl=crawl, candidate=candidate
            )
            session.add(
                SiteUrlObservation(
                    workspace_id=crawl.workspace_id,
                    project_id=crawl.project_id,
                    crawl_id=crawl.id,
                    site_url_id=site_url_id,
                    observed_url=candidate.url,
                    source_kind="link",
                )
            )
        await session.commit()
        crawl = await session.get(SiteCrawl, seed.crawl_id)
        crawl.site_facts = {"sitemap": {"urls": [candidate.url]}}
        await session.commit()
        context = await _load_finalize_context(session, crawl=crawl, rows=[])
        assert [row.observed_url for row in context.sitemap_rows] == [candidate.url]
        observation = await session.scalar(
            select(SiteUrlObservation).where(
                SiteUrlObservation.crawl_id == seed.crawl_id
            )
        )
        assert observation.source_kind == "link"
        crawl.site_facts = {"sitemap": {"urls": []}}
        context = await _load_finalize_context(session, crawl=crawl, rows=[])
        assert context.sitemap_rows == []
