"""Inspecting the external pages an audit cited.

Runs as one analytics task per terminal audit. It records what the audit cited,
follows a bounded number of redirect tokens, claims what the budget allows,
fetches each claimed page politely, and stores what it found. When the batch
finishes it enqueues the existing Opportunity refresh.

That last step is the reason this worker exists as a separate hop rather than
living in audit terminalization. Terminalization queues the Opportunity refresh
the moment an audit commits; if inspection were queued from the same place, the
refresh would always run before any page evidence existed and the page-aware
detectors would see nothing. Because terminalization now queues inspection
INSTEAD of the refresh, that refresh is owed on EVERY terminal outcome,
including this task's own failures -- see ``compensate_inspection_handoff``,
which the queue fires rather than this module.

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
from app.connectors.web_evidence.source_page_fetch import source_page_request
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


@dataclass(frozen=True, slots=True)
class _Scope:
    """The frozen identity one inspection run works against."""

    workspace_id: uuid.UUID
    project_id: uuid.UUID
    audit_id: uuid.UUID
    config: ScoringConfig
    roster_version: str


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

    def _blocked(self, url: str) -> FetchOutcome:
        return FetchOutcome(
            outcome=OUTCOME_BLOCKED,
            requested_url=url,
            robots_state="disallowed",
            reason=INSPECTION_REASON_ROBOTS,
        )

    async def fetch(self, url: str) -> FetchResult | FetchOutcome:
        """Fetch one external URL, or describe why it could not be read."""
        if not await self.allowed(url):
            return self._blocked(url)
        request = source_page_request(url)
        try:
            async with self.pacer.slot(authority_key(url)):
                async with asyncio.timeout(SOURCE_PAGE_REQUEST_TIMEOUT_SECONDS * 2):
                    result = await self.fetcher.fetch(request)
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
        return await self._respect_final_host(url, result)

    async def _respect_final_host(
        self, url: str, result: FetchResult
    ) -> FetchResult | FetchOutcome:
        """Honour robots for the host we actually landed on.

        The fetcher re-validates every redirect hop against the SSRF policy but
        knows nothing about robots, so a cited URL that redirects to another
        publisher would otherwise be read without that publisher's permission.
        The destination is what gets stored and quoted, so the destination is
        what has to consent.
        """
        final = result.final_url or url
        if authority_key(final) == authority_key(url):
            return result
        return result if await self.allowed(final) else self._blocked(url)


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


async def _record_result(
    session: AsyncSession,
    *,
    page: SourcePage,
    result: FetchResult,
    scope: _Scope,
) -> None:
    """Assess and persist one already-downloaded page."""
    outcome = _outcome_from_result(page.canonical_url, result)
    if outcome.outcome != OUTCOME_INSPECTED:
        await record_inspection(
            session, page=page, fetch=outcome, audit_id=scope.audit_id
        )
        return
    extracted = extract_source_page(result.body, charset=result.charset)
    assessment = assess_page(
        extracted,
        brand_name=scope.config.brand_name,
        brand_aliases=scope.config.brand_aliases,
        competitors=tuple(
            (competitor.name, competitor.aliases)
            for competitor in scope.config.competitors
        ),
    )
    await record_inspection(
        session,
        page=page,
        fetch=outcome,
        extracted=extracted,
        assessment=assessment,
        roster_version=scope.roster_version,
        audit_id=scope.audit_id,
    )


async def _inspect_one(
    session: AsyncSession,
    inspector: _Inspector,
    *,
    page: SourcePage,
    scope: _Scope,
) -> None:
    result = await inspector.fetch(page.canonical_url)
    if isinstance(result, FetchOutcome):
        await record_inspection(
            session, page=page, fetch=result, audit_id=scope.audit_id
        )
        return
    await _record_result(session, page=page, result=result, scope=scope)


async def _resolve_redirects(
    session_factory: async_sessionmaker[AsyncSession],
    inspector: _Inspector,
    *,
    audit: Audit,
    tokens: tuple,
) -> dict[str, FetchResult]:
    """Follow bounded redirect tokens so their publishers become countable.

    Returns the page downloaded for each resolved identity. Following the token
    IS fetching the publisher, so discarding the body would pull the same page
    over the wire twice and spend two budget units to learn one thing.
    """
    resolved: dict[str, FetchResult] = {}
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
            return resolved
        result = await inspector.fetch(token.url)
        if isinstance(result, FetchOutcome):
            continue
        identity = identify_unwrapped_redirect(result.final_url)
        if not identity.url_hash:
            logger.debug(
                "redirect did not resolve to a publisher",
                extra={"reason": INSPECTION_REASON_UNRESOLVED_REDIRECT},
            )
            continue
        async with session_factory() as session:
            await backfill_citation_identity(
                session,
                workspace_id=audit.workspace_id,
                project_id=audit.project_id,
                redirect_url=token.url,
                resolved_url=identity.resolved_url or "",
                canonical_url=identity.canonical_url or "",
                url_hash=identity.url_hash,
                method=identity.method,
                version=identity.version,
            )
            await session.commit()
        resolved[identity.url_hash] = result
    return resolved


async def _load_audit(session: AsyncSession, task: AnalyticsTask) -> Audit | None:
    return await session.scalar(
        select(Audit).where(
            Audit.workspace_id == task.workspace_id,
            Audit.project_id == task.project_id,
            Audit.id == _audit_id(task),
        )
    )


def _audit_id(task: AnalyticsTask) -> uuid.UUID:
    try:
        return uuid.UUID(str((task.payload or {}).get("audit_id")))
    except (TypeError, ValueError):
        raise ValueError("Source page inspection requires audit_id") from None


async def _record_prefetched(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    scope: _Scope,
    prefetched: dict[str, FetchResult],
) -> None:
    """Store the pages already downloaded while resolving redirect tokens."""
    for url_hash, result in prefetched.items():
        async with session_factory() as session:
            page = await session.scalar(
                select(SourcePage).where(
                    SourcePage.project_id == scope.project_id,
                    SourcePage.url_hash == url_hash,
                )
            )
            if page is None:
                continue
            try:
                await _record_result(session, page=page, result=result, scope=scope)
                await session.commit()
            except Exception:
                logger.exception(
                    "source-page prefetch persistence failed",
                    extra={"source_page_id": str(page.id)},
                )
                await session.rollback()


async def _inspect_claims(
    session_factory: async_sessionmaker[AsyncSession],
    inspector: _Inspector,
    *,
    scope: _Scope,
    claims: list[uuid.UUID],
) -> None:
    semaphore = asyncio.Semaphore(SOURCE_PAGE_FETCH_CONCURRENCY)

    async def run(page_id: uuid.UUID) -> None:
        async with semaphore, session_factory() as session:
            page = await session.get(SourcePage, page_id)
            if page is None:
                return
            try:
                await _inspect_one(session, inspector, page=page, scope=scope)
                await session.commit()
            except Exception:
                # One unreachable publisher must not discard the pages that
                # were read successfully alongside it.
                logger.exception(
                    "source-page inspection failed",
                    extra={"source_page_id": str(page_id)},
                )
                await session.rollback()

    await asyncio.gather(*(run(page_id) for page_id in claims))


async def _hand_off(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID,
) -> None:
    """Queue the Opportunity refresh this audit is waiting on.

    Batch completion, not per page: the recompute is project-wide, so running
    it once per inspected page would be the same work repeated.
    """
    async with session_factory() as session:
        await enqueue_audit_opportunity_tasks(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            audit_id=audit_id,
        )
        await session.commit()


async def compensate_inspection_handoff(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """Hand off to Opportunities for an inspection that ended without doing it.

    Registered as this kind's TERMINAL COMPENSATION and fired by the queue,
    not from here, because the two ways an inspection ends terminally are not
    both visible to this module. A worker that exhausts its retries returns
    through ``_finalize``; a worker killed mid-inspection is terminalized by
    the lease sweeper, which runs no executor code at all. Compensating inside
    the executor covers only the first and leaves a committed audit with
    permanently stale opportunities on the second.

    Idempotent by the enqueue's own key, so firing on a path that already
    handed off costs nothing.
    """
    if task.project_id is None:
        return
    await _hand_off(
        session_factory,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        audit_id=_audit_id(task),
    )


async def _run_inspection(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> _Scope:
    async with session_factory() as session:
        audit = await _load_audit(session, task)
        if audit is None:
            raise ValueError("Source page inspection audit is unavailable")
        tokens = await sync_cited_pages(session, audit=audit)
        await session.commit()
        scope = _Scope(
            workspace_id=audit.workspace_id,
            project_id=audit.project_id,
            audit_id=audit.id,
            config=ScoringConfig.from_project(audit.configuration or {}),
            roster_version=project_roster(audit.configuration or {}),
        )

    async with _new_fetcher() as fetcher:
        inspector = _Inspector(
            fetcher=fetcher,
            robots=RobotsCache(new_fetcher=_new_fetcher),
            pacer=HostPacer(),
        )
        prefetched = await _resolve_redirects(
            session_factory, inspector, audit=audit, tokens=tokens
        )
        # Resolving tokens creates identities the first sync could not see.
        async with session_factory() as session:
            await sync_cited_pages(session, audit=audit)
            await session.commit()
        await _record_prefetched(session_factory, scope=scope, prefetched=prefetched)
        async with session_factory() as session:
            claims = await claim_pages(
                session,
                workspace_id=scope.workspace_id,
                project_id=scope.project_id,
            )
            await session.commit()
        await _inspect_claims(session_factory, inspector, scope=scope, claims=claims)
    return scope


async def inspect_source_pages(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """Inspect this audit's cited pages, then hand off to Opportunities.

    Terminalization queues inspection INSTEAD of the Opportunity refresh, so
    this hand-off is owed on every terminal outcome. The failing outcomes are
    owed by ``compensate_inspection_handoff``, which the queue fires; a
    retryable failure just raises, because waiting for its retries is right
    and handing off early would spend the idempotency key before the evidence
    exists.
    """
    if task.project_id is None:
        raise ValueError("Source page inspection requires project_id")
    scope = await _run_inspection(session_factory, task)
    await _hand_off(
        session_factory,
        workspace_id=scope.workspace_id,
        project_id=scope.project_id,
        audit_id=scope.audit_id,
    )
