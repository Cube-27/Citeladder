"""Opening, scheduling and settling one declaration's placement check.

A declaration against an earned rule says a change was made to somebody else's
page. This owner records what that change was, freezes the reading it will be
measured against, and later compares a fresh reading to it.

The anchor is the IMPLEMENTATION EVENT. The same page and the same action can
be attempted more than once, and a check has to know which declaration it
verifies; anchoring on the opportunity would let a second attempt's observation
retroactively describe the first. The opportunity's stable key travels
alongside so a reader can still navigate after a recompute has replaced the
row.

Nothing here decides an outcome. The comparison is
``analysis/opportunities/placement_outcome.py``, which is pure and has no way
to reach a database; this module loads the two readings and records what that
comparison said.
"""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.opportunities.placement_outcome import (
    PlacementExpectation,
    PlacementReading,
    evaluate_placement,
)
from app.core.config.earned_actions import (
    RULE_EARNED_PAGE_ACQUIRE,
    RULE_EARNED_PAGE_CORRECT,
    RULE_EARNED_PAGE_DEFEND,
    RULE_EARNED_PAGE_RESEARCH,
)
from app.core.config.placement import (
    PLACEMENT_CHANGE_BRAND_LISTED,
    PLACEMENT_CHANGE_DISCREPANCY_RESOLVED,
    PLACEMENT_CHANGE_PLACEMENT_RESTORED,
    PLACEMENT_CHANGE_SOURCE_RESOLVED,
    PLACEMENT_CHECK_KIND,
    PLACEMENT_CHECKER_VERSION,
    PLACEMENT_DUE_PAGES_MAX,
    PLACEMENT_REASON_EXHAUSTED,
    PLACEMENT_RECHECK_AFTER_HOURS,
    PLACEMENT_RECHECK_INTERVAL_HOURS,
    PLACEMENT_RECHECK_MAX_ATTEMPTS,
    PLACEMENT_STATE_PENDING,
    PLACEMENT_STATE_SATISFIED,
    PLACEMENT_STATE_UNAVAILABLE,
    PLACEMENT_STATE_UNMET,
)
from app.core.config.source_pages import ENTITY_KIND_BRAND, PRESENCE_PRESENT
from app.domain.opportunities.projection import stable_key
from app.domain.source_pages.persistence import OUTCOME_INSPECTED
from app.models.brand import OwnedDomain
from app.models.opportunity import Opportunity, OpportunityImplementationEvent
from app.models.source_pages import (
    PlacementCheck,
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)

__all__ = [
    "due_placement_page_ids",
    "evaluate_placement_checks",
    "open_placement_check",
    "placement_expected_check",
    "placement_section",
]

# What each earned rule's done-state actually is. Acquiring a listing and
# correcting one are different outcomes, which is why the rules are separate
# ids in the first place; verifying both as "the brand appears" would undo
# that distinction at the last step.
_CHANGE_BY_RULE = {
    RULE_EARNED_PAGE_ACQUIRE: PLACEMENT_CHANGE_BRAND_LISTED,
    RULE_EARNED_PAGE_CORRECT: PLACEMENT_CHANGE_DISCREPANCY_RESOLVED,
    RULE_EARNED_PAGE_DEFEND: PLACEMENT_CHANGE_PLACEMENT_RESTORED,
    RULE_EARNED_PAGE_RESEARCH: PLACEMENT_CHANGE_SOURCE_RESOLVED,
}


def _handoff(opportunity: Opportunity) -> dict:
    return dict((opportunity.evidence or {}).get("content_handoff") or {})


def _brand_name(handoff: dict, fallback: str) -> str:
    """The name the page was searched for, as the verdict recorded it.

    Taken from the presence row rather than from the project, because that is
    the name frozen against the roster the reading was judged under. The
    project's current brand name is the fallback for a page with no verdict.
    """
    for entity in handoff.get("page_entities") or []:
        if (entity or {}).get("entity_kind") == ENTITY_KIND_BRAND:
            return str(entity.get("entity_name") or fallback)
    return fallback


