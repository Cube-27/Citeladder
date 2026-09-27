"""Scheduling and settling the TypeScript declaration's placement check.

A declaration against an earned rule says a change was made to somebody else's
page. TypeScript freezes the expectation; this owner compares later readings
and schedules bounded rechecks through the source-page inspector.

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
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.opportunities.placement_outcome import (
    PlacementExpectation,
    PlacementReading,
    evaluate_placement,
)
from app.core.config.placement import (
    PLACEMENT_DUE_PAGES_MAX,
    PLACEMENT_REASON_EXHAUSTED,
    PLACEMENT_RECHECK_INTERVAL_HOURS,
    PLACEMENT_RECHECK_MAX_ATTEMPTS,
    PLACEMENT_RETRYABLE_REASONS,
    PLACEMENT_STATE_PENDING,
    PLACEMENT_STATE_UNAVAILABLE,
    PLACEMENT_STATE_UNMET,
)
from app.core.config.source_pages import ENTITY_KIND_BRAND, PRESENCE_PRESENT
from app.domain.source_pages.persistence import OUTCOME_INSPECTED
from app.domain.source_pages.projection import page_fact_strings
from app.models.source_pages import (
    PlacementCheck,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)

__all__ = [
    "due_placement_page_ids",
    "evaluate_placement_checks",
]


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
            PlacementCheck.state.in_(_OPEN_STATES),
        )
        .order_by(PlacementCheck.due_at.asc())
        .limit(PLACEMENT_DUE_PAGES_MAX)
    )
    return set(rows.all())


def _retryable(check: PlacementCheck) -> bool:
    """Whether a later reading could still settle this check.

    ``unmet`` always could: the publisher may simply not have acted yet. Some
    ``unavailable`` answers could too -- a reading that was too thin, or that
    produced no brand verdict, is a property of THAT reading and not of the
    check. The rest are properties of the check itself, and re-reading the
    page forever would not change them.
    """
    if check.state == PLACEMENT_STATE_UNMET:
        return True
    return (
        check.state == PLACEMENT_STATE_UNAVAILABLE
        and (check.state_reason or "") in PLACEMENT_RETRYABLE_REASONS
    )


_OPEN_STATES = (
    PLACEMENT_STATE_PENDING,
    PLACEMENT_STATE_UNMET,
    PLACEMENT_STATE_UNAVAILABLE,
)


def _reading(
    snapshot: SourcePageSnapshot,
    rows: list[SourcePageEntityPresence],
    *,
    roster_version: str | None = None,
) -> PlacementReading:
    """One reading, reduced to what a placement comparison needs.

    ``roster_version`` is overridable because the BASELINE's roster is the one
    frozen on the check, not the one its presence rows happen to carry now.
    """
    brand = next(
        (row for row in rows if row.entity_kind == ENTITY_KIND_BRAND),
        None,
    )
    facts = snapshot.page_facts or {}
    observed_version = rows[0].roster_version if rows else ""
    return PlacementReading(
        snapshot_id=str(snapshot.id),
        roster_version=roster_version
        if roster_version is not None
        else observed_version,
        extracted_chars=snapshot.extracted_chars,
        brand_presence=brand.presence if brand else None,
        brand_present=bool(brand and brand.presence == PRESENCE_PRESENT),
        brand_match_count=brand.match_count if brand else 0,
        outbound_domains=page_fact_strings(facts, "outbound_domains"),
        headings=page_fact_strings(facts, "headings"),
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
    return _reading(snapshot, rows, roster_version=check.baseline_roster_version)


async def _observation(
    session: AsyncSession, check: PlacementCheck
) -> SourcePageSnapshot | None:
    """The latest successful reading taken AFTER the declaration.

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
    stops asking after a bounded number of readings -- and stops immediately
    for an answer no later reading can change.
    """
    if not _retryable(check):
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
                select(PlacementCheck)
                .where(
                    PlacementCheck.workspace_id == workspace_id,
                    PlacementCheck.project_id == project_id,
                    PlacementCheck.state.in_(_OPEN_STATES),
                    # Only what is DUE. A check waiting out its window is not
                    # judged early -- reading the page the hour after somebody
                    # declared the work and recording "not there" reports a
                    # slow editor as a false declaration. A check that has
                    # stopped asking has ``due_at`` cleared and leaves the
                    # scan for good rather than being re-queried forever.
                    PlacementCheck.due_at.is_not(None),
                    PlacementCheck.due_at <= moment,
                )
                .order_by(PlacementCheck.due_at.asc())
                .limit(PLACEMENT_DUE_PAGES_MAX)
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
