"""Confirming a placement on somebody else's page, end to end.

A declaration against an earned rule says a change was made to a page this
product does not own. Nothing about the project's visibility score answers
whether that happened, so this path exists: freeze the reading the declaration
was made against, read the page again later, and compare the two for the
SPECIFIC change that was declared.

What these defend:
  - an earned declaration gets a placement check, not the project score;
  - a page nobody has re-read reports as such and never as a failed placement;
  - "placement live" and "visibility moved" arrive as two observations, in two
    places in the result, free to disagree;
  - a due recheck makes its page claimable and pays the same budget unit.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION
from app.core.config.earned_actions import RULE_EARNED_PAGE_ACQUIRE
from app.core.config.placement import (
    PLACEMENT_CHANGE_BRAND_LISTED,
    PLACEMENT_STATE_PENDING,
    PLACEMENT_STATE_SATISFIED,
    PLACEMENT_STATE_UNMET,
)
from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    ENTITY_KIND_COMPETITOR,
    INSPECTION_INSPECTED,
    PRESENCE_MATCH_EXACT_ALIAS,
    PRESENCE_MATCH_NONE,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PRESENT,
)
from app.domain.opportunities.placement_checks import (
    due_placement_page_ids,
    evaluate_placement_checks,
)
from app.domain.opportunities.verification import (
    TRIGGER_SOURCE_PAGE,
    verify_implementation_events,
)
from app.domain.opportunities.verification_result import build_verification_result
from app.domain.source_pages.admission import claim_pages
from app.models.analytics import AnalyticsTask
from app.models.opportunity import (
    Opportunity,
    OpportunityImplementationEvent,
    OpportunitySnapshot,
    OpportunityVerificationEvent,
)
from app.models.source_pages import (
    PlacementCheck,
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)
from tests.component.opportunity_helpers import Scenario, _seed_scenario

pytestmark = pytest.mark.asyncio

_EMAIL = "placement-checks@example.com"
_PAGE_URL = "https://review.example/best-crm-tools"
_HASH = "b" * 64
_ROSTER = "roster-fixed"


async def _snapshot(
    session: AsyncSession,
    scenario: Scenario,
    page: SourcePage,
    *,
    fetched_at: datetime,
    brand_present: bool,
    brand_matches: int = 0,
) -> SourcePageSnapshot:
    """One successful reading of the page, with its brand and rival verdicts."""
    snapshot = SourcePageSnapshot(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        source_page_id=page.id,
        requested_url=_PAGE_URL,
        final_url=_PAGE_URL,
        outcome="inspected",
        extracted_chars=5_000,
        page_facts={"title": "Best CRM tools", "headings": ["1. Globex"]},
        evidence_passages=[{"text": "Globex leads the field.", "char_start": 0}],
        fetched_at=fetched_at,
    )
    session.add(snapshot)
    await session.flush()
    session.add_all(
        [
            SourcePageEntityPresence(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                source_page_id=page.id,
                snapshot_id=snapshot.id,
                entity_kind=ENTITY_KIND_BRAND,
                entity_name="Acme Corp",
                presence=PRESENCE_PRESENT if brand_present else PRESENCE_NOT_DETECTED,
                match_method=PRESENCE_MATCH_EXACT_ALIAS
                if brand_present
                else PRESENCE_MATCH_NONE,
                match_count=brand_matches,
                roster_version=_ROSTER,
            ),
            SourcePageEntityPresence(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                source_page_id=page.id,
                snapshot_id=snapshot.id,
                entity_kind=ENTITY_KIND_COMPETITOR,
                entity_name="Globex",
                presence=PRESENCE_PRESENT,
                match_method=PRESENCE_MATCH_EXACT_ALIAS,
                match_count=2,
                passage_refs=[0],
                roster_version=_ROSTER,
            ),
        ]
    )
    page.latest_snapshot_id = snapshot.id
    page.last_inspected_at = fetched_at
    return snapshot


async def _seed(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[Scenario, Opportunity, SourcePage, SourcePageSnapshot]:
    """A project with one cited page, one reading of it, and one earned task."""
    from tests.component.auth_helpers import grant_test_capabilities, register_and_login

    await register_and_login(client, _EMAIL)
    await grant_test_capabilities(_EMAIL)
    async with session_factory() as session:
        scenario = await _seed_scenario(session, email=_EMAIL)
    await client.post(
        f"/api/v1/projects/{scenario.project_id}/opportunities/recompute",
        headers={"X-Workspace-Id": str(scenario.workspace_id)},
    )
    async with session_factory() as session:
        page = SourcePage(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            url_hash=_HASH,
            canonical_url=_PAGE_URL,
            registrable_domain="review.example",
            source_class="review_marketplace",
            page_format="listicle",
            inspection_state=INSPECTION_INSPECTED,
            recurrence_count=5,
        )
        session.add(page)
        await session.flush()
        baseline = await _snapshot(
            session,
            scenario,
            page,
            fetched_at=datetime.now(UTC) - timedelta(days=2),
            brand_present=False,
        )
        snapshot = await session.scalar(
            select(OpportunitySnapshot)
            .where(OpportunitySnapshot.project_id == scenario.project_id)
            .order_by(OpportunitySnapshot.created_at.desc())
            .limit(1)
        )
        assert snapshot is not None
        opportunity = Opportunity(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            rule_id=RULE_EARNED_PAGE_ACQUIRE,
            opportunity_type="visibility",
            severity="high",
            priority_score=30.0,
            title="Competitors listed on a cited page you are absent from",
            remediation="Ask the publisher to include you.",
            target_key=f"earned-page:{_HASH}",
            target_url=_PAGE_URL,
            evidence={
                "content_handoff": {
                    "url_hash": _HASH,
                    "snapshot_id": str(baseline.id),
                    "page_entities": [
                        {
                            "entity_kind": ENTITY_KIND_BRAND,
                            "entity_name": "Acme Corp",
                            "presence": PRESENCE_NOT_DETECTED,
                            "match_method": PRESENCE_MATCH_NONE,
                            "match_count": 0,
                            "passages": [],
                        }
                    ],
                }
            },
            source_analysis_ids=[],
            source_issue_ids=[],
            source_metric_ids=[],
            analyzer_version="opp-analyzer-2",
            rule_version="opp-rules-2",
            formula_version="opp-formula-2",
        )
        session.add(opportunity)
        await session.commit()
        session.expunge_all()
    return scenario, opportunity, page, baseline


async def _declare(
    client: httpx.AsyncClient, scenario: Scenario, opportunity: Opportunity, *, key: str
) -> dict:
    response = await client.post(
        f"/api/v1/projects/{scenario.project_id}/opportunities/implementation-events",
        headers={
            "X-Workspace-Id": str(scenario.workspace_id),
            "Idempotency-Key": key,
        },
        json={
            "opportunity_id": str(opportunity.id),
            "target_site_url_ids": [],
            "declared_implemented_at": datetime.now(UTC).isoformat(),
            "expected_checks": [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _check(
    session_factory: async_sessionmaker[AsyncSession], scenario: Scenario
) -> PlacementCheck:
    async with session_factory() as session:
        row = await session.scalar(
            select(PlacementCheck).where(
                PlacementCheck.project_id == scenario.project_id
            )
        )
        assert row is not None
        session.expunge(row)
    return row


async def test_a_declaration_opens_a_check_anchored_on_that_declaration(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, opportunity, page, baseline = await _seed(client, session_factory)

    body = await _declare(client, scenario, opportunity, key="declare-once")
    check = await _check(session_factory, scenario)

    # The anchor is the implementation event. The same page and action can be
    # attempted twice, and a check has to know which attempt it verifies.
    assert check.implementation_event_id == uuid.UUID(body["id"])
    assert check.expected_change == PLACEMENT_CHANGE_BRAND_LISTED
    assert check.source_page_id == page.id
    assert check.baseline_snapshot_id == baseline.id
    assert check.baseline_roster_version == _ROSTER
    # Carried for navigation across recompute, never as the anchor.
    assert RULE_EARNED_PAGE_ACQUIRE in check.opportunity_stable_key
    assert check.state == PLACEMENT_STATE_PENDING


async def test_a_page_nobody_reread_is_not_a_failed_placement(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, opportunity, _page, _baseline = await _seed(client, session_factory)
    await _declare(client, scenario, opportunity, key="declare-unread")

    async with session_factory() as session:
        observed = await evaluate_placement_checks(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )
        await session.commit()

    check = await _check(session_factory, scenario)
    assert observed == 0
    assert check.state == PLACEMENT_STATE_PENDING
    assert check.observed_at is None


async def test_a_listing_that_went_live_settles_the_check(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, opportunity, page, _baseline = await _seed(client, session_factory)
    await _declare(client, scenario, opportunity, key="declare-live")

    async with session_factory() as session:
        fresh = await session.get(SourcePage, page.id)
        assert fresh is not None
        await _snapshot(
            session,
            scenario,
            fresh,
            fetched_at=datetime.now(UTC) + timedelta(minutes=5),
            brand_present=True,
            brand_matches=3,
        )
        await session.commit()
    async with session_factory() as session:
        observed = await evaluate_placement_checks(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )
        await session.commit()

    check = await _check(session_factory, scenario)
    assert observed == 1
    assert check.state == PLACEMENT_STATE_SATISFIED
    assert check.observation_snapshot_id is not None
    # Settled checks stop competing for the inspection budget.
    assert check.due_at is None


async def test_placement_and_visibility_are_reported_as_two_observations(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The defect being prevented is reporting them as one.

    A listing can go live while the score sits still, and the score can move
    for reasons nothing to do with it. Folding placement into the visibility
    leg would make one of those disagreements invisible.
    """
    scenario, opportunity, page, _baseline = await _seed(client, session_factory)
    await _declare(client, scenario, opportunity, key="declare-report")
    async with session_factory() as session:
        fresh = await session.get(SourcePage, page.id)
        assert fresh is not None
        await _snapshot(
            session,
            scenario,
            fresh,
            fetched_at=datetime.now(UTC) + timedelta(minutes=5),
            brand_present=True,
            brand_matches=3,
        )
        await session.commit()
    async with session_factory() as session:
        await evaluate_placement_checks(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )
        await session.commit()

    async with session_factory() as session:
        declaration = await session.scalar(
            select(OpportunityImplementationEvent).where(
                OpportunityImplementationEvent.project_id == scenario.project_id
            )
        )
        assert declaration is not None
        result = await build_verification_result(
            session, declaration=declaration, post_audit_id=None
        )

    assert result["placement"]["state"] == "live"
    # Beside the legs, not inside them.
    assert "placement" not in result["legs"]
    assert set(result["legs"]) == {
        "visibility",
        "ai_referral_traffic",
        "branded_search_demand",
    }


