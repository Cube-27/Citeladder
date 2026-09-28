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

from app.core.config.actions import TARGET_EARNED_PAGE
from app.core.config.earned_actions import RULE_EARNED_PAGE_ACQUIRE
from app.core.config.placement import (
    PLACEMENT_CHANGE_BRAND_LISTED,
    PLACEMENT_CHECKER_VERSION,
    PLACEMENT_REASON_COVERAGE,
    PLACEMENT_REASON_ROSTER_CHANGED,
    PLACEMENT_RECHECK_AFTER_HOURS,
    PLACEMENT_STATE_PENDING,
    PLACEMENT_STATE_SATISFIED,
    PLACEMENT_STATE_UNAVAILABLE,
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
from app.domain.source_pages.admission import claim_pages
from app.models.opportunity import (
    Opportunity,
    OpportunityImplementationEvent,
    OpportunitySnapshot,
)
from app.models.source_pages import (
    PlacementCheck,
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)
from tests.component.opportunity_helpers import (
    Scenario,
    _seed_scenario,
    seed_action_for,
    seed_live_set,
)

pytestmark = pytest.mark.asyncio

_EMAIL = "placement-checks@example.com"
_PAGE_URL = "https://review.example/best-crm-tools"
_HASH = "b" * 64
_ROSTER = "roster-fixed"
# Past the configured recheck delay, so a freshly declared check is due.
_DUE = datetime.now(UTC) + timedelta(hours=PLACEMENT_RECHECK_AFTER_HOURS + 1)


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
        await seed_live_set(session, scenario)
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
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    scenario: Scenario,
    opportunity: Opportunity,
    *,
    key: str,
) -> dict:
    async with session_factory() as session:
        action_id = await seed_action_for(
            session, opportunity, target_kind=TARGET_EARNED_PAGE
        )
    # TypeScript owns declaration admission; these tests exercise only the
    # Python inspector against its persisted input contract.
    async with session_factory() as session:
        snapshot = await session.scalar(
            select(OpportunitySnapshot)
            .where(OpportunitySnapshot.project_id == scenario.project_id)
            .order_by(OpportunitySnapshot.created_at.desc())
            .limit(1)
        )
        page = await session.scalar(
            select(SourcePage).where(
                SourcePage.project_id == scenario.project_id,
                SourcePage.url_hash == _HASH,
            )
        )
        handoff = opportunity.evidence["content_handoff"]
        now = datetime.now(UTC)
        declaration = OpportunityImplementationEvent(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            action_id=action_id,
            actor_user_id=scenario.user_id,
            opportunity_snapshot_id=snapshot.id,
            member_opportunity_ids=[str(opportunity.id)],
            target_site_url_ids=[],
            target_external_url=_PAGE_URL,
            declared_implemented_at=now,
            expected_checks=[
                {"kind": "placement", "expected_change": PLACEMENT_CHANGE_BRAND_LISTED}
            ],
            idempotency_key=key,
            request_fingerprint=key,
        )
        session.add(declaration)
        await session.flush()
        session.add(
            PlacementCheck(
                workspace_id=scenario.workspace_id,
                project_id=scenario.project_id,
                implementation_event_id=declaration.id,
                source_page_id=page.id,
                opportunity_stable_key=opportunity.target_key,
                rule_id=opportunity.rule_id,
                url_hash=_HASH,
                expected_change=PLACEMENT_CHANGE_BRAND_LISTED,
                expected_detail={
                    "brand_name": "Acme Corp",
                    "owned_domains": ["acme.test"],
                    "discrepancies": [],
                    "deterioration": [],
                },
                baseline_snapshot_id=uuid.UUID(handoff["snapshot_id"]),
                baseline_roster_version=_ROSTER,
                state=PLACEMENT_STATE_PENDING,
                due_at=now + timedelta(hours=PLACEMENT_RECHECK_AFTER_HOURS),
                declared_at=now,
                checker_version=PLACEMENT_CHECKER_VERSION,
            )
        )
        await session.commit()
        return {"id": str(declaration.id)}