def placement_expected_check(opportunity: Opportunity, *, brand_name: str) -> dict:
    """The server-owned verification intent for one earned declaration.

    Carried on the implementation event beside the other expected-check kinds.
    It is never evaluated from an audit or a site crawl -- a publisher's page
    is in neither -- so a verification triggered by one records it as
    unobservable instead of quietly passing it.
    """
    handoff = _handoff(opportunity)
    return {
        "kind": PLACEMENT_CHECK_KIND,
        "rule_id": opportunity.rule_id,
        "expected_change": _CHANGE_BY_RULE.get(
            opportunity.rule_id, PLACEMENT_CHANGE_SOURCE_RESOLVED
        ),
        "url_hash": str(handoff.get("url_hash") or ""),
        "target_url": opportunity.target_url,
        "brand_name": _brand_name(handoff, brand_name),
        "discrepancies": list(handoff.get("discrepancies") or []),
        "deterioration": list(handoff.get("deterioration") or []),
        "baseline_snapshot_id": handoff.get("snapshot_id"),
    }


async def _owned_domains(session: AsyncSession, project_id: uuid.UUID) -> list[str]:
    return list(
        (
            await session.scalars(
                select(OwnedDomain.domain)
                .where(OwnedDomain.project_id == project_id)
                .order_by(OwnedDomain.domain.asc())
            )
        ).all()
    )


async def open_placement_check(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    opportunity: Opportunity,
    check: dict,
    now: datetime | None = None,
) -> PlacementCheck | None:
    """Record what this declaration will be measured against, and when.

    Returns ``None`` when the page identity is unknown to this project, which
    is the honest outcome: there is nothing to re-read, so nothing can confirm
    the placement. The declaration still stands and still reports its own
    limitation.
    """
    moment = now or datetime.now(UTC)
    url_hash = str(check.get("url_hash") or "")
    if not url_hash:
        return None
    page = await session.scalar(
        select(SourcePage).where(
            SourcePage.project_id == declaration.project_id,
            SourcePage.url_hash == url_hash,
        )
    )
    if page is None:
        return None
    baseline_id = _uuid(check.get("baseline_snapshot_id"))
    row = PlacementCheck(
        workspace_id=declaration.workspace_id,
        project_id=declaration.project_id,
        implementation_event_id=declaration.id,
        opportunity_stable_key=stable_key(opportunity),
        rule_id=opportunity.rule_id,
        source_page_id=page.id,
        url_hash=url_hash,
        expected_change=str(check.get("expected_change") or ""),
        expected_detail={
            "brand_name": check.get("brand_name") or "",
            "owned_domains": await _owned_domains(session, declaration.project_id),
            "discrepancies": list(check.get("discrepancies") or []),
            "deterioration": list(check.get("deterioration") or []),
        },
        baseline_snapshot_id=baseline_id,
        baseline_roster_version=await _roster_of(session, baseline_id),
        state=PLACEMENT_STATE_PENDING,
        # Not immediately: a publisher does not publish the moment somebody
        # emails them, and reading the page an hour later spends a budget unit
        # to observe the state we already knew.
        due_at=declaration.declared_implemented_at
        + timedelta(hours=PLACEMENT_RECHECK_AFTER_HOURS),
        declared_at=declaration.declared_implemented_at,
        checker_version=PLACEMENT_CHECKER_VERSION,
        created_at=moment,
        updated_at=moment,
    )
    session.add(row)
    await session.flush()
    return row


def _uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value)) if value else None
    except ValueError:
        return None


async def _roster_of(session: AsyncSession, snapshot_id: uuid.UUID | None) -> str:
    """The roster the baseline's verdicts were judged against.

    Frozen here rather than re-derived later: the project's roster changes,
    and a comparison that silently used today's would answer a different
    question from the one the baseline answered.
    """
    if snapshot_id is None:
        return ""
    return (
        await session.scalar(
            select(SourcePageEntityPresence.roster_version)
            .where(SourcePageEntityPresence.snapshot_id == snapshot_id)
            .limit(1)
        )
    ) or ""


