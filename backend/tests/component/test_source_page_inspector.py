"""The inspection worker, from a terminal audit to the Opportunity handoff.

Stubs the fetcher rather than the network: the point of these is the ordering
and the failure containment around it, not HTTP.

Two properties matter most. Opportunity recompute must be queued AFTER the
pages are inspected, because terminalization queues this worker in its place
precisely so the refresh sees the evidence. And one unreachable publisher must
not discard the pages read successfully beside it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.web_evidence.contracts import FetchError, FetchResult
from app.core.config.analytics import (
    ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH,
    ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION,
)
from app.core.config.source_pages import (
    INSPECTION_BLOCKED,
    INSPECTION_FAILED,
    INSPECTION_INSPECTED,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PRESENT,
)
from app.models.analytics import AnalyticsTask
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)
from app.workers.source_pages import inspector as inspector_module
from app.workers.source_pages.inspector import inspect_source_pages
from tests.component.opportunity_helpers import _seed_scenario

pytestmark = pytest.mark.asyncio

_LISTICLE = (
    "<html><head><title>Best CRM tools</title></head><body>"
    "<h1>Best CRM tools</h1><p>Acme Corp leads, ahead of Globex.</p>"
    "<p>" + ("Evaluating a platform takes time. " * 40) + "</p>"
    "</body></html>"
).encode()

_WITHOUT_BRAND = (
    "<html><head><title>Best CRM tools</title></head><body>"
    "<h1>Best CRM tools</h1><p>Globex and Initech lead.</p>"
    "<p>" + ("Evaluating a platform takes time. " * 40) + "</p>"
    "</body></html>"
).encode()


def _result(url: str, body: bytes, *, status: int = 200) -> FetchResult:
    return FetchResult(
        requested_url=url,
        final_url=url,
        status_code=status,
        redacted_headers={"content-type": "text/html"},
        content_type="text/html; charset=utf-8",
        http_version="1.1",
        body=body,
        wire_bytes=len(body),
        decoded_bytes=len(body),
        ttfb_ms=5,
        latency_ms=10,
        charset="utf-8",
    )


class _StubFetcher:
    """Answers by URL. Anything unmapped raises, like an unreachable host."""

    def __init__(self, responses: dict[str, FetchResult]) -> None:
        self._responses = responses
        self.requested: list[str] = []

    async def __aenter__(self) -> _StubFetcher:
        return self

    async def __aexit__(self, *exc) -> None:
        return None

    async def fetch(self, request, **_kwargs) -> FetchResult:
        self.requested.append(request.url)
        try:
            return self._responses[request.url]
        except KeyError:
            raise FetchError("unreachable", error_code="transport_error") from None


class _AllowAllRobots:
    async def ensure(self, authority: str):
        class _Policy:
            def can_fetch(self, url: str) -> bool:
                return True

        return (_Policy(), "", 200)


class _DenyAllRobots:
    async def ensure(self, authority: str):
        class _Policy:
            def can_fetch(self, url: str) -> bool:
                return False

        return (_Policy(), "", 200)


@pytest.fixture
def stub_inspection(monkeypatch):
    """Install a stub fetcher and robots policy for the worker."""

    def install(responses: dict[str, FetchResult], *, robots=None) -> _StubFetcher:
        fetcher = _StubFetcher(responses)
        monkeypatch.setattr(inspector_module, "_new_fetcher", lambda: fetcher)
        monkeypatch.setattr(
            inspector_module, "RobotsCache", lambda **_kw: robots or _AllowAllRobots()
        )
        # Pacing is real policy but irrelevant to ordering; keep tests quick.
        monkeypatch.setattr(inspector_module, "HostPacer", lambda **_kw: _NoPacer())
        return fetcher

    return install


class _NoPacer:
    def slot(self, authority: str):
        import contextlib

        @contextlib.asynccontextmanager
        async def _slot():
            yield

        return _slot()


async def _freeze_roster(session: AsyncSession, scenario) -> None:
    """Give the audit the roster its answers were scored against.

    Presence is judged against the audit's FROZEN identity, so a scenario with
    no roster legitimately finds nobody.
    """
    from app.models.audit import Audit

    audit = await session.get(Audit, scenario.audit_id)
    assert audit is not None
    audit.configuration = {
        **(audit.configuration or {}),
        "brand_name": "Acme Corp",
        "brand_aliases": ["Acme"],
        "competitors": [{"name": "Globex", "aliases": ["Globex"], "domains": []}],
    }
    await session.flush()


async def _seed_citation(
    session: AsyncSession,
    scenario,
    *,
    url: str,
    url_hash: str,
    domain: str,
    is_owned: bool = False,
) -> None:
    from app.models.analysis import Citation

    analysis_id = await session.scalar(
        select(Citation.analysis_id).where(Citation.audit_id == scenario.audit_id)
    )
    artifact_id = await session.scalar(
        select(Citation.artifact_id).where(Citation.audit_id == scenario.audit_id)
    )
    session.add(
        Citation(
            workspace_id=scenario.workspace_id,
            audit_id=scenario.audit_id,
            analysis_id=analysis_id or scenario.analysis1_id,
            artifact_id=artifact_id,
            analyzer_version="test",
            ordinal=99,
            url=url,
            title=domain,
            domain=domain,
            classification="owned" if is_owned else "third_party",
            is_owned=is_owned,
            canonical_url=url,
            url_hash=url_hash,
            url_identity_method="verbatim",
            url_identity_version="citation-identity-1",
        )
    )
    await session.flush()


async def _task(scenario) -> AnalyticsTask:
    return AnalyticsTask(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        task_kind=ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION,
        payload={"audit_id": str(scenario.audit_id)},
        idempotency_key=f"inspect:{uuid.uuid4()}",
    )


async def test_inspection_records_presence_and_then_queues_the_refresh(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    url = "https://publisher.com/best-crm"
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _freeze_roster(session, scenario)
        await _seed_citation(
            session, scenario, url=url, url_hash="a" * 64, domain="publisher.com"
        )
        await session.commit()
    stub_inspection({url: _result(url, _LISTICLE)})

    await inspect_source_pages(session_factory, await _task(scenario))

    async with session_factory() as session:
        page = await session.scalar(
            select(SourcePage).where(SourcePage.project_id == scenario.project_id)
        )
        assert page is not None
        assert page.inspection_state == INSPECTION_INSPECTED
        assert page.latest_snapshot_id is not None
        assert page.content_hash

        presences = {
            row.entity_name: row.presence
            for row in (
                await session.scalars(
                    select(SourcePageEntityPresence).where(
                        SourcePageEntityPresence.source_page_id == page.id
                    )
                )
            ).all()
        }
        assert presences["Acme Corp"] == PRESENCE_PRESENT

        queued = list(
            (
                await session.scalars(
                    select(AnalyticsTask.task_kind).where(
                        AnalyticsTask.project_id == scenario.project_id
                    )
                )
            ).all()
        )
        assert ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH in queued


async def test_an_absent_brand_is_recorded_against_a_readable_page(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    url = "https://publisher.com/no-acme"
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _freeze_roster(session, scenario)
        await _seed_citation(
            session, scenario, url=url, url_hash="b" * 64, domain="publisher.com"
        )
        await session.commit()
    stub_inspection({url: _result(url, _WITHOUT_BRAND)})

    await inspect_source_pages(session_factory, await _task(scenario))

    async with session_factory() as session:
        brand = await session.scalar(
            select(SourcePageEntityPresence).where(
                SourcePageEntityPresence.project_id == scenario.project_id,
                SourcePageEntityPresence.entity_kind == "brand",
            )
        )
        assert brand is not None
        assert brand.presence == PRESENCE_NOT_DETECTED
        assert brand.roster_version.startswith("roster-")


async def test_one_unreachable_publisher_never_discards_the_others(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    good = "https://publisher.com/reachable"
    bad = "https://broken.com/unreachable"
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _freeze_roster(session, scenario)
        await _seed_citation(
            session, scenario, url=good, url_hash="c" * 64, domain="publisher.com"
        )
        await _seed_citation(
            session, scenario, url=bad, url_hash="d" * 64, domain="broken.com"
        )
        await session.commit()
    stub_inspection({good: _result(good, _LISTICLE)})

    await inspect_source_pages(session_factory, await _task(scenario))

    async with session_factory() as session:
        states = {
            page.canonical_url: page.inspection_state
            for page in (
                await session.scalars(
                    select(SourcePage).where(
                        SourcePage.project_id == scenario.project_id
                    )
                )
            ).all()
        }
        assert states[good] == INSPECTION_INSPECTED
        assert states[bad] == INSPECTION_FAILED
        # The failure is evidence about that page, not a gap in the record.
        snapshots = list(
            (
                await session.scalars(
                    select(SourcePageSnapshot).where(
                        SourcePageSnapshot.project_id == scenario.project_id
                    )
                )
            ).all()
        )
        assert len(snapshots) == 2


async def test_a_robots_disallowed_page_is_blocked_and_never_judged(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    """A wall is a visible state, not a silent skip and not an absence."""
    url = "https://publisher.com/private"
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _freeze_roster(session, scenario)
        await _seed_citation(
            session, scenario, url=url, url_hash="e" * 64, domain="publisher.com"
        )
        await session.commit()
    fetcher = stub_inspection({url: _result(url, _LISTICLE)}, robots=_DenyAllRobots())

    await inspect_source_pages(session_factory, await _task(scenario))

    async with session_factory() as session:
        page = await session.scalar(
            select(SourcePage).where(SourcePage.project_id == scenario.project_id)
        )
        assert page is not None
        assert page.inspection_state == INSPECTION_BLOCKED
        assert page.inspection_reason == "robots_disallowed"
        presences = list(
            (
                await session.scalars(
                    select(SourcePageEntityPresence).where(
                        SourcePageEntityPresence.source_page_id == page.id
                    )
                )
            ).all()
        )
        assert presences == []
    assert fetcher.requested == []


async def test_a_non_html_response_is_a_failure_not_an_absence(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    url = "https://publisher.com/report.pdf"
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _freeze_roster(session, scenario)
        await _seed_citation(
            session, scenario, url=url, url_hash="f" * 64, domain="publisher.com"
        )
        await session.commit()
    pdf = _result(url, b"%PDF-1.4")
    stub_inspection(
        {
            url: FetchResult(
                **{
                    **{
                        field: getattr(pdf, field) for field in pdf.__dataclass_fields__
                    },
                    "content_type": "application/pdf",
                }
            )
        }
    )

    await inspect_source_pages(session_factory, await _task(scenario))

    async with session_factory() as session:
        page = await session.scalar(
            select(SourcePage).where(SourcePage.project_id == scenario.project_id)
        )
        assert page is not None
        assert page.inspection_state == INSPECTION_FAILED
        assert page.inspection_reason == "non_html"


async def test_owned_pages_are_never_treated_as_third_party_sources(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    """Site Health owns the project's own pages; this must not duplicate it."""
    from app.models.analysis import Citation

    url = "https://acme.com/pricing"
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _freeze_roster(session, scenario)
        await _seed_citation(
            session, scenario, url=url, url_hash="1" * 64, domain="acme.com"
        )
        owned = await session.scalar(select(Citation).where(Citation.url == url))
        assert owned is not None
        owned.is_owned = True
        await session.commit()
    stub_inspection({})

    await inspect_source_pages(session_factory, await _task(scenario))

    async with session_factory() as session:
        pages = list(
            (
                await session.scalars(
                    select(SourcePage).where(
                        SourcePage.project_id == scenario.project_id
                    )
                )
            ).all()
        )
        assert pages == []


