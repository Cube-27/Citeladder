"""From an inspected publisher page to a ranked Opportunity row.

The whole loop, because the two ends have disagreed before. PR 1 could read a
page and record who was on it; recompute could not see any of it, and the
earned card a user saw was still inferred from a domain name.

What is asserted here and nowhere else: the detector runs over the FULL
eligible answer set. ``build_source_projection`` filters to prompts already
classified as brand-absence gaps, and while that filter was the only path to
an earned task, a page where the brand is present and merely losing ground
could not produce one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.earned_actions import (
    RULE_EARNED_PAGE_ACQUIRE,
    RULE_EARNED_PAGE_DEFEND,
    RULE_EARNED_PAGE_RESEARCH,
)
from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    ENTITY_KIND_COMPETITOR,
    INSPECTION_INSPECTED,
    PAGE_FORMAT_LISTICLE,
    PRESENCE_MATCH_EXACT_ALIAS,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PRESENT,
    SOURCE_PAGE_PRESENCE_VERSION,
)
from app.domain.opportunities.recompute import recompute
from app.domain.source_pages.persistence import OUTCOME_INSPECTED
from app.domain.source_pages.roster import project_roster
from app.models.analysis import Citation
from app.models.audit import Audit
from app.models.opportunity import Opportunity
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)
from tests.component.opportunity_helpers import Scenario, _seed_scenario

pytestmark = pytest.mark.asyncio

_URL = "https://publisher.test/best-crm-tools"
_URL_HASH = "e" * 64
_ROSTER = {
    "brand_name": "Acme Corp",
    "brand_aliases": ["Acme"],
    "competitors": [{"name": "Globex", "aliases": ["Globex"], "domains": []}],
}


async def _seed_cited_page(
    session: AsyncSession,
    scenario: Scenario,
    *,
    brand_present: bool,
    headings: list[str],
    outbound: list[str],
    requested: bool = False,
) -> SourcePage:
    audit = await session.get(Audit, scenario.audit_id)
    assert audit is not None
    audit.configuration = {**(audit.configuration or {}), **_ROSTER}

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
            analysis_id=analysis_id or scenario.analysis0_id,
            artifact_id=artifact_id,
            analyzer_version="test",
            ordinal=42,
            url=_URL,
            title="Best CRM tools",
            domain="publisher.test",
            classification="third_party",
            is_owned=False,
            canonical_url=_URL,
            url_hash=_URL_HASH,
            url_identity_method="verbatim",
            url_identity_version="citation-identity-1",
        )
    )
    page = SourcePage(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        url_hash=_URL_HASH,
        canonical_url=_URL,
        registrable_domain="publisher.test",
        source_class="review_marketplace",
        page_format=PAGE_FORMAT_LISTICLE,
        page_format_method="heading_evidence",
        inspection_state=INSPECTION_INSPECTED,
        recurrence_count=4,
        last_inspected_at=datetime.now(UTC),
        inspection_requested_at=datetime.now(UTC) if requested else None,
    )
    session.add(page)
    await session.flush()
    snapshot = await _add_snapshot(
        session,
        scenario,
        page,
        brand_present=brand_present,
        headings=headings,
        outbound=outbound,
        content_hash="hash-now",
        fetched_at=datetime.now(UTC),
    )
    page.latest_snapshot_id = snapshot.id
    await session.flush()
    return page


async def _add_snapshot(
    session: AsyncSession,
    scenario: Scenario,
    page: SourcePage,
    *,
    brand_present: bool,
    headings: list[str],
    outbound: list[str],
    content_hash: str,
    fetched_at: datetime,
    roster: str | None = None,
) -> SourcePageSnapshot:
    snapshot = SourcePageSnapshot(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
        source_page_id=page.id,
        audit_id=scenario.audit_id,
        requested_url=_URL,
        final_url=_URL,
        status_code=200,
        content_type="text/html",
        extracted_chars=4200,
        content_hash=content_hash,
        page_facts={
            "title": "Best CRM tools",
            "headings": headings,
            "outbound_domains": outbound,
            "parsed": True,
        },
        evidence_passages=[
            {"text": "Globex leads the category.", "char_start": 0, "char_end": 26},
            {
                "text": "Acme Corp is a customer platform.",
                "char_start": 30,
                "char_end": 63,
            },
        ],
        outcome=OUTCOME_INSPECTED,
        fetched_at=fetched_at,
    )
    session.add(snapshot)
    await session.flush()
    roster = roster or project_roster(_ROSTER)
    session.add(
        SourcePageEntityPresence(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            source_page_id=page.id,
            snapshot_id=snapshot.id,
            entity_kind=ENTITY_KIND_COMPETITOR,
            entity_name="Globex",
            presence=PRESENCE_PRESENT,
            match_method=PRESENCE_MATCH_EXACT_ALIAS,
            match_count=3,
            passage_refs=[0],
            roster_version=roster,
            detector_version=SOURCE_PAGE_PRESENCE_VERSION,
        )
    )
    session.add(
        SourcePageEntityPresence(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            source_page_id=page.id,
            snapshot_id=snapshot.id,
            entity_kind=ENTITY_KIND_BRAND,
            entity_name="Acme Corp",
            presence=PRESENCE_PRESENT if brand_present else PRESENCE_NOT_DETECTED,
            match_method=PRESENCE_MATCH_EXACT_ALIAS,
            match_count=2 if brand_present else 0,
            passage_refs=[1] if brand_present else None,
            roster_version=roster,
            detector_version=SOURCE_PAGE_PRESENCE_VERSION,
        )
    )
    await session.flush()
    return snapshot


async def _earned_rows(
    session_factory: async_sessionmaker[AsyncSession], scenario: Scenario
) -> list[Opportunity]:
    async with session_factory() as session:
        rows = list(
            (
                await session.scalars(
                    select(Opportunity).where(
                        Opportunity.project_id == scenario.project_id,
                        Opportunity.superseded_at.is_(None),
                        Opportunity.rule_id.like("earned_page_%"),
                    )
                )
            ).all()
        )
        for row in rows:
            session.expunge(row)
        return rows


async def _recompute(
    session_factory: async_sessionmaker[AsyncSession], scenario: Scenario
) -> None:
    async with session_factory() as session:
        await recompute(
            session,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            audit_id=scenario.audit_id,
        )


async def test_recompute_turns_page_evidence_into_a_ranked_row(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _seed_cited_page(
            session,
            scenario,
            brand_present=False,
            headings=["Globex", "Initech"],
            outbound=["globex.test"],
        )
        await session.commit()

    await _recompute(session_factory, scenario)
    rows = await _earned_rows(session_factory, scenario)

    assert [row.rule_id for row in rows] == [RULE_EARNED_PAGE_ACQUIRE]
    row = rows[0]
    assert row.target_key == f"earned-page:{_URL_HASH}"
    assert row.target_url == _URL
    handoff = row.evidence["content_handoff"]
    assert handoff["observed_competitors"] == ["Globex"]
    assert handoff["suggested_skill_id"] == "listicle"
    assert handoff["snapshot_id"]
    assert row.evidence["priority_factors"]["page_competitor_presence_factor"] > 1.0


async def test_a_deteriorating_placement_is_reachable_without_a_gap_prompt(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The case the gap-prompt filter made structurally invisible.

    The brand IS present on the answers' side, so no brand-absence gap
    classifies these prompts; only reading the full answer set surfaces the
    page whose placement moved.
    """
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        page = await _seed_cited_page(
            session,
            scenario,
            brand_present=False,
            headings=["Globex", "Initech"],
            outbound=["globex.test"],
        )
        await _add_snapshot(
            session,
            scenario,
            page,
            brand_present=True,
            headings=["Acme Corp", "Globex"],
            outbound=["acme.com", "globex.test"],
            content_hash="hash-before",
            fetched_at=datetime.now(UTC) - timedelta(days=30),
        )
        await session.commit()

    await _recompute(session_factory, scenario)
    rows = await _earned_rows(session_factory, scenario)

    assert [row.rule_id for row in rows] == [RULE_EARNED_PAGE_DEFEND]
    assert "brand_removed" in rows[0].evidence["content_handoff"]["deterioration"]


