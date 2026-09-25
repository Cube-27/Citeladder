# Agent worker: claims agent runs and executes one bounded turn each.
#
# A separate process (the ``agent-worker`` compose service). Claims go through
# the generic ``PostgresTaskQueue`` (``FOR UPDATE SKIP LOCKED``; the claim
# commits before any network I/O -- invariant 15) and a heartbeat renews the
# lease while the turn's model calls and tool reads run. The runtime owns the
# loop and every terminal write; this process only sequences it and decides
# between a retry and a terminal failure when a step cannot be dispatched.
from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.agent.factory import create_model_gateway
from app.connectors.agent.gateway import ModelGateway
from app.connectors.app_model_config import AppModelRouteConfig
from app.core.config.agent import (
    AGENT_HEARTBEAT_SECONDS,
    AGENT_QUEUE_SPEC,
    AGENT_WORKER_POLL_SECONDS,
    ERROR_FUNDING,
    ERROR_PROVIDER,
    default_agent_settings,
)
from app.core.database import SessionLocal
from app.core.telemetry import configure_logging, instrument_worker
from app.domain.agent.model_calls import (
    ModelUnavailableError,
    agent_reclaim_accounting,
    lock_owned_run,
    reconcile_stale_cancelled_model_attempts,
)
from app.domain.agent.runtime import GatewayFactory, RuntimeDeps, execute_run, fail_run
from app.domain.agent.tool_catalog import build_agent_tools
from app.models.agent import AgentRun
from app.orchestration.postgres_task_queue import PostgresTaskQueue
from app.workers.drain import DrainableWorkerMixin

logger = logging.getLogger("app.workers.agent_worker")


def _default_gateway(route: AppModelRouteConfig | None) -> ModelGateway:
    return create_model_gateway(app_route=route)


class AgentWorker(DrainableWorkerMixin):
    """Claim/lease loop for ``AgentRun`` rows.

    ``gateway_for`` is the test seam: a scripted fake gateway runs the real
    loop without a network. Production builds the configured gateway.
    """

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        owner: str | None = None,
        gateway_for: GatewayFactory | None = None,
    ) -> None:
        self._session_factory = session_factory or SessionLocal
        self._queue = PostgresTaskQueue(
            self._session_factory,
            AGENT_QUEUE_SPEC,
            reclaim_accounting=agent_reclaim_accounting,
        )
        self._deps = RuntimeDeps(
            session_factory=self._session_factory,
            tools=build_agent_tools(self._session_factory),
            gateway_for=gateway_for or _default_gateway,
        )
        self.owner = owner or f"agent-worker-{uuid.uuid4().hex[:12]}"

    async def run_once(self) -> int:
        """Sweep expired leases, claim one run, execute it. Returns count run."""
        await self._queue.release_expired()
        await reconcile_stale_cancelled_model_attempts(self._session_factory)
        rows = await self._queue.claim(owner=self.owner, limit=1)
        for row in rows:
            await self._execute(row.id)
        return len(rows)

    async def run_forever(self) -> None:  # pragma: no cover - process loop
        logger.info("agent worker started", extra={"owner": self.owner})
        while True:
            try:
                ran = await self.run_once()
            except Exception:
                logger.exception("agent worker loop iteration failed")
                ran = 0
            if ran == 0:
                await asyncio.sleep(AGENT_WORKER_POLL_SECONDS)

    async def _start(self, run_id: uuid.UUID) -> int | None:
        """Mark the claimed run running and count this attempt at the turn."""
        if not await self._queue.mark_running(task_id=run_id, owner=self.owner):
            return None
        async with self._session_factory() as session:
            run = await lock_owned_run(session, run_id=run_id, owner=self.owner)
            if run is None:
                await session.rollback()
                return None
            run.attempt_count += 1
            attempt = run.attempt_count
            await session.commit()
            return attempt

    async def _execute(self, run_id: uuid.UUID) -> None:
        attempt = await self._start(run_id)
        if attempt is None:
            return
        heartbeat = asyncio.create_task(self._heartbeat_loop(run_id))
        try:
            await execute_run(self._deps, run_id=run_id, owner=self.owner)
        except ModelUnavailableError as exc:
            await self._unavailable(run_id, attempt=attempt, exc=exc)
        except Exception as exc:
            logger.exception("agent run crashed", extra={"run_id": str(run_id)})
            async with self._session_factory() as session:
                await fail_run(
                    session,
                    run_id=run_id,
                    owner=self.owner,
                    code=ERROR_PROVIDER,
                    detail=f"worker crash: {type(exc).__name__}",
                )
        finally:
            heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat

    async def _unavailable(
        self, run_id: uuid.UUID, *, attempt: int, exc: ModelUnavailableError
    ) -> None:
        if exc.reason == "lease":
            return  # cancelled or reclaimed: another owner (or nobody) acts now
        async with self._session_factory() as session:
            if exc.reason == "funding":
                await fail_run(
                    session,
                    run_id=run_id,
                    owner=self.owner,
                    code=ERROR_FUNDING,
                    detail="The Agent could not be funded for this turn.",
                )
                return
            run = await session.get(AgentRun, run_id)
            max_attempts = run.max_attempts if run is not None else attempt
            await session.rollback()
            retryable = exc.cause is not None and bool(
                getattr(exc.cause, "retryable", False)
            )
            if retryable and attempt < max_attempts:
                await self._queue.retry(
                    task_id=run_id,
                    owner=self.owner,
                    delay_seconds=default_agent_settings.retry_delay(attempt),
                    error_code=ERROR_PROVIDER,
                    error_detail="The model call failed; retrying this turn.",
                )
                return
            await fail_run(
                session,
                run_id=run_id,
                owner=self.owner,
                code=ERROR_PROVIDER,
                detail="The model call failed.",
            )

    async def _heartbeat_loop(
        self, run_id: uuid.UUID
    ) -> None:  # pragma: no cover - timing loop
        while True:
            await asyncio.sleep(AGENT_HEARTBEAT_SECONDS)
            try:
                await self._queue.heartbeat(task_id=run_id, owner=self.owner)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "agent heartbeat failed", extra={"run_id": str(run_id)}
                )


def main() -> None:  # pragma: no cover - process entrypoint
    configure_logging()
    instrument_worker("agent-worker")
    asyncio.run(AgentWorker().run_forever())


if __name__ == "__main__":  # pragma: no cover
    main()
