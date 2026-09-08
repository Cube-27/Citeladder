"""Durable worker for bounded Growth Agent narration tasks."""

from __future__ import annotations

import asyncio
import logging
import signal
import uuid
from datetime import UTC, datetime

from app.connectors.agent.factory import create_model_gateway
from app.core.config.agent import default_agent_settings
from app.core.config.app_models import APP_FEATURE_GROWTH_AGENT
from app.core.database import SessionLocal, dispose_engine
from app.core.telemetry import configure_logging, instrument_worker
from app.domain.agent.service import claim_task, execute_claimed_task
from app.domain.providers.app_routes import (
    AppModelRouteUnavailableError,
    resolve_app_model_route,
)

logger = logging.getLogger(__name__)


class AgentWorker:
    def __init__(self, *, owner: str | None = None) -> None:
        self._owner = owner or f"agent-{uuid.uuid4().hex[:12]}"
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def run_once(self) -> int:
        async with SessionLocal() as session:
            run = await claim_task(
                session,
                owner=self._owner,
                lease_seconds=default_agent_settings.execution_timeout_seconds + 30,
            )
            if run is None:
                return 0
            route = None
            if hasattr(run, "workspace_id"):
                try:
                    route = await resolve_app_model_route(
                        session,
                        workspace_id=run.workspace_id,
                        feature=APP_FEATURE_GROWTH_AGENT,
                        at=datetime.now(UTC),
                    )
                    gateway = create_model_gateway(app_route=route)
                except AppModelRouteUnavailableError:
                    gateway = None
            elif default_agent_settings.configured:
                gateway = create_model_gateway()
            else:
                gateway = None
            if route is None:
                await execute_claimed_task(
                    session, run=run, owner=self._owner, gateway=gateway
                )
            else:
                await execute_claimed_task(
                    session,
                    run=run,
                    owner=self._owner,
                    gateway=gateway,
                    app_route=route,
                )
            return 1

    async def run_forever(self) -> None:
        while not self._stop.is_set():
            try:
                changed = await self.run_once()
            except Exception:
                logger.exception("agent worker iteration failed")
                changed = 0
            if changed:
                continue
            try:
                await asyncio.wait_for(
                    self._stop.wait(),
                    timeout=default_agent_settings.reconcile_poll_seconds,
                )
            except TimeoutError:
                pass


async def _main() -> None:
    worker = AgentWorker()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signum, worker.stop)
        except NotImplementedError:
            pass
    try:
        await worker.run_forever()
    finally:
        await dispose_engine()


def main() -> None:  # pragma: no cover
    configure_logging()
    instrument_worker("agent-worker")
    asyncio.run(_main())


if __name__ == "__main__":  # pragma: no cover
    main()