async def due_placement_page_ids(
    session: AsyncSession, *, project_id: uuid.UUID, now: datetime | None = None
) -> set[uuid.UUID]:
    """Pages this project owes a placement reading, for inspection admission.

    Admission ranks never-inspected pages first, then stale ones, then these.
    A page with a due check is claimed and paid for through the same atomic
    admission as any other; a recheck is an inspection and costs a unit.
    """
    moment = now or datetime.now(UTC)
    rows = await session.scalars(
        select(PlacementCheck.source_page_id)
        .where(
            PlacementCheck.project_id == project_id,
            PlacementCheck.due_at.is_not(None),
            PlacementCheck.due_at <= moment,
            PlacementCheck.state.in_((PLACEMENT_STATE_PENDING, PLACEMENT_STATE_UNMET)),
        )
        .order_by(PlacementCheck.due_at.asc())
        .limit(PLACEMENT_DUE_PAGES_MAX)
    )
    return set(rows.all())


def _reading(
    snapshot: SourcePageSnapshot, rows: list[SourcePageEntityPresence]
) -> PlacementReading:
    brand = next(
        (row for row in rows if row.entity_kind == ENTITY_KIND_BRAND),
        None,
    )
    facts = snapshot.page_facts or {}
    return PlacementReading(
        snapshot_id=str(snapshot.id),
        roster_version=(rows[0].roster_version if rows else ""),
        extracted_chars=snapshot.extracted_chars,
        brand_presence=brand.presence if brand else None,
        brand_present=bool(brand and brand.presence == PRESENCE_PRESENT),
        brand_match_count=brand.match_count if brand else 0,
        outbound_domains=tuple(
            str(item) for item in (facts.get("outbound_domains") or [])
        ),
        headings=tuple(str(item) for item in (facts.get("headings") or [])),
    )


async def _baseline_reading(
    session: AsyncSession, check: PlacementCheck
) -> PlacementReading | None:
    """The frozen reading this declaration will be measured against.

    Its roster comes from the check row, not from the snapshot's presence
    rows. That value was frozen when the declaration was made, and it is what
    makes "these two readings answered the same question" checkable later.
    """
    snapshot_id = check.baseline_snapshot_id
    if snapshot_id is None:
        return None
    snapshot = await session.get(SourcePageSnapshot, snapshot_id)
    if snapshot is None:
        return None
    rows = list(
        (
            await session.scalars(
                select(SourcePageEntityPresence)
                .where(SourcePageEntityPresence.snapshot_id == snapshot.id)
                .order_by(SourcePageEntityPresence.entity_kind.asc())
            )
        ).all()
    )
    return replace(
        _reading(snapshot, rows), roster_version=check.baseline_roster_version
    )


async def _observation(
    session: AsyncSession, check: PlacementCheck
) -> SourcePageSnapshot | None:
    """The first successful reading taken AFTER the declaration.

    Successful only: a blocked or failed attempt is a fact about the fetch,
    not a reading of the page, and comparing a placement against one would
    report every outage as a placement that never went live.
    """
    return await session.scalar(
        select(SourcePageSnapshot)
        .where(
            SourcePageSnapshot.source_page_id == check.source_page_id,
            SourcePageSnapshot.project_id == check.project_id,
            SourcePageSnapshot.outcome == OUTCOME_INSPECTED,
            SourcePageSnapshot.fetched_at > check.declared_at,
            SourcePageSnapshot.id != check.observation_snapshot_id,
        )
        .order_by(SourcePageSnapshot.fetched_at.desc(), SourcePageSnapshot.id.desc())
        .limit(1)
    )


def _expectation(check: PlacementCheck) -> PlacementExpectation:
    detail = check.expected_detail or {}
    return PlacementExpectation(
        expected_change=check.expected_change,
        brand_name=str(detail.get("brand_name") or ""),
        owned_domains=tuple(str(item) for item in (detail.get("owned_domains") or [])),
        discrepancies=tuple(str(item) for item in (detail.get("discrepancies") or [])),
    )


def _reschedule(check: PlacementCheck, *, moment: datetime) -> None:
    """Whether this page is worth reading again, once a reading found nothing.

    An open-ended recheck is an open-ended charge against the project's
    inspection budget for an outcome nobody is still waiting on, so the check
    stops asking after a bounded number of readings.
    """
    if check.state != PLACEMENT_STATE_UNMET:
        check.due_at = None
        return
    if check.attempts >= PLACEMENT_RECHECK_MAX_ATTEMPTS:
        check.due_at = None
        check.state_reason = PLACEMENT_REASON_EXHAUSTED
        return
    check.due_at = moment + timedelta(hours=PLACEMENT_RECHECK_INTERVAL_HOURS)