async def test_a_due_recheck_makes_its_page_claimable_and_pays_for_it(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Admission ranks new, then stale, then due placement rechecks.

    A recheck is an inspection like any other: same lock, same budget, same
    spend row. It changes a page's priority here rather than getting its own
    path around the accounting.
    """
    scenario, opportunity, page, _baseline = await _seed(client, session_factory)
    await _declare(client, scenario, opportunity, key="declare-due")

    later = datetime.now(UTC) + timedelta(days=30)
    async with session_factory() as session:
        due = await due_placement_page_ids(
            session, project_id=scenario.project_id, now=later
        )
        claims = await claim_pages(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            now=later,
        )
        await session.commit()

    assert due == {page.id}
    assert page.id in claims


async def test_a_reading_that_found_nothing_keeps_asking_until_it_stops(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, opportunity, page, _baseline = await _seed(client, session_factory)
    await _declare(client, scenario, opportunity, key="declare-unmet")

    async with session_factory() as session:
        fresh = await session.get(SourcePage, page.id)
        assert fresh is not None
        await _snapshot(
            session,
            scenario,
            fresh,
            fetched_at=datetime.now(UTC) + timedelta(minutes=5),
            brand_present=False,
        )
        await session.commit()
    async with session_factory() as session:
        await evaluate_placement_checks(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )
        await session.commit()

    check = await _check(session_factory, scenario)
    assert check.state == PLACEMENT_STATE_UNMET
    assert check.attempts == 1
    # Still due: a publisher does not act the day somebody emails them, and a
    # first empty reading is an observation rather than a contradiction.
    assert check.due_at is not None


async def test_a_settled_check_becomes_a_verification_observation(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The observation reaches the declaration through the ordinary verifier.

    It is triggered by the inspection batch rather than by an audit, because
    an audit cannot see a publisher's page: a verification triggered by one
    records the placement check as unobservable rather than passing it.
    """
    scenario, opportunity, page, _baseline = await _seed(client, session_factory)
    await _declare(client, scenario, opportunity, key="declare-verify")
    async with session_factory() as session:
        fresh = await session.get(SourcePage, page.id)
        assert fresh is not None
        await _snapshot(
            session,
            scenario,
            fresh,
            fetched_at=datetime.now(UTC) + timedelta(minutes=5),
            brand_present=True,
            brand_matches=3,
        )
        await session.commit()
    async with session_factory() as session:
        await evaluate_placement_checks(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )
        await session.commit()

    task = AnalyticsTask(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        task_kind=ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION,
        payload={
            "trigger_kind": TRIGGER_SOURCE_PAGE,
            "trigger_id": str(scenario.audit_id),
        },
        idempotency_key=f"placement-verify:{scenario.project_id}",
        status="queued",
    )
    async with session_factory() as session:
        session.add(task)
        await session.commit()
        session.expunge(task)
    await verify_implementation_events(session_factory, task)

    async with session_factory() as session:
        event = await session.scalar(
            select(OpportunityVerificationEvent).where(
                OpportunityVerificationEvent.project_id == scenario.project_id
            )
        )
        assert event is not None
        assert event.observation_kind == "verified"
        assert event.result["placement"]["state"] == "live"


async def test_an_audit_cannot_observe_a_publishers_page(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """An audit measures answers, not third-party pages.

    Before this, every non-site, non-traffic declaration fell through to "did
    the project score move", so a healthy project verified an earned action it
    had never taken. The check is now unobservable from an audit, and an
    unobservable check verifies nothing.
    """
    scenario, opportunity, _page, _baseline = await _seed(client, session_factory)
    await _declare(client, scenario, opportunity, key="declare-audit")

    task = AnalyticsTask(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        task_kind=ANALYTICS_TASK_KIND_OPPORTUNITY_VERIFICATION,
        payload={"trigger_kind": "audit", "trigger_id": str(scenario.audit_id)},
        idempotency_key=f"audit-verify:{scenario.project_id}",
        status="queued",
    )
    async with session_factory() as session:
        session.add(task)
        await session.commit()
        session.expunge(task)
    await verify_implementation_events(session_factory, task)

    async with session_factory() as session:
        events = list(
            (
                await session.scalars(
                    select(OpportunityVerificationEvent).where(
                        OpportunityVerificationEvent.project_id == scenario.project_id
                    )
                )
            ).all()
        )

    assert events == []
