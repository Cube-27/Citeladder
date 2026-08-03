"""Postgres SKIP-LOCKED worker for onboarding brand discovery."""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.brand_discovery import brand_discovery_settings
from app.core.database import SessionLocal, dispose_engine
from app.domain.projects.discovery import (
    claim_discovery,
    process_discovery,
    reap_exhausted_discoveries,
)
from app.models.discovery import BrandDiscovery

logger = logging.getLogger(__name__)


async def _claim_after_optional_reap(
    session: AsyncSession, *, worker_id: str, reap: bool
) -> BrandDiscovery | None:
    if reap:
        await reap_exhausted_discoveries(session)
    return await claim_discovery(session, worker_id=worker_id)


async def run_once(worker_id: str, *, reap: bool = False) -> bool:
    async with SessionLocal() as session:
        row = await _claim_after_optional_reap(session, worker_id=worker_id, reap=reap)
        if row is None:
            return False
        await process_discovery(session, row)
        return True


def _set_fallback_signal(
    loop: asyncio.AbstractEventLoop,
    shutdown: asyncio.Event,
    shutdown_signal: signal.Signals,
) -> None:
    signal.signal(
        shutdown_signal,
        lambda *_: loop.call_soon_threadsafe(shutdown.set),
    )


def _install_fallback_shutdown_handler(
    loop: asyncio.AbstractEventLoop, shutdown: asyncio.Event
) -> None:
    try:
        _set_fallback_signal(loop, shutdown, signal.SIGTERM)
        _set_fallback_signal(loop, shutdown, signal.SIGINT)
    except ValueError:
        logger.warning("SIGTERM handler unavailable outside the main thread")


def _install_loop_shutdown_handlers(
    loop: asyncio.AbstractEventLoop, shutdown: asyncio.Event
) -> None:
    for shutdown_signal in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(shutdown_signal, shutdown.set)


def _install_shutdown_handler(shutdown: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    try:
        _install_loop_shutdown_handlers(loop, shutdown)
    except RuntimeError:
        _install_fallback_shutdown_handler(loop, shutdown)


def _log_iteration_failure(consecutive_failures: int) -> None:
    if consecutive_failures == 1:
        logger.exception("Brand discovery worker iteration failed")
        return
    logger.error(
        "Brand discovery worker iteration still failing",
        extra={"consecutive_failures": consecutive_failures},
    )


async def _attempt_iteration(
    worker_id: str,
    shutdown: asyncio.Event,
    *,
    reap: bool,
    consecutive_failures: int,
) -> tuple[bool, int]:
    try:
        return await run_once(worker_id, reap=reap), 0
    except asyncio.CancelledError:
        shutdown.set()
        raise
    except Exception:
        failures = consecutive_failures + 1
        _log_iteration_failure(failures)
        return False, failures


def _idle_delay(consecutive_failures: int) -> float:
    if not consecutive_failures:
        return brand_discovery_settings.poll_seconds
    return min(
        brand_discovery_settings.poll_seconds * 2 ** (consecutive_failures - 1),
        brand_discovery_settings.failure_backoff_max_seconds,
    )


async def _run_loop(worker_id: str, shutdown: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    next_reap_at = 0.0
    consecutive_failures = 0
    while not shutdown.is_set():
        reap = loop.time() >= next_reap_at
        if reap:
            next_reap_at = (
                loop.time() + brand_discovery_settings.reaper_interval_seconds
            )
        processed, consecutive_failures = await _attempt_iteration(
            worker_id,
            shutdown,
            reap=reap,
            consecutive_failures=consecutive_failures,
        )
        if not processed and not shutdown.is_set():
            await asyncio.sleep(_idle_delay(consecutive_failures))


async def main() -> None:
    worker_id = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
    shutdown = asyncio.Event()
    _install_shutdown_handler(shutdown)
    try:
        await _run_loop(worker_id, shutdown)
    finally:
        await asyncio.shield(dispose_engine())


if __name__ == "__main__":
    asyncio.run(main())