async def test_a_missing_audit_fails_loudly_rather_than_silently(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await session.commit()
    stub_inspection({})
    task = AnalyticsTask(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        task_kind=ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION,
        payload={"audit_id": str(uuid.uuid4())},
        idempotency_key=f"inspect:{uuid.uuid4()}",
    )

    with pytest.raises(ValueError, match="audit is unavailable"):
        await inspect_source_pages(session_factory, task)


async def test_the_snapshot_never_retains_the_page_text(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    """Passages are what a reader sees; the page itself is not republished."""
    url = "https://publisher.com/keep-nothing"
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _freeze_roster(session, scenario)
        await _seed_citation(
            session, scenario, url=url, url_hash="2" * 64, domain="publisher.com"
        )
        await session.commit()
    stub_inspection({url: _result(url, _LISTICLE)})

    await inspect_source_pages(session_factory, await _task(scenario))

    async with session_factory() as session:
        snapshot = await session.scalar(
            select(SourcePageSnapshot).where(
                SourcePageSnapshot.project_id == scenario.project_id
            )
        )
        assert snapshot is not None
        assert snapshot.extracted_chars > 0
        assert "text" not in (snapshot.page_facts or {})
        assert "Evaluating a platform takes time." * 5 not in str(snapshot.page_facts)
        assert snapshot.fetched_at <= datetime.now(UTC)


async def test_reinspecting_the_same_audit_does_not_inflate_recurrence(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    """The inventory syncs twice per run; rank must not double for that."""
    url = "https://publisher.com/counted-once"
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _freeze_roster(session, scenario)
        await _seed_citation(
            session, scenario, url=url, url_hash="3" * 64, domain="publisher.com"
        )
        await session.commit()
    stub_inspection({url: _result(url, _LISTICLE)})

    await inspect_source_pages(session_factory, await _task(scenario))

    async with session_factory() as session:
        page = await session.scalar(
            select(SourcePage).where(SourcePage.project_id == scenario.project_id)
        )
        assert page is not None
        assert page.recurrence_count == 1


async def test_a_terminal_failure_still_hands_off_to_opportunities(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    """Terminalization queues this INSTEAD of the refresh, so it owes one.

    Recomputing without page evidence is what the product did before this
    feature; not recomputing at all would leave the audit's opportunities
    permanently stale.
    """
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await session.commit()
    stub_inspection({})
    task = AnalyticsTask(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        task_kind=ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION,
        payload={"audit_id": str(uuid.uuid4())},
        idempotency_key=f"inspect:{uuid.uuid4()}",
        attempt_count=3,
        max_attempts=3,
    )

    with pytest.raises(ValueError, match="audit is unavailable"):
        await inspect_source_pages(session_factory, task)

    async with session_factory() as session:
        queued = list(
            (
                await session.scalars(
                    select(AnalyticsTask.task_kind).where(
                        AnalyticsTask.project_id == scenario.project_id
                    )
                )
            ).all()
        )
        assert ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH in queued


async def test_a_retryable_failure_waits_rather_than_handing_off_early(
    session_factory: async_sessionmaker[AsyncSession],
    stub_inspection,
) -> None:
    """Handing off on attempt one would spend the idempotency key too soon."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await session.commit()
    stub_inspection({})
    task = AnalyticsTask(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        task_kind=ANALYTICS_TASK_KIND_SOURCE_PAGE_INSPECTION,
        payload={"audit_id": str(uuid.uuid4())},
        idempotency_key=f"inspect:{uuid.uuid4()}",
        attempt_count=1,
        max_attempts=3,
    )

    with pytest.raises(ValueError):
        await inspect_source_pages(session_factory, task)

    async with session_factory() as session:
        queued = list(
            (
                await session.scalars(
                    select(AnalyticsTask.task_kind).where(
                        AnalyticsTask.project_id == scenario.project_id
                    )
                )
            ).all()
        )
        assert ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH not in queued
