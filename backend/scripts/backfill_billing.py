"""Idempotently seed the Free baseline for every owned workspace account."""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.database import SessionLocal
from app.domain.billing.bootstrap import ensure_billing_for_user_workspaces
from app.models.user import User


async def _run() -> None:
    async with SessionLocal() as session:
        users = (await session.scalars(select(User).order_by(User.created_at))).all()
        for user in users:
            await ensure_billing_for_user_workspaces(session, user)
        await session.commit()
        print(f"billing bootstrap verified for {len(users)} users")


if __name__ == "__main__":
    asyncio.run(_run())
