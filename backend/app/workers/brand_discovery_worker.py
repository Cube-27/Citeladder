"""Postgres SKIP-LOCKED worker for onboarding brand discovery."""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket
import uuid

from app.core.config.brand_discovery import brand_discovery_settings
from app.core.database import SessionLocal, dispose_engine
from app.domain.projects.discovery import (
    claim_discovery,
    process_discovery,
    reap_exhausted_discoveries,
)

logger = logging.getLogger(__name__)


async def run_once(worker_id: str) -> bool:
    async with SessionLocal() as session:
        await reap_exhausted_discoveries(session)
        row = await claim_discovery(session, worker_id=worker_id)
        if row is None:
            return False
        await process_discovery(session, row)
        return True


def _install_shutdown_handler(shutdown: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    try:
        loop.add_signal_handler(signal.SIGTERM, shutdown.set)
    except (NotImplementedError, RuntimeError):
        signal.signal(
            signal.SIGTERM,
            lambda *_: loop.call_soon_threadsafe(shutdown.set),
        )


async def _run_loop(worker_id: str, shutdown: asyncio.Event) -> None:
    while not shutdown.is_set():
        try:
            processed = await run_once(worker_id)
        except asyncio.CancelledError:
            shutdown.set()
            break
        except Exception:
            logger.exception("Brand discovery worker iteration failed")
            processed = False
        if not processed and not shutdown.is_set():
            await asyncio.sleep(brand_discovery_settings.poll_seconds)


async def main() -> None:
    worker_id = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
    shutdown = asyncio.Event()
    _install_shutdown_handler(shutdown)
    try:
        await _run_loop(worker_id, shutdown)
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
