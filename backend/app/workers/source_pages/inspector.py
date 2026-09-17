"""Inspecting the external pages an audit cited.

Runs as one analytics task per terminal audit. It records what the audit cited,
follows a bounded number of redirect tokens, claims what the budget allows,
fetches each claimed page politely, and stores what it found. When the batch
finishes it enqueues the existing Opportunity refresh.

That last step is the reason this worker exists as a separate hop rather than
living in audit terminalization. Terminalization queues the Opportunity refresh
the moment an audit commits; if inspection were queued from the same place, the
refresh would always run before any page evidence existed and the page-aware
detectors would see nothing.

Audit completion never depends on any of this. A publisher that blocks us is a
fact about that publisher, not a failed measurement, and a queue outage must
never reach back into committed audit evidence.

Politeness is stricter here than for owned-site crawling: one request at a time
per host, a full second between them. These are publishers whose goodwill is
the thing the whole workflow is trying to earn.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.analysis.scoring import ScoringConfig
from app.analysis.source_pages import assess_page, extract_source_page
from app.connectors.web_evidence.contracts import FetchError, FetchResult
from app.connectors.web_evidence.fetcher import SecureFetcher
from app.connectors.web_evidence.resolver import SystemDnsResolver
from app.connectors.web_evidence.source_page_fetch import (
    redirect_resolution_request,
    source_page_request,
)
from app.core.config.source_pages import (
    INSPECTION_REASON_NON_HTML,
    INSPECTION_REASON_ROBOTS,
    INSPECTION_REASON_STATUS,
    INSPECTION_REASON_TRANSPORT,
    INSPECTION_REASON_UNRESOLVED_REDIRECT,
    SOURCE_PAGE_ALLOWED_CONTENT_TYPES,
    SOURCE_PAGE_FETCH_CONCURRENCY,
    SOURCE_PAGE_PER_HOST_DELAY_SECONDS,
    SOURCE_PAGE_REQUEST_TIMEOUT_SECONDS,
)
from app.domain.opportunities.verification import enqueue_audit_opportunity_tasks
from app.domain.source_pages.admission import claim_pages, spend_for_redirect
from app.domain.source_pages.identity import identify_unwrapped_redirect
from app.domain.source_pages.persistence import (
    OUTCOME_BLOCKED,
    OUTCOME_FAILED,
    OUTCOME_INSPECTED,
    FetchOutcome,
    record_inspection,
)
from app.domain.source_pages.roster import project_roster
from app.domain.source_pages.sync import backfill_citation_identity, sync_cited_pages
from app.models.analytics import AnalyticsTask
from app.models.audit import Audit
from app.models.source_pages import SourcePage
from app.workers.site_health.robots_cache import RobotsCache
from app.workers.site_health.urls import authority_key

logger = logging.getLogger("app.workers.source_pages")


def _new_fetcher() -> SecureFetcher:
    return SecureFetcher(resolver=SystemDnsResolver())


class HostPacer:
    """One request at a time per host, spaced by a fixed delay.

    Deliberately not the Site Health host gate: that paces for a site we were
    invited to crawl and allows several concurrent requests per host. A
    publisher we are about to ask for a listing gets one.
    """

    def __init__(self, *, delay_seconds: float = SOURCE_PAGE_PER_HOST_DELAY_SECONDS):
        self._delay = delay_seconds
        self._locks: dict[str, asyncio.Lock] = {}
        self._last: dict[str, float] = {}

    @contextlib.asynccontextmanager
    async def slot(self, authority: str):
        lock = self._locks.setdefault(authority, asyncio.Lock())
        async with lock:
            elapsed = time.monotonic() - self._last.get(authority, 0.0)
            if elapsed < self._delay:
                await asyncio.sleep(self._delay - elapsed)
            try:
                yield
            finally:
                self._last[authority] = time.monotonic()


@dataclass(slots=True)
class _Inspector:
    fetcher: SecureFetcher
    robots: RobotsCache
    pacer: HostPacer

    async def allowed(self, url: str) -> bool:
        """Whether robots permits this fetch. Unreachable robots fails open."""
        try:
            policy, _body, _status = await self.robots.ensure(authority_key(url))
        except (FetchError, OSError, ValueError):
            logger.debug("source-page robots unavailable; continuing", exc_info=True)
            return True
        return bool(policy.can_fetch(url))

    async def fetch(self, url: str, *, redirect: bool) -> FetchResult | FetchOutcome:
        """Fetch one external URL, or describe why it could not be read."""
        if not await self.allowed(url):
            return FetchOutcome(
                outcome=OUTCOME_BLOCKED,
                requested_url=url,
                robots_state="disallowed",
                reason=INSPECTION_REASON_ROBOTS,
            )
        request = (
            redirect_resolution_request(url) if redirect else source_page_request(url)
        )
        try:
            async with self.pacer.slot(authority_key(url)):
                async with asyncio.timeout(SOURCE_PAGE_REQUEST_TIMEOUT_SECONDS * 2):
                    return await self.fetcher.fetch(request)
        except FetchError as exc:
            return FetchOutcome(
                outcome=OUTCOME_FAILED,
                requested_url=url,
                reason=str(exc.error_code or INSPECTION_REASON_TRANSPORT)[:48],
            )
        except (TimeoutError, OSError, ValueError):
            logger.debug("source-page fetch failed", exc_info=True)
            return FetchOutcome(
                outcome=OUTCOME_FAILED,
                requested_url=url,
                reason=INSPECTION_REASON_TRANSPORT,
            )


def _outcome_from_result(url: str, result: FetchResult) -> FetchOutcome:
    content_type = (result.content_type or "").split(";")[0].strip().lower()
    readable = content_type in SOURCE_PAGE_ALLOWED_CONTENT_TYPES
    ok = 200 <= result.status_code < 300
    return FetchOutcome(
        outcome=OUTCOME_INSPECTED if (ok and readable) else OUTCOME_FAILED,
        requested_url=url,
        final_url=result.final_url or url,
        status_code=result.status_code,
        content_type=result.content_type,
        charset=result.charset,
        body_bytes=result.decoded_bytes,
        redirect_chain=tuple(hop.to_url for hop in result.redirect_chain),
        redacted_headers=dict(result.redacted_headers or {}),
        robots_state="allowed",
        reason=(
            None
            if (ok and readable)
            else (INSPECTION_REASON_STATUS if not ok else INSPECTION_REASON_NON_HTML)
        ),
    )


async def _inspect_one(
    session: AsyncSession,
    inspector: _Inspector,
    *,
    page: SourcePage,
    config: ScoringConfig,
    roster_version: str,
    audit_id: uuid.UUID,
) -> None:
    result = await inspector.fetch(page.canonical_url, redirect=False)
    if isinstance(result, FetchOutcome):
        await record_inspection(session, page=page, fetch=result, audit_id=audit_id)
        return
    outcome = _outcome_from_result(page.canonical_url, result)
    if outcome.outcome != OUTCOME_INSPECTED:
        await record_inspection(session, page=page, fetch=outcome, audit_id=audit_id)
        return
    extracted = extract_source_page(result.body, charset=result.charset)
    assessment = assess_page(
        extracted,
        brand_name=config.brand_name,
        brand_aliases=config.brand_aliases,
        competitors=tuple(
            (competitor.name, competitor.aliases) for competitor in config.competitors
        ),
    )
    await record_inspection(
        session,
        page=page,
        fetch=outcome,
        extracted=extracted,
        assessment=assessment,
        roster_version=roster_version,
        audit_id=audit_id,
    )


async def _resolve_redirects(
    session_factory: async_sessionmaker[AsyncSession],
    inspector: _Inspector,
    *,
    audit: Audit,
    tokens: tuple,
) -> None:
    """Follow bounded redirect tokens so their publishers become countable."""
    for token in tokens:
        async with session_factory() as session:
            paid = await spend_for_redirect(
                session,
                workspace_id=audit.workspace_id,
                project_id=audit.project_id,
                redirect_url=token.url,
            )
            await session.commit()
        if not paid:
            logger.info("source-page redirect budget exhausted")
            return
        result = await inspector.fetch(token.url, redirect=True)
        if isinstance(result, FetchOutcome):
            continue
        identity = identify_unwrapped_redirect(result.final_url)
        if not identity.is_resolved:
            logger.debug(
                "redirect did not resolve to a publisher",
                extra={"reason": INSPECTION_REASON_UNRESOLVED_REDIRECT},
            )
            continue
        async with session_factory() as session:
            await backfill_citation_identity(
                session,
                workspace_id=audit.workspace_id,
                redirect_url=token.url,
                resolved_url=identity.resolved_url or "",
                canonical_url=identity.canonical_url or "",
                url_hash=identity.url_hash or "",
                method=identity.method,
                version=identity.version,
            )
            await session.commit()


async def _load_audit(session: AsyncSession, task: AnalyticsTask) -> Audit | None:
    try:
        audit_id = uuid.UUID(str((task.payload or {}).get("audit_id")))
    except (TypeError, ValueError):
        raise ValueError("Source page inspection requires audit_id") from None
    return await session.scalar(
        select(Audit).where(
            Audit.workspace_id == task.workspace_id,
            Audit.project_id == task.project_id,
            Audit.id == audit_id,
        )
    )


async def inspect_source_pages(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """Inspect this audit's cited pages, then hand off to Opportunities."""
    if task.project_id is None:
        raise ValueError("Source page inspection requires project_id")

    async with session_factory() as session:
        audit = await _load_audit(session, task)
        if audit is None:
            raise ValueError("Source page inspection audit is unavailable")
        sync = await sync_cited_pages(session, audit=audit)
        await session.commit()
        config = ScoringConfig.from_project(audit.configuration or {})
        roster_version = project_roster(audit.configuration or {})
        workspace_id, project_id, audit_id = (
            audit.workspace_id,
            audit.project_id,
            audit.id,
        )

    async with _new_fetcher() as fetcher:
        inspector = _Inspector(
            fetcher=fetcher,
            robots=RobotsCache(new_fetcher=_new_fetcher),
            pacer=HostPacer(),
        )
        await _resolve_redirects(
            session_factory, inspector, audit=audit, tokens=sync.unresolved
        )
        # Resolving tokens creates identities the sync did not see, so the
        # inventory is refreshed before anything is claimed.
        async with session_factory() as session:
            await sync_cited_pages(session, audit=audit)
            claims = await claim_pages(
                session, workspace_id=workspace_id, project_id=project_id
            )
            await session.commit()

        semaphore = asyncio.Semaphore(SOURCE_PAGE_FETCH_CONCURRENCY)

        async def run(claim) -> None:
            async with semaphore, session_factory() as session:
                page = await session.get(SourcePage, claim.source_page_id)
                if page is None:
                    return
                try:
                    await _inspect_one(
                        session,
                        inspector,
                        page=page,
                        config=config,
                        roster_version=roster_version,
                        audit_id=audit_id,
                    )
                    await session.commit()
                except Exception:
                    # One unreachable publisher must not discard the pages that
                    # were read successfully alongside it.
                    logger.exception(
                        "source-page inspection failed",
                        extra={"source_page_id": str(claim.source_page_id)},
                    )
                    await session.rollback()

        await asyncio.gather(*(run(claim) for claim in claims))

    # Batch completion, not per page: the recompute is project-wide, and
    # running it once per inspected page would be the same work repeated.
    async with session_factory() as session:
        await enqueue_audit_opportunity_tasks(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            audit_id=audit_id,
        )
        await session.commit()