async def _settle(
    session_factory: async_sessionmaker[AsyncSession], scenario: Scenario
) -> int:
    """Evaluate once the check is DUE.

    A check is not judged inside its waiting window: reading the page the hour
    after somebody declared the work and recording "not there" reports a slow
    editor as a false declaration.
    """
    async with session_factory() as session:
        observed = await evaluate_placement_checks(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            now=_DUE,
        )
        await session.commit()
    return observed


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


async def test_a_page_nobody_reread_is_not_a_failed_placement(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, opportunity, _page, _baseline = await _seed(client, session_factory)
    await _declare(client, session_factory, scenario, opportunity, key="declare-unread")

    observed = await _settle(session_factory, scenario)

    check = await _check(session_factory, scenario)
    assert observed == 0
    assert check.state == PLACEMENT_STATE_PENDING
    assert check.observed_at is None


async def test_a_listing_that_went_live_settles_the_check(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    scenario, opportunity, page, _baseline = await _seed(client, session_factory)
    await _declare(client, session_factory, scenario, opportunity, key="declare-live")

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
    observed = await _settle(session_factory, scenario)

    check = await _check(session_factory, scenario)
    assert observed == 1
    assert check.state == PLACEMENT_STATE_SATISFIED
    assert check.observation_snapshot_id is not None
    # Settled checks stop competing for the inspection budget.
    assert check.due_at is None


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
    await _declare(client, session_factory, scenario, opportunity, key="declare-due")

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
    await _declare(client, session_factory, scenario, opportunity, key="declare-unmet")

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
    await _settle(session_factory, scenario)

    check = await _check(session_factory, scenario)
    assert check.state == PLACEMENT_STATE_UNMET
    assert check.attempts == 1
    # Still due: a publisher does not act the day somebody emails them, and a
    # first empty reading is an observation rather than a contradiction.
    assert check.due_at is not None


async def _thin_snapshot(
    session_factory: async_sessionmaker[AsyncSession], scenario: Scenario, page_id
) -> None:
    """A reading that saw the page but barely any of its text."""
    async with session_factory() as session:
        fresh = await session.get(SourcePage, page_id)
        assert fresh is not None
        snapshot = await _snapshot(
            session,
            scenario,
            fresh,
            fetched_at=datetime.now(UTC) + timedelta(minutes=5),
            brand_present=False,
        )
        snapshot.extracted_chars = 40
        await session.commit()


async def test_a_reading_too_thin_to_judge_is_asked_again(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Some unavailable answers are properties of the READING, not the check.

    A page whose text barely extracted says nothing about whether the
    placement went live, and the next reading may say plenty. Clearing the
    schedule on it abandoned the declaration's verification for good on the
    strength of one bad fetch.
    """
    scenario, opportunity, page, _baseline = await _seed(client, session_factory)
    await _declare(client, session_factory, scenario, opportunity, key="declare-thin")
    await _thin_snapshot(session_factory, scenario, page.id)

    await _settle(session_factory, scenario)

    check = await _check(session_factory, scenario)
    assert check.state == PLACEMENT_STATE_UNAVAILABLE
    assert check.state_reason == PLACEMENT_REASON_COVERAGE
    # Still scheduled, and still claimable, so a later reading can settle it.
    assert check.due_at is not None
    async with session_factory() as session:
        due = await due_placement_page_ids(
            session, project_id=scenario.project_id, now=_DUE + timedelta(days=30)
        )
    assert due == {page.id}


async def test_an_answer_no_rereading_can_change_stops_asking(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A roster change is a property of the CHECK. Re-reading cannot fix it."""
    scenario, opportunity, page, _baseline = await _seed(client, session_factory)
    await _declare(client, session_factory, scenario, opportunity, key="declare-roster")
    async with session_factory() as session:
        row = await session.scalar(
            select(PlacementCheck).where(
                PlacementCheck.project_id == scenario.project_id
            )
        )
        assert row is not None
        row.baseline_roster_version = "roster-from-another-era"
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

    await _settle(session_factory, scenario)

    check = await _check(session_factory, scenario)
    assert check.state == PLACEMENT_STATE_UNAVAILABLE
    assert check.state_reason == PLACEMENT_REASON_ROSTER_CHANGED
    assert check.due_at is None
