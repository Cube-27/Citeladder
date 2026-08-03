"""Postgres SKIP-LOCKED worker for onboarding brand discovery."""

from __future__ import annotations

import asyncio
import os
import socket
import uuid

from app.core.config.brand_discovery import brand_discovery_settings
from app.core.database import SessionLocal, dispose_engine
from app.domain.projects.discovery import claim_discovery, process_discovery


async def run_once(worker_id: str) -> bool:
    async with SessionLocal() as session:
        row = await claim_discovery(session, worker_id=worker_id)
        if row is None:
            return False
        await process_discovery(session, row)
        return True


async def main() -> None:
    worker_id = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
    try:
        while True:
            if not await run_once(worker_id):
                await asyncio.sleep(brand_discovery_settings.poll_seconds)
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
