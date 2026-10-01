"""The crawl cancel: one short locked transaction that stops the crawl.

The crawl row is locked ``FOR UPDATE``, the overall/discovery/analysis
sub-states are driven to cancelled where the guarded machine allows it, every
non-terminal task is cancelled and the fetch allowance settles. The cancelled
run's evidence (final page revisions, snapshot and score summary) is published
by the TypeScript Site Health worker, the crawl's single terminalization owner.
Retired with crawl control (PR 18b5c), when the route moves to TypeScript.
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
from app.domain.site_health.fetch_budget import settle_crawl_fetches
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
from app.domain.site_health.state_events import (
    InvalidSiteCrawlTransition,
    apply_analysis_status,
    apply_crawl_status,
    apply_discovery_status,
    record_crawl_event,
)
from app.models.site_health.crawl import SiteCrawl
from app.models.site_health.queue import SiteCrawlTask

logger = logging.getLogger("app.domain.site_health.service.lifecycle")


async def cancel_crawl(
    session: AsyncSession, *, workspace_id: uuid.UUID, crawl_id: uuid.UUID
) -> dict:
    """Stop the crawl and answer with its projection.

    Stop is the user's escape hatch from a crawl that is misbehaving, so the
    transition is kept short and replayed after a bounded number of lock races.
    Rolling up the partial evidence takes the profile lock and loads the whole
    measurement projection; holding that inside the transition meant a busy
    crawl could time the request out and answer the Stop button with a 500.
    """
    await _retry_on_lock_conflict(
        lambda: _cancel_crawl_once(
            session, workspace_id=workspace_id, crawl_id=crawl_id
        ),
        session=session,
        crawl_id=crawl_id,
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
                    "operation": "cancel",
                    "retry_number": retry_number,
                },
            )
            await asyncio.sleep(
                site_health_settings.db_conflict_retry_delay(retry_number)
            )
    raise RuntimeError("unreachable cancellation retry state")


async def _cancel_crawl_once(
    session: AsyncSession, *, workspace_id: uuid.UUID, crawl_id: uuid.UUID
) -> None:
    """Cancel a crawl atomically: transition states, cancel tasks, record event.

    Every statement here touches the crawl and its own task rows, so the
    transaction is short enough to win the crawl row lock back from a worker
    mid-reconcile. An already-terminal crawl stays fully idempotent: nothing is
    committed and the caller answers with the current projection (including
    the failure summary when that terminal state is FAILED).
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
        await session.rollback()
        return

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
