"""Bridge: reconcile crawls after the TypeScript worker settles a task.

The crawl lifecycle (live score refresh, analysis-state transitions and
terminalization) still runs in Python and used to be reached from the Python
worker's own ``finally`` after every discover, site setup and analyze task.
Those kinds now run in the TypeScript worker, so this maintenance step replays
``reconcile_after_task`` for their rows that reached a terminal state since
the last pass. The stall
sweep still rescues anything a restart misses. Retired with crawl control
(PR 18b5), when the lifecycle moves beside the analyzer.
"""

from __future__ import annotations

import uuid
from collections import OrderedDict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_contracts import (
    SITE_ACQUISITION_TASK_KINDS,
    TASK_KIND_ANALYZE,
)
from app.core.config.site_health_runtime import site_health_settings
from app.core.config.task_queue import TASK_TERMINAL_STATUSES
from app.models.site_health.queue import SiteCrawlTask
from app.workers.site_health.lifecycle import CrawlLifecycle

# Kinds whose settlement can move a crawl lifecycle boundary.
_CRAWL_TASK_KINDS = sorted(SITE_ACQUISITION_TASK_KINDS | {TASK_KIND_ANALYZE})
# Rows settled up to this long before the watermark are re-read, because a
# transaction may commit after a later one that the previous pass already saw.
_OVERLAP = timedelta(seconds=10)
_MAX_REMEMBERED = 5000


class TsAnalysisReconciler:
    """Replay the per-task crawl reconcile for rows the TypeScript worker settled."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        lifecycle: CrawlLifecycle,
    ) -> None:
        self._session_factory = session_factory
        self._lifecycle = lifecycle
        self._watermark = datetime.now(UTC) - timedelta(
            seconds=site_health_settings.stalled_crawl_reconcile_seconds
        )
        self._seen: OrderedDict[uuid.UUID, None] = OrderedDict()

    async def reconcile(self) -> int:
        async with self._session_factory() as session:
            rows = list(
                (
                    await session.scalars(
                        select(SiteCrawlTask)
                        .where(
                            SiteCrawlTask.task_kind.in_(_CRAWL_TASK_KINDS),
                            SiteCrawlTask.status.in_(sorted(TASK_TERMINAL_STATUSES)),
                            SiteCrawlTask.updated_at > self._watermark - _OVERLAP,
                        )
                        .order_by(SiteCrawlTask.updated_at)
                        .limit(site_health_settings.stalled_crawl_reconcile_batch)
                    )
                ).all()
            )
        settled = [row for row in rows if row.id not in self._seen]
        for task in settled:
            await self._lifecycle.reconcile_after_task(task)
            self._seen[task.id] = None
        while len(self._seen) > _MAX_REMEMBERED:
            self._seen.popitem(last=False)
        if rows:
            self._watermark = max(self._watermark, rows[-1].updated_at)
        return len(settled)
