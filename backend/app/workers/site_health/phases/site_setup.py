"""Durable Site Health site-setup branch.

One task per crawl resolves robots and AI-crawler stance, probes llms.txt, walks
the bounded sitemap tree, and persists site facts plus sitemap admission. Root
page acquisition proceeds independently on the same queue.

The task commits twice. Root analysis defers until ``crawl.site_facts`` exists,
and the only thing it reads from that field is robots and llms.txt evidence —
so the first commit publishes exactly that, and the sitemap walk (up to
``max_sitemap_documents`` serial fetches) plus admission land in a second
commit under the same lease. Gating the first score on the walk cost the whole
walk in start latency and protected nothing.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.site_health_contracts import TASK_KIND_SITE_SETUP
from app.core.config.site_health_crawl_policy import INPUT_MODE_EXACT_URLS
from app.domain.site_health.discovery import admit_candidates
from app.domain.site_health.entitlements import lock_runtime
from app.domain.site_health.task_guards import task_can_persist
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.queue import SiteCrawlTask
from app.workers.site_health.phases.contracts import PhaseContext
from app.workers.site_health.phases.discover_stages import (
    build_sitemap_candidates,
    collect_site_evidence,
    ingest_sitemap_tree,
    sitemap_ingest_pending,
    sitemap_walk_applies,
    write_sitemap_observations,
)
from app.workers.site_health.urls import authority_key


@dataclass(frozen=True, slots=True)
class _SetupPlan:
    """The crawl-frozen inputs one setup attempt works from."""

    requested_url: str
    root_registrable_domain: str
    include_globs: list[str] | None
    exclude_globs: list[str] | None
    sample_mode: bool
    published_facts: dict
    resuming_walk: bool


async def run(ctx: PhaseContext, claimed: SiteCrawlTask) -> None:
    """Execute and persist the crawl's one idempotent setup branch."""
    task_id = claimed.id
    crawl_id = claimed.crawl_id
    plan = await _load_setup_plan(ctx, task_id=task_id, crawl_id=crawl_id)
    if plan is None:
        return

    async with ctx.leased(task_id):
        authority = authority_key(plan.requested_url)
        site_facts = await _publish_evidence(
            ctx, plan, task_id=task_id, crawl_id=crawl_id, authority=authority
        )
        if site_facts is None:
            return
        sitemap_urls: tuple[str, ...] = ()
        if sitemap_walk_applies(authority=authority, sample_mode=plan.sample_mode):
            site_facts, sitemap_urls = await ingest_sitemap_tree(
                ctx,
                site_facts=site_facts,
                authority=authority,
                root_registrable_domain=plan.root_registrable_domain,
                include_globs=plan.include_globs,
                exclude_globs=plan.exclude_globs,
            )
        persisted = await _persist_site_setup(
            ctx,
            task_id=task_id,
            crawl_id=crawl_id,
            site_facts=site_facts,
            sitemap_urls=sitemap_urls,
        )
    if persisted:
        await ctx.queue.succeed(task_id=task_id, owner=ctx.owner)


async def _load_setup_plan(
    ctx: PhaseContext, *, task_id: uuid.UUID, crawl_id: uuid.UUID
) -> _SetupPlan | None:
    """Read the setup inputs, or return ``None`` when there is nothing to do.

    A crawl whose facts are published AND whose walk has finished is already
    set up, so the task succeeds here. A crawl still marked pending is one a
    previous attempt left between the two commits; it resumes at the walk.
    """
    async with ctx.session_factory() as session:
        task = await session.get(SiteCrawlTask, task_id)
        crawl = await session.get(SiteCrawl, crawl_id)
        if task is None or crawl is None:
            return None
        if task.task_kind != TASK_KIND_SITE_SETUP:
            raise NotImplementedError(f"unexpected task kind '{task.task_kind}'")
        published = crawl.site_facts is not None
        resuming_walk = published and sitemap_ingest_pending(crawl.site_facts)
        if published and not resuming_walk:
            await session.rollback()
            await ctx.queue.succeed(task_id=task_id, owner=ctx.owner)
            return None
        config = dict(crawl.configuration or {})
        return _SetupPlan(
            requested_url=task.requested_url,
            root_registrable_domain=str(config.get("root_registrable_domain") or ""),
            include_globs=config.get("include_globs"),
            exclude_globs=config.get("exclude_globs"),
            sample_mode=bool(crawl.sample_mode),
            published_facts=dict(crawl.site_facts or {}),
            resuming_walk=resuming_walk,
        )


