"""Deciding which cited pages may be fetched, and paying for them up front.

Budget is enforced by ATOMIC ADMISSION rather than by counting finished work.
Counting completed snapshots under-counts twice over: two workers reading the
same remaining allowance would both proceed, and a worker that fetched and then
crashed would leave no record of what it spent. Neither gap is theoretical --
both are the normal behaviour of a retried queue task.

So the unit of spend is the CLAIM, not the fetch. A page moves to ``queued``
and its spend row is written in the same transaction, under the project lock,
before any request leaves the process. A worker that dies mid-fetch has spent
its unit; that is the honest outcome, and the claim's lease expiry is what lets
the page be tried again later rather than stranding it.

Selection order is new pages, then stale ones, then the rest, with recurrence
ranking within each group. Fresh pages are reused rather than refetched, and
nothing is refetched because its content changed -- a changed hash is only
knowable after fetching, so it decides whether ANALYSIS reruns, never whether
retrieval happens.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, case, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.source_pages import (
    INSPECTION_BLOCKED,
    INSPECTION_EXCLUDED,
    INSPECTION_INSPECTED,
    INSPECTION_NOT_INSPECTED,
    INSPECTION_QUEUED,
    INSPECTION_STALE,
    SOURCE_PAGE_BATCH_MAX,
    SOURCE_PAGE_BUDGET_PER_WINDOW,
    SOURCE_PAGE_BUDGET_WINDOW_HOURS,
    SOURCE_PAGE_CLAIM_LEASE_MINUTES,
)
from app.domain.prompts.locks import acquire_project_lock
from app.models.source_pages import SourcePage, SourcePageInspectionSpend

SPEND_KIND_PAGE = "page"
SPEND_KIND_REDIRECT = "redirect"
SPEND_KIND_RECHECK = "recheck"

# Ranked worst-known-first. A page never looked at tells us the most; a stale
# one tells us whether a placement survived; an inspected one is reused.
_STATE_RANK = case(
    (SourcePage.inspection_state == INSPECTION_NOT_INSPECTED, 0),
    (SourcePage.inspection_state == INSPECTION_STALE, 1),
    else_=2,
)
# States a page cannot be claimed from. ``queued`` is excluded by lease check
# rather than by state, so an abandoned claim is recoverable.
_TERMINAL_STATES = (INSPECTION_BLOCKED, INSPECTION_EXCLUDED)


@dataclass(frozen=True, slots=True)
class Claim:
    """One admitted page, already paid for."""

    source_page_id: uuid.UUID
    canonical_url: str
    registrable_domain: str


@dataclass(frozen=True, slots=True)
class Budget:
    limit: int
    spent: int

    @property
    def remaining(self) -> int:
        return max(self.limit - self.spent, 0)


async def current_budget(
    session: AsyncSession, *, project_id: uuid.UUID, now: datetime | None = None
) -> Budget:
    """What this project has already spent in the rolling window."""
    moment = now or datetime.now(UTC)
    window_start = moment - timedelta(hours=SOURCE_PAGE_BUDGET_WINDOW_HOURS)
    spent = await session.scalar(
        select(func.coalesce(func.sum(SourcePageInspectionSpend.units), 0.0)).where(
            SourcePageInspectionSpend.project_id == project_id,
            SourcePageInspectionSpend.created_at >= window_start,
        )
    )
    return Budget(limit=SOURCE_PAGE_BUDGET_PER_WINDOW, spent=int(spent or 0))


async def _record_spend(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    source_page_id: uuid.UUID | None,
    spend_kind: str,
    idempotency_key: str,
) -> bool:
    """Write the spend row. ``False`` means this unit was already paid."""
    result = await session.execute(
        pg_insert(SourcePageInspectionSpend)
        .values(
            workspace_id=workspace_id,
            project_id=project_id,
            source_page_id=source_page_id,
            spend_kind=spend_kind,
            units=1.0,
            idempotency_key=idempotency_key,
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
    )
    # An INSERT always yields a CursorResult; the broad Result type does not
    # expose rowcount.
    return bool(cast(CursorResult[Any], result).rowcount)


async def spend_for_redirect(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    redirect_url: str,
    now: datetime | None = None,
) -> bool:
    """Pay for following one redirect token, or decline when the window is out.

    Resolutions cost the same as pages. A token is a fetch like any other, and
    exempting them is how an engine that redirects everything quietly doubles
    the bill.
    """
    budget = await current_budget(session, project_id=project_id, now=now)
    if budget.remaining <= 0:
        return False
    return await _record_spend(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        source_page_id=None,
        spend_kind=SPEND_KIND_REDIRECT,
        idempotency_key=f"{SPEND_KIND_REDIRECT}:{project_id}:{redirect_url}"[:200],
    )


def _claimable(now: datetime):
    return (
        SourcePage.inspection_state.not_in(_TERMINAL_STATES),
        or_(
            SourcePage.inspection_state != INSPECTION_QUEUED,
            SourcePage.claim_expires_at.is_(None),
            SourcePage.claim_expires_at < now,
        ),
    )


async def claim_pages(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int = SOURCE_PAGE_BATCH_MAX,
    page_ids: list[uuid.UUID] | None = None,
    now: datetime | None = None,
) -> list[Claim]:
    """Admit up to ``limit`` pages for inspection, paying for each as it is taken.

    Runs inside ONE transaction under the project lock, so two workers cannot
    both read the same remaining allowance and both proceed. The caller commits.

    ``page_ids`` narrows this to an explicitly requested page, which a manual
    inspection uses. It goes through the same lock, the same budget and the same
    spend accounting; a page someone asked for is not free.
    """
    moment = now or datetime.now(UTC)
    await acquire_project_lock(session, project_id)

    budget = await current_budget(session, project_id=project_id, now=moment)
    allowed = min(limit, budget.remaining)
    if allowed <= 0:
        return []

    statement = (
        select(SourcePage)
        .where(
            SourcePage.workspace_id == workspace_id,
            SourcePage.project_id == project_id,
            *_claimable(moment),
        )
        .order_by(
            _STATE_RANK,
            SourcePage.recurrence_count.desc(),
            SourcePage.last_cited_at.desc().nulls_last(),
            SourcePage.id,
        )
        .limit(allowed)
    )
    if page_ids is not None:
        if not page_ids:
            return []
        statement = statement.where(SourcePage.id.in_(page_ids))

    claims: list[Claim] = []
    lease_until = moment + timedelta(minutes=SOURCE_PAGE_CLAIM_LEASE_MINUTES)
    for page in (await session.scalars(statement)).all():
        kind = (
            SPEND_KIND_RECHECK
            if page.inspection_state in {INSPECTION_INSPECTED, INSPECTION_STALE}
            else SPEND_KIND_PAGE
        )
        # Keyed on the attempt, not the page: a page inspected again next week
        # is a new unit, while a replayed claim within the same lease is not.
        key = f"{kind}:{page.id}:{int(lease_until.timestamp())}"
        if not await _record_spend(
            session,
            workspace_id=workspace_id,
            project_id=project_id,
            source_page_id=page.id,
            spend_kind=kind,
            idempotency_key=key[:200],
        ):
            continue
        page.inspection_state = INSPECTION_QUEUED
        page.claim_expires_at = lease_until
        page.updated_at = moment
        claims.append(
            Claim(
                source_page_id=page.id,
                canonical_url=page.canonical_url,
                registrable_domain=page.registrable_domain,
            )
        )
    return claims
