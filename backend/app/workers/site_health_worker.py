# Site Health crawl maintenance: lease sweeping and crawl reconciliation.
#
# The TypeScript Site Health worker claims and executes every SiteCrawlTask
# kind. Until crawl control moves (PR 18b5) this process keeps the crawl
# lifecycle: it releases expired leases, replays the per-task reconcile for
# tasks TypeScript settled, rescues stalled and overdue crawls, and finalizes
# them. It performs no network I/O and claims no tasks.
from __future__ import annotations

import asyncio
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.site_health_runtime import (
    SITE_CRAWL_QUEUE_SPEC,
    site_health_settings,
)
from app.core.database import SessionLocal
from app.core.telemetry import configure_logging, instrument_worker
from app.models.site_health.queue import SiteCrawlTask
from app.orchestration.postgres_task_queue import PostgresTaskQueue
from app.workers.drain import DrainableWorkerMixin
from app.workers.site_health import CrawlLifecycle
from app.workers.site_health.ts_analysis_reconcile import TsAnalysisReconciler

logger = logging.getLogger("app.workers.site_health_worker")


class SiteHealthWorker(DrainableWorkerMixin):
    """Owns crawl maintenance over the shared ``SiteCrawlTask`` queue."""

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        owner: str | None = None,
    ) -> None:
        self._session_factory = session_factory or SessionLocal
        self._queue: PostgresTaskQueue[SiteCrawlTask] = PostgresTaskQueue(
            self._session_factory, SITE_CRAWL_QUEUE_SPEC
        )
        self.owner = owner or f"site-worker-{uuid.uuid4().hex[:12]}"
        self._lifecycle = CrawlLifecycle(self._session_factory)
        self._ts_tasks = TsAnalysisReconciler(self._session_factory, self._lifecycle)

    async def run_once(self) -> int:
        """Run one maintenance pass; returns the number of tasks it reconciled."""
        sweep = await self._queue.release_expired_detailed(
            batch_size=site_health_settings.lease_reclaim_batch_size
        )
        for crawl_id in sweep.failed_parent_ids:
            await self._lifecycle.reconcile(crawl_id)
        reconciled = await self._ts_tasks.reconcile()
        await self._lifecycle.reconcile_stalled()
        await self._lifecycle.reconcile_overdue()
        return reconciled

    async def run_forever(self) -> None:  # pragma: no cover - long-running loop
        logger.info("site health maintenance started", extra={"owner": self.owner})
        while True:
            try:
                await self.run_once()
            except Exception:  # maintenance must not kill the worker
                logger.exception("site health maintenance failed")
            await asyncio.sleep(max(0.05, site_health_settings.poll_interval_seconds))


def main() -> None:  # pragma: no cover - process entrypoint
    configure_logging()
    instrument_worker("site-health-worker")
    asyncio.run(SiteHealthWorker().run_forever())


if __name__ == "__main__":  # pragma: no cover
    main()