async def _publish_evidence(
    ctx: PhaseContext,
    plan: _SetupPlan,
    *,
    task_id: uuid.UUID,
    crawl_id: uuid.UUID,
    authority: str,
) -> dict | None:
    """Commit the facts the deferred root analysis waits on, then return them.

    ``None`` means the lease was lost before that commit landed, so the caller
    abandons the attempt without touching the queue row.
    """
    if plan.resuming_walk:
        # A previous attempt published the facts and died before the walk.
        # Robots is cached per authority, so re-probing buys nothing.
        return plan.published_facts
    policy = None
    robots_body: str | None = None
    robots_status: int | None = None
    if authority:
        policy, robots_body, robots_status = await ctx.robots.ensure(authority)
    site_facts = await collect_site_evidence(
        ctx,
        requested_url=plan.requested_url,
        authority=authority,
        robots_policy=policy,
        robots_body=robots_body,
        robots_status=robots_status,
        sample_mode=plan.sample_mode,
    )
    # Commit one: the root page's gate clears here, before the walk.
    published = await _publish_site_facts(
        ctx, task_id=task_id, crawl_id=crawl_id, site_facts=site_facts
    )
    return site_facts if published else None


async def _publish_site_facts(
    ctx: PhaseContext,
    *,
    task_id: uuid.UUID,
    crawl_id: uuid.UUID,
    site_facts: dict,
) -> bool:
    """Commit the site-level evidence, and nothing else.

    Deliberately narrow: it writes one field and takes no admission locks, so
    the gate clears in one round trip. ``attempt_count`` stays with the final
    commit -- this is the same attempt, not a second one.
    """
    async with ctx.session_factory() as session:
        locked = await ctx.lock_owned_running_task(
            session, task_id=task_id, crawl_id=crawl_id
        )
        if locked is None:
            await session.rollback()
            return False
        _task, crawl = locked
        crawl.site_facts = site_facts
        await session.commit()
        return True


def _resolved_facts(site_facts: dict) -> dict:
    """Strip the pending marker: reaching the final commit means setup is done."""
    resolved = dict(site_facts)
    resolved["sitemap"] = {
        key: value
        for key, value in (resolved.get("sitemap") or {}).items()
        if key != "pending"
    }
    return resolved


async def _admit_sitemap_urls(
    session: AsyncSession, *, crawl_hint: SiteCrawl, sitemap_urls: tuple[str, ...]
) -> int:
    """Admit the walk's URLs, returning the count this task contributed."""
    input_mode = (crawl_hint.configuration or {}).get("input_mode", "auto")
    exact_urls = input_mode == INPUT_MODE_EXACT_URLS
    if not sitemap_urls or crawl_hint.sample_mode or exact_urls:
        return 0
    runtime = await lock_runtime(session, crawl_hint.workspace_id)
    await session.refresh(crawl_hint, attribute_names=["admitted_url_count"])
    admitted_before = int(crawl_hint.admitted_url_count or 0)
    candidates = build_sitemap_candidates(sitemap_urls)
    admission = await admit_candidates(
        session, crawl=crawl_hint, candidates=candidates, runtime=runtime
    )
    await write_sitemap_observations(
        session, crawl=crawl_hint, candidates=candidates, admission=admission
    )
    return int(crawl_hint.admitted_url_count or 0) - admitted_before


async def _persist_site_setup(
    ctx: PhaseContext,
    *,
    task_id: uuid.UUID,
    crawl_id: uuid.UUID,
    site_facts: dict,
    sitemap_urls: tuple[str, ...],
) -> bool:
    """Commit sitemap admission and the resolved facts behind the task guard.

    This is the task's second and final commit.
    """
    async with ctx.session_factory() as session:
        task_hint = await session.get(SiteCrawlTask, task_id)
        crawl_hint = await session.get(SiteCrawl, crawl_id)
        if not task_can_persist(task_hint, crawl_hint, owner=ctx.owner):
            await session.rollback()
            return False
        assert task_hint is not None and crawl_hint is not None  # noqa: S101 - narrows for the type checker; not a runtime check

        admitted_delta = await _admit_sitemap_urls(
            session, crawl_hint=crawl_hint, sitemap_urls=sitemap_urls
        )
        locked = await ctx.lock_owned_running_task(
            session, task_id=task_id, crawl_id=crawl_id
        )
        if locked is None:
            await session.rollback()
            return False
        task, crawl = locked
        crawl.site_facts = _resolved_facts(site_facts)
        crawl.admitted_url_count += admitted_delta
        task.attempt_count += 1
        await session.commit()
        return True
