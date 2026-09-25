"""What each loop leg of a declared Action is waiting for (plan §9).

A read projection over persisted rows: the declaration's frozen checks name
the legs, and each leg reports the evidence it has or the reading it awaits.
Nothing here schedules, syncs or crawls -- a leg with no reading coming says
so, and the user starts the run from the owning screen.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.actions import (
    CHECK_KIND_MEASUREMENT_LEG,
    LEG_CRAWL,
    LEG_PLACEMENT_RECHECK,
    LEG_SEARCH_CONSOLE_WINDOW,
    LEG_STATE_NOT_SCHEDULED,
    LEG_STATE_OBSERVED,
    LEG_STATE_SYNC_NEEDED,
    LEG_STATE_WAITING,
    LEG_VISIBILITY_RUN,
    SEARCH_CONSOLE_FINALIZATION_LAG_DAYS,
    SEARCH_CONSOLE_MEASUREMENT_WINDOW_DAYS,
)
from app.core.config.placement import PLACEMENT_STATE_PENDING
from app.core.config.site_health_contracts import CRAWL_STATUS_COMPLETED
from app.models.audit_schedule import AuditSchedule
from app.models.opportunity import (
    OpportunityImplementationEvent,
    OpportunityVerificationEvent,
)
from app.models.site_health.crawl import SiteCrawl
from app.models.source_pages import PlacementCheck
from app.models.traffic import TrafficSnapshot


@dataclass(frozen=True, slots=True)
class MeasurementLeg:
    leg: str
    state: str
    # When the next reading is expected, if anything will produce one.
    due_at: datetime | None = None
    # The newest persisted evidence this leg reads, whatever its date.
    last_evidence_at: datetime | None = None
    # That evidence's row: the crawl, audit, traffic snapshot or placement
    # check observed, else the schedule the next reading comes from.
    source_id: uuid.UUID | None = None


def declared_legs(declaration: OpportunityImplementationEvent) -> list[str]:
    """The legs the declaration's checks need, in check order, once each."""
    legs = (
        CHECK_KIND_MEASUREMENT_LEG.get(str(check.get("kind")))
        for check in declaration.expected_checks or []
    )
    return list(dict.fromkeys(leg for leg in legs if leg))


async def measurement_legs(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    observations: list[OpportunityVerificationEvent],
    now: datetime | None = None,
) -> list[MeasurementLeg]:
    moment = now or datetime.now(UTC)
    readers = {
        LEG_CRAWL: _crawl_leg,
        LEG_VISIBILITY_RUN: _visibility_leg,
        LEG_SEARCH_CONSOLE_WINDOW: _search_console_leg,
        LEG_PLACEMENT_RECHECK: _placement_leg,
    }
    return [
        await readers[leg](
            session, declaration=declaration, observations=observations, now=moment
        )
        for leg in declared_legs(declaration)
        if leg in readers
    ]


async def _crawl_leg(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    observations: list[OpportunityVerificationEvent],
    now: datetime,
) -> MeasurementLeg:
    observed = next((row.crawl_id for row in observations if row.crawl_id), None)
    latest = (
        await session.execute(
            select(SiteCrawl.id, SiteCrawl.completed_at)
            .where(
                SiteCrawl.workspace_id == declaration.workspace_id,
                SiteCrawl.project_id == declaration.project_id,
                SiteCrawl.status == CRAWL_STATUS_COMPLETED,
            )
            .order_by(SiteCrawl.completed_at.desc(), SiteCrawl.id.desc())
            .limit(1)
        )
    ).first()
    crawl_id, completed_at = latest if latest is not None else (None, None)
    # Crawls run when someone starts one, so there is no date to wait for.
    return MeasurementLeg(
        leg=LEG_CRAWL,
        state=LEG_STATE_OBSERVED if observed else LEG_STATE_NOT_SCHEDULED,
        last_evidence_at=completed_at,
        source_id=observed or crawl_id,
    )


