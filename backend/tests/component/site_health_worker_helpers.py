"""Shared fixtures for the Site Health worker component tests.

The TypeScript Site Health worker acquires and analyzes pages; these Python
tests own what the crawl lifecycle does with the rows it persists. The HTML
fixtures, crawl seeders and the persisted-row seams that stand in for the
TypeScript executors live here, so each test file reads as assertions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.analysis.site_health.parser import extract_page_facts
from app.analysis.site_health.rules import RuleEvaluation, creates_issue
from app.analysis.site_health.scoring import score_analysis
from app.core.config.entitlements import (
    CAPABILITY_REGISTRY_REVISION,
)
from app.core.config.site_health_acquisition import (
    FETCH_ATTEMPT_OUTCOME_ERROR,
    FETCH_PURPOSE_ANALYZE,
    FETCH_PURPOSE_DISCOVER,
)
from app.core.config.site_health_contracts import (
    ANALYZER_VERSION,
    APPLICABILITY_CRAWL_FINALIZE,
    DISCOVERY_STATUS_COMPLETED,
    DISCOVERY_STATUS_RUNNING,
    EXTRACTOR_VERSION,
    OBSERVATION_SOURCE_LINK,
    OBSERVATION_SOURCE_ROOT,
    PAGE_ANALYSIS_STATUS_COMPLETED,
    RULE_OUTCOME_NOT_APPLICABLE,
    RULE_OUTCOME_SATISFIED,
    SCORING_VERSION,
    TASK_KIND_ANALYZE,
    TASK_KIND_DISCOVER,
)
from app.core.config.site_health_crawl_policy import (
    SELECTION_SOURCE_USER,
)
from app.core.config.site_health_measurement import (
    AEO_CHECK_PILLAR,
    WEB_CHECK_IDS,
    public_check_membership,
)
from app.core.config.site_health_rule_types import RULE_SCOPE_PAGE
from app.core.config.site_health_rules import SITE_HEALTH_RULES_BY_ID
from app.core.config.site_health_runtime import (
    runtime_policy_for_allowance,
)
from app.core.config.site_health_taxonomy import PAGE_KIND_OTHER
from app.core.config.task_queue import (
    TASK_STATUS_FAILED,
    TASK_STATUS_QUEUED,
    TASK_STATUS_SUCCEEDED,
)
from app.domain.site_health.entitlements import (
    apply_runtime_policy,
    resolve_runtime,
)
from app.domain.site_health.normalization import canonical_identity
from app.models.site_health.acquisition import SiteFetchArtifact, SiteFetchAttempt
from app.models.site_health.analysis import (
    SiteIssue,
    SitePageAnalysis,
    SiteRuleEvaluation,
)
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.queue import SiteCrawlTask
from app.models.site_health.urls import MonitoredSiteUrl, SiteUrl, SiteUrlObservation
from app.workers.site_health_worker import (
    SiteHealthWorker,
)
from tests.component.site_health_helpers import (
    seed_monitored_urls_allowance,
    seed_site_crawl,
)

# Default monitored-URL allowance for the "paid-like" crawl seeds (mirrors the
# old Starter limit of 50; tests that exercise the limit pass their own).
DEFAULT_SEED_MONITORED_URLS = 50


async def _seed_runtime(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    monitored_urls: int,
) -> None:
    """Seed the workspace runtime state for ``monitored_urls`` allowance.

    A positive allowance goes through the production grant path
    (``seed_monitored_urls_allowance``: billing account + link + override
    grant + refresh), so the row is a true projection that survives the
    refresh in ``rerun_page``/``replace_monitored_set``/``create_crawl``.
    A zero allowance writes the fail-closed sample policy directly: the
    workspace has no billing link, so any later refresh re-projects the same
    zero policy, and the worker phases only ever READ the row.
    """
    if monitored_urls > 0:
        await seed_monitored_urls_allowance(
            session, workspace_id=workspace_id, monitored_urls=monitored_urls
        )
        return
    runtime = await resolve_runtime(session, workspace_id)
    apply_runtime_policy(
        runtime,
        runtime_policy_for_allowance(0),
        resolved_registry_revision=CAPABILITY_REGISTRY_REVISION,
        resolved_entitlement_lifecycle_version=0,
        resolved_valid_until=None,
    )


def _html(links: list[str], *, title: str = "Page") -> bytes:
    anchors = "".join(f'<a href="{u}">l</a>' for u in links)
    return (
        f"<html><head><title>{title}</title></head><body>{anchors}</body></html>"
    ).encode()


async def _configure_crawl(
    session: AsyncSession,
    *,
    crawl_id: uuid.UUID,
    sample_mode: bool,
    count_disclosure: bool,
) -> None:
    """Freeze the minimal worker-facing configuration onto a seeded crawl."""
    crawl = await session.get(SiteCrawl, crawl_id)
    assert crawl is not None
    crawl.sample_mode = sample_mode
    # The planner drives discovery -> running when queuing the crawl; mirror
    # that so the worker's sample_completed/completed transitions are valid.
    crawl.discovery_status = DISCOVERY_STATUS_RUNNING
    crawl.configuration = {
        "root_registrable_domain": "example.com",
        "include_globs": None,
        "exclude_globs": None,
        "count_disclosure": count_disclosure,
    }
    await session.commit()


def _worker(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    owner: str = "site-test",
) -> SiteHealthWorker:
    """The Python crawl-maintenance worker; it reconciles what TypeScript settled."""
    return SiteHealthWorker(session_factory=session_factory, owner=owner)


def _rich_html() -> bytes:
    """A page that passes most rules (in-band title + meta description,
    canonical, single h1, og, JSON-LD WebPage + Organization, author + date
    meta, a question heading, >=100 words of body text, one external
    citation).

    Served via :func:`_rich_page` (gzip + HSTS) it passes EVERY per-page rule
    applicable to an ``other`` page. Note the 140-word body is deliberately
    thin FOR AN ARTICLE (>= 300 words) so the per-type thin-content minimum
    stays testable.
    """
    words = " ".join(f"word{i}" for i in range(140))
    return (
        '<html lang="en"><head>'
        "<title>Rich Page - everything about Acme widgets</title>"
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="description" content="A rich descriptive page about Acme '
        'widgets, their features, and pricing plans.">'
        '<link rel="canonical" href="https://example.com/rich">'
        '<meta property="og:title" content="Rich Page">'
        '<meta property="og:description" content="Rich desc">'
        '<meta name="author" content="Jane Doe">'
        '<meta property="article:published_time" content="2026-01-01T00:00:00Z">'
        '<script type="application/ld+json">'
        '{"@type":"Organization","name":"Acme","url":"https://example.com",'
        '"sameAs":["https://twitter.com/acme"],'
        '"logo":"https://example.com/logo.png"}'
        "</script>"
        '<script type="application/ld+json">'
        '{"@type":"WebPage","name":"Rich Page","url":"https://example.com/rich"}'
        "</script>"
        "</head><body>"
        "<h1>Rich Page Heading</h1>"
        f"<p>{words}</p>"
        "<h2>What makes Acme widgets reliable?</h2>"
        '<a href="https://example.com/other">internal</a>'
        '<a href="https://external.org/x">external</a>'
        "</body></html>"
    ).encode()


async def _add_monitored_analyze_task(
    session: AsyncSession,
    seed,
    url: str,
) -> tuple[uuid.UUID, uuid.UUID]:
    """Seed one monitored SiteUrl + its QUEUED analyze task; return their ids."""
    canonical, url_hash = canonical_identity(url)
    site_url = SiteUrl(
        workspace_id=seed.workspace_id,
        project_id=seed.project_id,
        normalized_url=canonical,
        url_hash=url_hash,
        display_url=canonical,
        host="example.com",
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


def _mark_analysis_ready(
    crawl: SiteCrawl, *, url_count: int, site_facts: dict | None = None
) -> None:
    """Put a seeded crawl into the post-discovery analyze-phase state."""
    crawl.discovery_status = DISCOVERY_STATUS_COMPLETED
    crawl.discovered_url_count = url_count
    crawl.inventory_complete = True
    crawl.extractor_version = EXTRACTOR_VERSION
    crawl.analyzer_version = ANALYZER_VERSION
    crawl.scoring_version = SCORING_VERSION
    crawl.site_facts = site_facts
    crawl.configuration = {
        "root_registrable_domain": "example.com",
        "include_globs": None,
        "exclude_globs": None,
        "count_disclosure": True,
    }


async def _seed_analyze_phase_crawl(
    session: AsyncSession,
    *,
    root: str,
    urls: tuple[str, ...],
    monitored_urls: int = DEFAULT_SEED_MONITORED_URLS,
    site_facts: dict | None = None,
):
    """Seed a full-allowance crawl already through discovery: every URL
    monitored with one QUEUED analyze task (the analyze-phase starting state).

    Returns ``(seed, ids)`` where ``ids`` holds one
    ``(site_url_id, analyze_task_id)`` pair per URL, in ``urls`` order.
    """
    seed = await seed_site_crawl(session, task_count=0, root_url=root)
    await _seed_runtime(session, seed.workspace_id, monitored_urls=monitored_urls)
    await session.commit()
    crawl = await session.get(SiteCrawl, seed.crawl_id)
    assert crawl is not None
    _mark_analysis_ready(crawl, url_count=len(urls), site_facts=site_facts)
    ids = [await _add_monitored_analyze_task(session, seed, url) for url in urls]
    await session.commit()
    return seed, ids


async def _analyses_by_page_url(
    session: AsyncSession, seed
) -> dict[str, SitePageAnalysis]:
    """The crawl's analyses keyed by their page's normalized URL."""
    analyses = (
        (
            await session.execute(
                select(SitePageAnalysis).where(
                    SitePageAnalysis.crawl_id == seed.crawl_id,
                    SitePageAnalysis.is_current.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    url_by_site_url_id = {
        row[0]: row[1]
        for row in (
            await session.execute(
                select(SiteUrl.id, SiteUrl.normalized_url).where(
                    SiteUrl.project_id == seed.project_id
                )
            )
        ).all()
    }
    return {url_by_site_url_id[a.site_url_id]: a for a in analyses}


async def _seed_analyze_ready(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    root: str = "https://example.com/rich",
    monitored_urls: int = DEFAULT_SEED_MONITORED_URLS,
):
    """Seed a full-allowance crawl with a monitored URL + one queued analyze task."""
    async with session_factory() as session:
        seed, ((site_url_id, analyze_task_id),) = await _seed_analyze_phase_crawl(
            session, root=root, monitored_urls=monitored_urls, urls=(root,)
        )
        return seed, site_url_id, analyze_task_id


_SCORED_PAGE_CHECK_IDS = tuple(sorted(WEB_CHECK_IDS | set(AEO_CHECK_PILLAR)))


def _page_evaluation(rule_id: str, outcome: str) -> RuleEvaluation:
    rule = SITE_HEALTH_RULES_BY_ID[rule_id]
    score_roles, pillar = public_check_membership(rule_id, PAGE_KIND_OTHER)
    applicable = outcome != RULE_OUTCOME_NOT_APPLICABLE
    return RuleEvaluation(
        rule_id=rule_id,
        rule_version=rule.rule_version,
        dimension=rule.dimension,
        category=rule.category,
        severity=rule.severity,
        finding_class=rule.finding_class,
        weight=float(rule.weight),
        outcome=outcome,
        description=rule.description,
        remediation=rule.remediation,
        display_applicability=applicable,
        score_applicability=applicable and bool(score_roles),
        score_roles=score_roles,
        readiness_dimension=pillar,
        scope=rule.scope,
    )


async def _settle_analysis_as_typescript(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: uuid.UUID,
    *,
    body: bytes = b"",
    page_kind: str = PAGE_KIND_OTHER,
    page_kind_evidence: dict | None = None,
    outcomes: dict[str, str] | None = None,
    error_code: str = "",
    classification_expected: bool = True,
) -> uuid.UUID | None:
    """Settle one analyze task with the rows the TypeScript analyzer commits.

    The analyzer (``frontend/services/api/src/site-health/analyze-task.ts``)
    owns per-page analysis and its tests; these Python tests own what the crawl
    lifecycle does with the persisted result. Like the analyzer, a success
    reuses the URL's discover artifact when one exists, otherwise appends an
    analyze artifact for ``body``; it writes a provisional current analysis
    with one evaluation per scored per-page check (``SATISFIED`` unless
    overridden in ``outcomes``; crawl-finalize checks are left to
    finalization) and their issues. ``error_code`` settles a failure instead.
    Returns the artifact the task settled on.
    """
    now = datetime.now(UTC)
    async with session_factory() as session:
        task = await session.get(SiteCrawlTask, task_id)
        assert task is not None and task.site_url_id is not None
        crawl = await session.get(SiteCrawl, task.crawl_id)
        assert crawl is not None
        task.attempt_count += 1
        task.completed_at = now
        task.classification_expected = classification_expected
        if error_code:
            task.status = TASK_STATUS_FAILED
            task.error_code = error_code
            await session.commit()
            return None

        artifact = await session.scalar(
            select(SiteFetchArtifact)
            .join(SiteCrawlTask, SiteCrawlTask.id == SiteFetchArtifact.task_id)
            .where(
                SiteFetchArtifact.crawl_id == crawl.id,
                SiteFetchArtifact.fetch_purpose == FETCH_PURPOSE_DISCOVER,
                SiteFetchArtifact.normalized_facts.is_not(None),
                SiteCrawlTask.url_hash == task.url_hash,
            )
            .order_by(SiteFetchArtifact.fetched_at.desc())
            .limit(1)
        )
        if artifact is None:
            artifact = SiteFetchArtifact(
                task_id=task.id,
                crawl_id=crawl.id,
                workspace_id=crawl.workspace_id,
                fetch_purpose=FETCH_PURPOSE_ANALYZE,
                requested_url=task.requested_url,
                final_url=task.requested_url,
                status_code=200,
                content_type="text/html",
                extractor_version=EXTRACTOR_VERSION,
                normalized_facts=extract_page_facts(
                    body,
                    final_url=task.requested_url,
                    content_type="text/html",
                    status_code=200,
                ),
            )
            session.add(artifact)
            await session.flush()

        evaluations = [
            _page_evaluation(
                rule_id, (outcomes or {}).get(rule_id, RULE_OUTCOME_SATISFIED)
            )
            for rule_id in _SCORED_PAGE_CHECK_IDS
            if SITE_HEALTH_RULES_BY_ID[rule_id].scope == RULE_SCOPE_PAGE
            and SITE_HEALTH_RULES_BY_ID[rule_id].applicability_key
            != APPLICABILITY_CRAWL_FINALIZE
        ]
        scores = score_analysis(evaluations, page_kind=page_kind)
        await session.execute(
            update(SitePageAnalysis)
            .where(
                SitePageAnalysis.crawl_id == crawl.id,
                SitePageAnalysis.site_url_id == task.site_url_id,
                SitePageAnalysis.is_current.is_(True),
            )
            .values(is_current=False)
        )
        analysis = SitePageAnalysis(
            workspace_id=crawl.workspace_id,
            project_id=crawl.project_id,
            crawl_id=crawl.id,
            site_url_id=task.site_url_id,
            artifact_id=artifact.id,
            status=PAGE_ANALYSIS_STATUS_COMPLETED,
            web_fundamentals_score=scores.web_fundamentals_score,
            web_fundamentals_coverage=scores.web_fundamentals_coverage,
            web_fundamentals_state=scores.web_fundamentals_state,
            technical_earned_weight=scores.technical_earned_weight,
            technical_determinate_weight=scores.technical_determinate_weight,
            technical_expected_weight=scores.technical_expected_weight,
            technical_critical_complete=scores.technical_critical_complete,
            aeo_readiness_score=scores.aeo_readiness_score,
            aeo_measurement_coverage=scores.aeo_measurement_coverage,
            aeo_measurement_state=scores.aeo_measurement_state,
            aeo_measurement_reason=scores.aeo_measurement_reason,
            readiness_dimensions=[
                item.to_dict() for item in scores.readiness_dimensions
            ],
            analyzer_version=ANALYZER_VERSION,
            scoring_version=scores.scoring_version,
            page_kind=page_kind,
            page_kind_evidence=page_kind_evidence,
            source_artifact_ids=[artifact.id],
            is_current=True,
        )
        session.add(analysis)
        await session.flush()
        rows = [
            SiteRuleEvaluation(
                workspace_id=crawl.workspace_id,
                analysis_id=analysis.id,
                source_artifact_id=artifact.id,
                rule_id=evaluation.rule_id,
                rule_version=evaluation.rule_version,
                dimension=evaluation.dimension,
                category=evaluation.category,
                severity=evaluation.severity,
                finding_class=evaluation.finding_class,
                scope=evaluation.scope,
                weight=evaluation.weight,
                outcome=evaluation.outcome,
                display_applicability=evaluation.display_applicability,
                score_applicability=evaluation.score_applicability,
                score_roles=list(evaluation.score_roles),
                readiness_dimension=evaluation.readiness_dimension,
                evidence={},
                supporting_artifact_ids=[artifact.id],
            )
            for evaluation in evaluations
        ]
        session.add_all(rows)
        await session.flush()
        analysis.source_evaluation_ids = [row.id for row in rows]
        session.add_all(
            SiteIssue(
                workspace_id=crawl.workspace_id,
                project_id=crawl.project_id,
                crawl_id=crawl.id,
                site_url_id=task.site_url_id,
                analysis_id=analysis.id,
                evaluation_id=row.id,
                source_artifact_id=artifact.id,
                rule_id=evaluation.rule_id,
                dimension=evaluation.dimension,
                category=evaluation.category,
                severity=evaluation.severity,
                finding_class=evaluation.finding_class,
                description=evaluation.description,
                remediation=evaluation.remediation,
            )
            for row, evaluation in zip(rows, evaluations, strict=True)
            if creates_issue(evaluation)
        )
        task.status = TASK_STATUS_SUCCEEDED
        task.result_artifact_id = artifact.id
        crawl.analyzed_url_count += 1
        await session.commit()
        return artifact.id


async def _seed_root_discover(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    root: str,
    monitored_urls: int = DEFAULT_SEED_MONITORED_URLS,
    sample_mode: bool = False,
):
    """Seed an isolated QUEUED root-discover task."""
    async with session_factory() as session:
        seed = await seed_site_crawl(session, task_count=0, root_url=root)
        await _seed_runtime(session, seed.workspace_id, monitored_urls=monitored_urls)
        await session.commit()
        await _configure_crawl(
            session,
            crawl_id=seed.crawl_id,
            sample_mode=sample_mode,
            count_disclosure=True,
        )
        _canonical, root_hash = canonical_identity(root)
        session.add(
            SiteCrawlTask(
                crawl_id=seed.crawl_id,
                workspace_id=seed.workspace_id,
                task_kind=TASK_KIND_DISCOVER,
                requested_url=root,
                url_hash=root_hash,
                generation=0,
                idempotency_key=f"{seed.crawl_id}:{TASK_KIND_DISCOVER}:root:0",
                status=TASK_STATUS_QUEUED,
                randomized_position=0,
            )
        )
        await session.commit()
        return seed


async def _seed_root_only(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    root: str = "https://example.com/",
):
    """A full-allowance crawl with ONE queued root discover task."""
    return await _seed_root_discover(session_factory, root=root)


async def _settle_discovery_as_typescript(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: uuid.UUID,
    *,
    links: tuple[str, ...] = (),
    status_code: int = 200,
    error_code: str = "",
) -> list[uuid.UUID]:
    """Settle one discover task with the rows the TypeScript executor commits.

    The executor (``frontend/services/api/src/site-health/discover-task.ts``)
    owns acquisition, link extraction and frontier admission, with their
    tests; these Python tests own what the crawl lifecycle does with the
    result. A success writes the discover artifact, the URL's completed
    identity and observation, and one queued child discover task per link.
    ``error_code`` settles a terminal failure with its one error attempt
    instead. Returns the child task ids.
    """
    now = datetime.now(UTC)
    async with session_factory() as session:
        task = await session.get(SiteCrawlTask, task_id)
        assert task is not None
        # Serialize admission like the real frontier, including duplicate links
        # discovered concurrently by siblings in this fixture crawl.
        crawl = await session.get(SiteCrawl, task.crawl_id, with_for_update=True)
        assert crawl is not None
        task.attempt_count += 1
        task.completed_at = now
        if error_code:
            task.status = TASK_STATUS_FAILED
            task.error_code = error_code
            session.add(
                SiteFetchAttempt(
                    task_id=task.id,
                    crawl_id=crawl.id,
                    workspace_id=crawl.workspace_id,
                    attempt_number=task.attempt_count,
                    method="GET",
                    target_host="example.com",
                    outcome=FETCH_ATTEMPT_OUTCOME_ERROR,
                    error_code=error_code,
                    status_code=status_code,
                )
            )
            await session.commit()
            return []

        site_url = await _site_url(session, crawl, task.requested_url, task.depth)
        site_url.discovery_status = DISCOVERY_STATUS_COMPLETED
        artifact = SiteFetchArtifact(
            task_id=task.id,
            crawl_id=crawl.id,
            workspace_id=crawl.workspace_id,
            fetch_purpose=FETCH_PURPOSE_DISCOVER,
            requested_url=task.requested_url,
            final_url=task.requested_url,
            status_code=status_code,
            content_type="text/html",
            extractor_version=EXTRACTOR_VERSION,
            normalized_facts=extract_page_facts(
                _html(list(links)),
                final_url=task.requested_url,
                content_type="text/html",
                status_code=status_code,
            ),
        )
        session.add(artifact)
        await session.flush()
        await session.execute(
            insert(SiteUrlObservation)
            .values(
                workspace_id=crawl.workspace_id,
                project_id=crawl.project_id,
                crawl_id=crawl.id,
                site_url_id=site_url.id,
                source_kind=OBSERVATION_SOURCE_ROOT
                if task.depth == 0
                else OBSERVATION_SOURCE_LINK,
                source_artifact_id=artifact.id,
                depth=task.depth,
                observed_url=task.requested_url,
                final_url=task.requested_url,
                status_code=status_code,
            )
            .on_conflict_do_nothing(index_elements=["crawl_id", "site_url_id"])
        )
        children: list[SiteCrawlTask] = []
        known_hashes = set(
            await session.scalars(
                select(SiteCrawlTask.url_hash).where(
                    SiteCrawlTask.workspace_id == crawl.workspace_id,
                    SiteCrawlTask.crawl_id == crawl.id,
                    SiteCrawlTask.task_kind == TASK_KIND_DISCOVER,
                )
            )
        )
        for link in links:
            _, link_hash = canonical_identity(link)
            if link_hash in known_hashes:
                continue
            known_hashes.add(link_hash)
            child_url = await _site_url(session, crawl, link, task.depth + 1)
            session.add(
                SiteUrlObservation(
                    workspace_id=crawl.workspace_id,
                    project_id=crawl.project_id,
                    crawl_id=crawl.id,
                    site_url_id=child_url.id,
                    source_kind=OBSERVATION_SOURCE_LINK,
                    source_artifact_id=artifact.id,
                    depth=task.depth + 1,
                    observed_url=child_url.normalized_url,
                    final_url=child_url.normalized_url,
                )
            )
            child = SiteCrawlTask(
                crawl_id=crawl.id,
                workspace_id=crawl.workspace_id,
                site_url_id=child_url.id,
                task_kind=TASK_KIND_DISCOVER,
                requested_url=child_url.normalized_url,
                url_hash=child_url.url_hash,
                depth=task.depth + 1,
                generation=0,
                idempotency_key=f"{crawl.id}:{TASK_KIND_DISCOVER}:{child_url.url_hash}:0",
                status=TASK_STATUS_QUEUED,
            )
            session.add(child)
            children.append(child)
        task.status = TASK_STATUS_SUCCEEDED
        task.result_artifact_id = artifact.id
        crawl.discovered_url_count += 1
        crawl.admitted_url_count += len(children)
        await session.flush()
        child_ids = [child.id for child in children]
        await session.commit()
        return child_ids


async def _site_url(
    session: AsyncSession, crawl: SiteCrawl, url: str, depth: int
) -> SiteUrl:
    """The project's identity for ``url``, created as admission would."""
    canonical, url_hash = canonical_identity(url)
    site_url = await session.scalar(
        select(SiteUrl).where(
            SiteUrl.workspace_id == crawl.workspace_id,
            SiteUrl.project_id == crawl.project_id,
            SiteUrl.url_hash == url_hash,
        )
    )
    if site_url is None:
        now = datetime.now(UTC)
        site_url = SiteUrl(
            workspace_id=crawl.workspace_id,
            project_id=crawl.project_id,
            normalized_url=canonical,
            url_hash=url_hash,
            display_url=canonical,
            host="example.com",
            depth=depth,
            discovery_status=DISCOVERY_STATUS_RUNNING,
            first_seen_crawl_id=crawl.id,
            last_seen_crawl_id=crawl.id,
            first_seen_at=now,
            last_seen_at=now,
        )
        session.add(site_url)
        await session.flush()
    return site_url