async def evaluate_placement_checks(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    now: datetime | None = None,
) -> int:
    """Settle every check with a fresh reading. Returns how many were observed.

    Called after an inspection batch commits, so the readings it compares are
    the ones that batch just took.
    """
    moment = now or datetime.now(UTC)
    checks = list(
        (
            await session.scalars(
                select(PlacementCheck).where(
                    PlacementCheck.workspace_id == workspace_id,
                    PlacementCheck.project_id == project_id,
                    PlacementCheck.state.in_(
                        (PLACEMENT_STATE_PENDING, PLACEMENT_STATE_UNMET)
                    ),
                )
            )
        ).all()
    )
    observed = 0
    for check in checks:
        snapshot = await _observation(session, check)
        if snapshot is None:
            continue
        observation = _reading(
            snapshot,
            list(
                (
                    await session.scalars(
                        select(SourcePageEntityPresence).where(
                            SourcePageEntityPresence.snapshot_id == snapshot.id
                        )
                    )
                ).all()
            ),
        )
        verdict = evaluate_placement(
            expectation=_expectation(check),
            baseline=await _baseline_reading(session, check),
            observation=observation,
        )
        check.state = verdict.state
        check.state_reason = verdict.reason
        check.observation_snapshot_id = snapshot.id
        check.observed_at = snapshot.fetched_at
        check.attempts += 1
        check.updated_at = moment
        _reschedule(check, moment=moment)
        observed += 1
    return observed


# The state a check reports before anything has read the page since the
# declaration. Kept out of the verdict vocabulary so a reader is never told a
# placement failed when nobody has looked at it yet.
_SECTION_STATES = {
    PLACEMENT_STATE_SATISFIED: "live",
    PLACEMENT_STATE_UNMET: "not_observed",
    PLACEMENT_STATE_UNAVAILABLE: "unavailable",
    PLACEMENT_STATE_PENDING: "not_run",
}


async def placement_section(
    session: AsyncSession, *, declaration: OpportunityImplementationEvent
) -> dict | None:
    """The placement observation, for the verification result's own section.

    Deliberately NOT one of the comparable legs. "The listing is live" and
    "visibility moved" are two observations about two different things and are
    free to disagree; folding one into the other is what made a verification
    result claim more than it knew.
    """
    check = await session.scalar(
        select(PlacementCheck).where(
            PlacementCheck.implementation_event_id == declaration.id
        )
    )
    if check is None:
        return None
    return {
        "state": _SECTION_STATES.get(check.state, "unavailable"),
        "expected_change": check.expected_change,
        "rule_id": check.rule_id,
        "url_hash": check.url_hash,
        "target_url": declaration.target_external_url,
        "reason": check.state_reason,
        "baseline_snapshot_id": str(check.baseline_snapshot_id)
        if check.baseline_snapshot_id
        else None,
        "observation_snapshot_id": str(check.observation_snapshot_id)
        if check.observation_snapshot_id
        else None,
        "observed_at": check.observed_at.isoformat() if check.observed_at else None,
        "attempts": check.attempts,
        "max_attempts": PLACEMENT_RECHECK_MAX_ATTEMPTS,
        "due_at": check.due_at.isoformat() if check.due_at else None,
        "checker_version": check.checker_version,
        "limitations": _section_limitations(check),
    }


def _section_limitations(check: PlacementCheck) -> list[str]:
    if check.state == PLACEMENT_STATE_PENDING:
        return ["The page has not been read since this was declared."]
    if check.state == PLACEMENT_STATE_UNAVAILABLE:
        return ["The page could not be compared against its frozen baseline."]
    if check.state == PLACEMENT_STATE_UNMET and check.due_at is not None:
        return ["The change is not on the page yet. It will be read again."]
    return [
        "A placement going live and visibility moving are separate observations"
        " and may disagree."
    ]