async def _visibility_leg(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    observations: list[OpportunityVerificationEvent],
    now: datetime,
) -> MeasurementLeg:
    audit = next((row for row in observations if row.audit_id), None)
    if audit is not None:
        return MeasurementLeg(
            leg=LEG_VISIBILITY_RUN,
            state=LEG_STATE_OBSERVED,
            last_evidence_at=audit.observed_at,
            source_id=audit.audit_id,
        )
    schedule = (
        await session.execute(
            select(AuditSchedule.id, AuditSchedule.next_run_at)
            .where(
                AuditSchedule.workspace_id == declaration.workspace_id,
                AuditSchedule.project_id == declaration.project_id,
                AuditSchedule.enabled.is_(True),
                AuditSchedule.next_run_at.is_not(None),
            )
            .order_by(AuditSchedule.next_run_at.asc(), AuditSchedule.id.asc())
            .limit(1)
        )
    ).first()
    if schedule is None:
        return MeasurementLeg(leg=LEG_VISIBILITY_RUN, state=LEG_STATE_NOT_SCHEDULED)
    return MeasurementLeg(
        leg=LEG_VISIBILITY_RUN,
        state=LEG_STATE_WAITING,
        due_at=schedule.next_run_at,
        source_id=schedule.id,
    )


def search_console_state(
    *, declared_at: datetime, window: tuple[date, date] | None, now: datetime
) -> tuple[str, datetime]:
    """Whether a complete post-declaration window is synced, due or awaited.

    Complete means a synced window that starts on or after the declaration day
    and has run in full since; a window reaching back before the declaration
    mixes in the evidence it is meant to be compared against. It can be read
    once the property has finalised that data. Returns the state and the
    moment the window becomes readable.
    """
    complete_through = declared_at.astimezone(UTC).date() + timedelta(
        days=SEARCH_CONSOLE_MEASUREMENT_WINDOW_DAYS
    )
    ready_on = complete_through + timedelta(days=SEARCH_CONSOLE_FINALIZATION_LAG_DAYS)
    declared_on = declared_at.astimezone(UTC).date()
    if (
        window is not None
        and window[0] >= declared_on
        and window[1] >= complete_through
    ):
        state = LEG_STATE_OBSERVED
    elif now.astimezone(UTC).date() >= ready_on:
        state = LEG_STATE_SYNC_NEEDED
    else:
        state = LEG_STATE_WAITING
    return state, datetime.combine(ready_on, time.min, tzinfo=UTC)


async def _search_console_leg(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    observations: list[OpportunityVerificationEvent],
    now: datetime,
) -> MeasurementLeg:
    declared_on = declaration.declared_implemented_at.astimezone(UTC).date()
    base = select(
        TrafficSnapshot.id,
        TrafficSnapshot.window_start,
        TrafficSnapshot.window_end,
        TrafficSnapshot.created_at,
    ).where(
        TrafficSnapshot.workspace_id == declaration.workspace_id,
        TrafficSnapshot.project_id == declaration.project_id,
    )
    order = (TrafficSnapshot.created_at.desc(), TrafficSnapshot.id.desc())
    # The widest synced window lying wholly after the declaration, else the
    # newest synced window at all, which says only when data last arrived.
    row = (
        await session.execute(
            base.where(TrafficSnapshot.window_start >= declared_on)
            .order_by(TrafficSnapshot.window_end.desc(), *order)
            .limit(1)
        )
    ).first() or (await session.execute(base.order_by(*order).limit(1))).first()
    state, ready_at = search_console_state(
        declared_at=declaration.declared_implemented_at,
        window=(row.window_start, row.window_end) if row is not None else None,
        now=now,
    )
    return MeasurementLeg(
        leg=LEG_SEARCH_CONSOLE_WINDOW,
        state=state,
        due_at=ready_at,
        last_evidence_at=row.created_at if row is not None else None,
        source_id=row.id if row is not None else None,
    )


async def _placement_leg(
    session: AsyncSession,
    *,
    declaration: OpportunityImplementationEvent,
    observations: list[OpportunityVerificationEvent],
    now: datetime,
) -> MeasurementLeg:
    check = await session.scalar(
        select(PlacementCheck).where(
            PlacementCheck.workspace_id == declaration.workspace_id,
            PlacementCheck.implementation_event_id == declaration.id,
        )
    )
    if check is None:
        return MeasurementLeg(leg=LEG_PLACEMENT_RECHECK, state=LEG_STATE_NOT_SCHEDULED)
    if check.state != PLACEMENT_STATE_PENDING and check.due_at is None:
        state = LEG_STATE_OBSERVED
    else:
        state = LEG_STATE_WAITING if check.due_at else LEG_STATE_NOT_SCHEDULED
    return MeasurementLeg(
        leg=LEG_PLACEMENT_RECHECK,
        state=state,
        due_at=check.due_at,
        last_evidence_at=check.observed_at,
        source_id=check.id,
    )