async def test_a_prior_snapshot_judged_on_another_roster_is_not_compared(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """An alias somebody removed is not a placement the publisher took down.

    Same evidence as the defence case above, except the earlier snapshot was
    judged against a different roster. It is dropped rather than compared, so
    this falls back to the ordinary acquisition.
    """
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        page = await _seed_cited_page(
            session,
            scenario,
            brand_present=False,
            headings=["Globex", "Initech"],
            outbound=["globex.test"],
        )
        await _add_snapshot(
            session,
            scenario,
            page,
            brand_present=True,
            headings=["Acme Corp", "Globex"],
            outbound=["acme.com", "globex.test"],
            content_hash="hash-before",
            fetched_at=datetime.now(UTC) - timedelta(days=30),
            roster="roster-from-an-older-alias-set",
        )
        await session.commit()

    await _recompute(session_factory, scenario)
    rows = await _earned_rows(session_factory, scenario)

    assert [row.rule_id for row in rows] == [RULE_EARNED_PAGE_ACQUIRE]


async def test_a_page_nobody_read_is_never_reported_as_an_absence(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        page = await _seed_cited_page(
            session,
            scenario,
            brand_present=False,
            headings=["Globex"],
            outbound=["globex.test"],
            requested=True,
        )
        # Wind the page back to never-inspected, keeping the explicit ask.
        page.inspection_state = "not_inspected"
        page.latest_snapshot_id = None
        page.last_inspected_at = None
        await session.execute(
            SourcePageEntityPresence.__table__.delete().where(
                SourcePageEntityPresence.source_page_id == page.id
            )
        )
        await session.execute(
            SourcePageSnapshot.__table__.delete().where(
                SourcePageSnapshot.source_page_id == page.id
            )
        )
        await session.commit()

    await _recompute(session_factory, scenario)
    rows = await _earned_rows(session_factory, scenario)

    assert [row.rule_id for row in rows] == [RULE_EARNED_PAGE_RESEARCH]
    handoff = rows[0].evidence["content_handoff"]
    assert "not_inspected" in handoff["unmet_qualification"]
    assert handoff["requested"] is True


async def test_a_human_status_survives_recomputing_the_same_evidence(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """The lost-status defect, on the key that replaced the domain key."""
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _seed_cited_page(
            session,
            scenario,
            brand_present=False,
            headings=["Globex", "Initech"],
            outbound=["globex.test"],
        )
        await session.commit()

    await _recompute(session_factory, scenario)
    first = (await _earned_rows(session_factory, scenario))[0]
    async with session_factory() as session:
        row = await session.get(Opportunity, first.id)
        assert row is not None
        row.status = "in_progress"
        await session.commit()

    await _recompute(session_factory, scenario)
    rows = await _earned_rows(session_factory, scenario)

    assert len(rows) == 1
    assert rows[0].status == "in_progress"
    assert rows[0].id != first.id


async def test_the_page_format_never_promotes_the_publisher_class(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _seed_cited_page(
            session,
            scenario,
            brand_present=False,
            headings=["Globex", "Initech"],
            outbound=["globex.test"],
        )
        await session.commit()

    await _recompute(session_factory, scenario)
    handoff = (await _earned_rows(session_factory, scenario))[0].evidence[
        "content_handoff"
    ]

    assert handoff["page_format"] == PAGE_FORMAT_LISTICLE
    assert handoff["source_class"] == "review_marketplace"

    async with session_factory() as session:
        page = await session.scalar(
            select(SourcePage).where(SourcePage.url_hash == _URL_HASH)
        )
        assert page is not None
        assert page.source_class == "review_marketplace"


async def test_a_page_in_one_project_is_invisible_to_another(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        scenario = await _seed_scenario(session)
        await _seed_cited_page(
            session,
            scenario,
            brand_present=False,
            headings=["Globex", "Initech"],
            outbound=["globex.test"],
        )
        neighbour = await _seed_scenario(session)
        await session.commit()

    await _recompute(session_factory, neighbour)

    assert await _earned_rows(session_factory, neighbour) == []
    assert uuid.UUID(str(neighbour.project_id)) != scenario.project_id
