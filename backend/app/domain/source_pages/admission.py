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

Selection order is new pages, then stale ones, then pages that owe a placement
recheck, then the rest, with recurrence ranking within each group. A recheck is
an inspection like any other: it is claimed through this same lock and pays the
same unit, which is why a due check changes a page's PRIORITY here rather than
getting its own path.

Which pages owe one is ASKED OF THE CALLER rather than looked up here.
Retrieval and budget are this module's concern; what a declaration promised is
the verification domain's, and every other dependency between the two already
points that way. The worker orchestrates both and knows the answer.

Fresh pages are reused rather than refetched, and nothing is refetched because
its content changed -- a changed hash is only knowable after fetching, so it
decides whether ANALYSIS reruns, never whether retrieval happens. A page read
within the reuse window is therefore not re-read for a due check either: the
reading that check needs already exists.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any, cast

from sqlalchemy import CursorResult, case, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.source_pages import (
    INSPECTION_BLOCKED,
    INSPECTION_INSPECTED,
    INSPECTION_NOT_INSPECTED,
    INSPECTION_QUEUED,
    INSPECTION_STALE,
    SOURCE_PAGE_BATCH_MAX,
    SOURCE_PAGE_BUDGET_PER_WINDOW,
    SOURCE_PAGE_BUDGET_WINDOW_HOURS,
    SOURCE_PAGE_CLAIM_LEASE_MINUTES,
    SOURCE_PAGE_REUSE_WITHIN_HOURS,
)
from app.domain.prompts.locks import acquire_project_lock
from app.models.source_pages import SourcePage, SourcePageInspectionSpend

SPEND_KIND_PAGE = "page"
SPEND_KIND_REDIRECT = "redirect"
SPEND_KIND_RECHECK = "recheck"

# Ranked worst-known-first. A page never looked at tells us the most; a stale
# one tells us whether a placement survived; a page somebody has declared work
# on is owed a reading; an inspected one with nothing pending is reused.
_RANK_NEW = 0
_RANK_STALE = 1
_RANK_DUE_RECHECK = 2
_RANK_REST = 3


def _rank(due_page_ids: set[uuid.UUID]):
    """The selection order, with due placement rechecks ahead of the rest.

    A due check is not a page STATE -- the page is perfectly well inspected --
    so it cannot live alongside the states. It is a separate fact about the
    page, and it only ever promotes one that would otherwise sort last. An
    empty set renders as an always-false branch, which is the same ordering
    the states alone produce.
    """
    return case(
        (SourcePage.inspection_state == INSPECTION_NOT_INSPECTED, _RANK_NEW),
        (SourcePage.inspection_state == INSPECTION_STALE, _RANK_STALE),
        (SourcePage.id.in_(due_page_ids), _RANK_DUE_RECHECK),
        else_=_RANK_REST,
    )


# The one state a page cannot be claimed from: retrying a wall spends budget
# to be told the same thing. ``queued`` is excluded by lease check rather than
# by state, so an abandoned claim stays recoverable.
_TERMINAL_STATES = (INSPECTION_BLOCKED,)


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
    await acquire_project_lock(session, project_id)
    budget = await current_budget(session, project_id=project_id, now=now)
    if budget.remaining <= 0:
        return False
    # Hashed, not truncated: redirect tokens are long and share a prefix, so a
    # 200-character cut would collide and report a later token as already paid.
    digest = sha256(redirect_url.encode("utf-8")).hexdigest()
    return await _record_spend(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        source_page_id=None,
        spend_kind=SPEND_KIND_REDIRECT,
        idempotency_key=f"{SPEND_KIND_REDIRECT}:{project_id}:{digest}",
    )


async def mark_inspection_requested(
    session: AsyncSession,
    *,
    project_id: uuid.UUID,
    url_hash: str,
    now: datetime | None = None,
) -> None:
    """Record that a person asked for this page by name.

    Separate from the claim because asking is not spending: the request is
    remembered whether or not the budget admits it today, and a page somebody
    went looking for stays worth resolving after a fetch that told us nothing.
    """
    await session.execute(
        update(SourcePage)
        .where(SourcePage.project_id == project_id, SourcePage.url_hash == url_hash)
        .values(inspection_requested_at=now or datetime.now(UTC))
    )


def _claimable(now: datetime):
    reuse_after = now - timedelta(hours=SOURCE_PAGE_REUSE_WITHIN_HOURS)
    return (
        SourcePage.inspection_state.not_in(_TERMINAL_STATES),
        or_(
            SourcePage.inspection_state != INSPECTION_QUEUED,
            SourcePage.claim_expires_at.is_(None),
            SourcePage.claim_expires_at < now,
        ),
        # A fresh inspection is reused rather than repeated. This is what stops
        # a page inspected from a redirect body earlier in the same run from
        # being claimed again and charged twice for one reading.
        or_(
            SourcePage.last_inspected_at.is_(None),
            SourcePage.last_inspected_at < reuse_after,
        ),
    )


async def claim_pages(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int = SOURCE_PAGE_BATCH_MAX,
    page_ids: list[uuid.UUID] | None = None,
    due_page_ids: set[uuid.UUID] | None = None,
    now: datetime | None = None,
) -> list[uuid.UUID]:
    """Admit up to ``limit`` pages for inspection, paying for each as it is taken.

    Runs inside ONE transaction under the project lock, so two workers cannot
    both read the same remaining allowance and both proceed. The caller commits.

    ``page_ids`` narrows this to an explicitly requested page, which a manual
    inspection uses. It goes through the same lock, the same budget and the same
    spend accounting; a page someone asked for is not free.

    ``due_page_ids`` are the pages that owe a placement reading. They only
    change the ORDER, never eligibility -- a due page is claimable on exactly
    the same terms as any other, including the reuse window, because a page
    read an hour ago already holds the reading that check needs.
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
            _rank(due_page_ids or set()),
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

    claims: list[uuid.UUID] = []
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
        claims.append(page.id)
    return claims
