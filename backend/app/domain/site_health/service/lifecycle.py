"""The atomic crawl cancel.

Cancel is ONE atomic transaction: the crawl
row is locked ``FOR UPDATE``, the overall/discovery/analysis sub-states are
driven to cancelled where the guarded machine allows it, every non-terminal task
is cancelled, and the canonical snapshot writer runs so a partially-analyzed run
keeps its scores instead of dead-ending on a null summary.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.site_health_contracts import (
    ANALYSIS_STATUS_CANCELLED,
    CRAWL_STATUS_CANCELLED,
    CRAWL_TERMINAL_STATUSES,
    DISCOVERY_STATUS_CANCELLED,
    EVENT_CRAWL_CANCELLED,
)
from app.core.config.site_health_runtime import (
    CRAWL_CANCEL_DB_CONFLICT_RETRIES,
    site_health_settings,
)
from app.core.config.task_queue import (
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_SUCCEEDED,
)
from app.core.db_conflicts import is_transient_db_conflict
from app.domain.site_health.change_queue import enqueue_change_refresh
from app.domain.site_health.fetch_budget import settle_crawl_fetches
from app.domain.site_health.link_queue import enqueue_link_metric_refresh
from app.domain.site_health.service.common import (
    _CRAWL_NOT_FOUND,
    SiteHealthNotFoundError,
    _load_crawl,
)
from app.domain.site_health.service.presentation import (
    crawl_count_disclosure,
    project_crawl,
)
from app.domain.site_health.service.queries import (
    _failure_summary_for,
)
from app.domain.site_health.snapshot import persist_crawl_snapshot
from app.domain.site_health.state_events import (
    InvalidSiteCrawlTransition,
    apply_analysis_status,
    apply_crawl_status,
    apply_discovery_status,
    record_crawl_event,
)
from app.domain.site_health.terminal_analysis import publish_final_page_analyses
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.queue import SiteCrawlTask

logger = logging.getLogger("app.domain.site_health.service.lifecycle")


# =========================================================================
# Cancel (transition first, snapshot after)
# =========================================================================
async def cancel_crawl(
    session: AsyncSession, *, workspace_id: uuid.UUID, crawl_id: uuid.UUID
) -> dict:
    """Stop the crawl, then roll its partial evidence up separately.

    Stop is the user's escape hatch from a crawl that is misbehaving, so it has
    to survive the conditions that make them press it. It is split in two for
    that reason. The transition itself is one short locked transaction, replayed
    after a bounded number of lock races. The cancellation-time snapshot then
    runs in its OWN transaction, best effort: it takes the profile lock and
    loads the whole measurement projection, and holding that inside the
    transition meant a busy crawl could time the request out and answer the
    Stop button with a 500 while leaving the crawl running.

    Failing to write that snapshot costs a partially-analyzed run its rolled-up
    scores; pressing Stop again retries it, since nothing else recomputes a
    cancelled crawl. Failing to stop costs the user the only control they have.
    """
    cancelled = await _retry_on_lock_conflict(
        lambda: _cancel_crawl_once(
            session, workspace_id=workspace_id, crawl_id=crawl_id
        ),
        session=session,
        crawl_id=crawl_id,
        operation="cancel",
    )
    if cancelled:
        await _snapshot_cancelled_crawl(
            session, workspace_id=workspace_id, crawl_id=crawl_id
        )
    refreshed = await _load_crawl(session, workspace_id=workspace_id, crawl_id=crawl_id)
    return project_crawl(
        refreshed, failure_summary=await _failure_summary_for(session, refreshed)
    )


async def _retry_on_lock_conflict[T](
    run: Callable[[], Awaitable[T]],
    *,
    session: AsyncSession,
    crawl_id: uuid.UUID,
    operation: str,
) -> T:
    """Replay a whole transaction after bounded PostgreSQL lock races."""
    for conflict_count in range(CRAWL_CANCEL_DB_CONFLICT_RETRIES + 1):
        try:
            return await run()
        except Exception as exc:
            if (
                conflict_count >= CRAWL_CANCEL_DB_CONFLICT_RETRIES
                or not is_transient_db_conflict(exc)
            ):
                raise
            await session.rollback()
            retry_number = conflict_count + 1
            logger.info(
                "site_health.cancel_lock_conflict_retry",
                extra={
                    "crawl_id": str(crawl_id),
                    "operation": operation,
                    "retry_number": retry_number,
                },
            )
            await asyncio.sleep(
                site_health_settings.db_conflict_retry_delay(retry_number)
            )
    raise RuntimeError("unreachable cancellation retry state")


async def _snapshot_cancelled_crawl(
    session: AsyncSession, *, workspace_id: uuid.UUID, crawl_id: uuid.UUID
) -> None:
    """Roll a cancelled run's partial evidence up, without risking the cancel.

    Runs after the crawl is already durably cancelled. If the run produced
    completed analyses for ACTIVE monitored URLs, they go into the SAME
    canonical crawl snapshot the worker writes on clean terminalization (one
    shared algorithm, no duplication), which makes ``score_summary`` non-null
    so the frontend keeps the dashboard (partial scores + inventory), labels
    the run Cancelled, and offers Recrawl instead of hiding results behind a
    null summary. ``persist_crawl_snapshot`` decides from its single fetched
    aggregate row set: when nothing aggregable exists (no active completed
    analyses -- including a completed analysis whose monitored URL was since
    deactivated) it writes neither the snapshot nor the projection, so the
    summary stays null (never a fabricated zero) and the UI shows its terminal
    / selection state. No separate precheck -- that would be a TOCTOU race
    against membership/analysis changes.

    Every failure here is swallowed: the crawl is stopped either way, and the
    snapshot is recoverable evidence rather than the user's requested action.
    """
    try:
        await _retry_on_lock_conflict(
            lambda: _snapshot_cancelled_crawl_once(
                session, workspace_id=workspace_id, crawl_id=crawl_id
            ),
            session=session,
            crawl_id=crawl_id,
            operation="cancel_snapshot",
        )
    except Exception:
        await session.rollback()
        logger.exception(
            "site_health.cancel_snapshot_failed", extra={"crawl_id": str(crawl_id)}
        )


async def _snapshot_cancelled_crawl_once(
    session: AsyncSession, *, workspace_id: uuid.UUID, crawl_id: uuid.UUID
) -> None:
    locked = await session.execute(
        select(SiteCrawl)
        .where(SiteCrawl.id == crawl_id, SiteCrawl.workspace_id == workspace_id)
        .with_for_update()
    )
    crawl = locked.scalar_one_or_none()
    if crawl is None or crawl.status != CRAWL_STATUS_CANCELLED:
        await session.rollback()
        return
    await publish_final_page_analyses(session, crawl=crawl)
    if await persist_crawl_snapshot(session, crawl=crawl):
        await enqueue_change_refresh(session, crawl=crawl)
        await enqueue_link_metric_refresh(session, crawl=crawl)
    await session.commit()


async def _cancel_crawl_once(
    session: AsyncSession, *, workspace_id: uuid.UUID, crawl_id: uuid.UUID
) -> bool:
    """Cancel a crawl atomically: transition states, cancel tasks, record event.

    Locks the crawl row ``FOR UPDATE``, drives the overall/discovery/analysis
    sub-states to ``cancelled`` where the guarded machine allows it, cancels
    every non-terminal ``SiteCrawlTask``, records a ``crawl.cancelled`` event
    (payload redacted for Free), and commits. Returns whether the crawl is now
    cancelled — by this call or an earlier one — which is what tells the caller
    the evidence rollup still applies. Any other terminal state stays fully
    idempotent: it commits nothing and skips the rollup.

    Deliberately nothing else: every statement here touches the crawl and its
    own task rows, so the transaction is short enough to win the crawl row lock
    back from a worker mid-reconcile. The evidence rollup is
    ``_snapshot_cancelled_crawl``'s job, after this has committed.
    """
    locked = await session.execute(
        select(SiteCrawl)
        .where(
            SiteCrawl.id == crawl_id,
            SiteCrawl.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    crawl = locked.scalar_one_or_none()
    if crawl is None:
        raise SiteHealthNotFoundError(_CRAWL_NOT_FOUND)

    if crawl.status in CRAWL_TERMINAL_STATUSES:
        # Idempotent cancel of an already-terminal crawl: release the row and
        # let the caller answer with the current projection (including the B1
        # failure summary when that terminal state is FAILED). An already
        # CANCELLED crawl still reports True, so a rollup that failed on the
        # first Stop is retried on the next one; nothing else recomputes a
        # cancelled crawl's scores, and the snapshot write is an idempotent
        # replay when it already landed.
        # Read the status BEFORE the rollback: it expires every instance in
        # the session, and touching an expired attribute afterwards is a lazy
        # refresh outside the greenlet context.
        already_cancelled = crawl.status == CRAWL_STATUS_CANCELLED
        await session.rollback()
        return already_cancelled

    apply_crawl_status(crawl, CRAWL_STATUS_CANCELLED)
    # A cancelled crawl pays only for the pages it already analyzed.
    await settle_crawl_fetches(session, crawl=crawl, at=datetime.now(UTC))
    # Discovery / analysis sub-states are cancelled only from a non-terminal
    # state (the guarded machine keeps a completed sub-state as-is). ONLY the
    # state machine's rejection is ignored: a bare ``except Exception`` here
    # also swallowed session and programming errors, hiding real bugs behind a
    # silently-uncancelled sub-state.
    try:
        apply_discovery_status(crawl, DISCOVERY_STATUS_CANCELLED)
    except InvalidSiteCrawlTransition:
        pass
    try:
        apply_analysis_status(crawl, ANALYSIS_STATUS_CANCELLED)
    except InvalidSiteCrawlTransition:
        pass
    crawl.completed_at = func.now()

    # Cancel every non-terminal task for this crawl (queued/leased/running/
    # retry). Succeeded/failed/cancelled tasks keep their immutable evidence.
    await session.execute(
        update(SiteCrawlTask)
        .where(
            SiteCrawlTask.crawl_id == crawl_id,
            SiteCrawlTask.status.notin_(
                [
                    TASK_STATUS_SUCCEEDED,
                    TASK_STATUS_FAILED,
                    TASK_STATUS_CANCELLED,
                ]
            ),
        )
        .values(
            status=TASK_STATUS_CANCELLED,
            lease_owner=None,
            lease_expires_at=None,
            completed_at=func.now(),
            error_code="cancelled",
        )
    )

    record_crawl_event(
        session,
        crawl_id=crawl.id,
        event_type=EVENT_CRAWL_CANCELLED,
        message="crawl cancelled",
        count_disclosure=crawl_count_disclosure(crawl),
    )
    await session.commit()
    return True
