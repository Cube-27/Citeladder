"""Idempotently seed Free billing sponsorship for existing owner accounts."""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.database import SessionLocal
from app.domain.billing.bootstrap import ensure_user_billing
from app.models.user import User


async def _run() -> None:
    async with SessionLocal() as session:
        users = (await session.scalars(select(User).order_by(User.created_at))).all()
        for user in users:
            await ensure_user_billing(session, user)
        await session.commit()
        print(f"billing bootstrap verified for {len(users)} users")


if __name__ == "__main__":
    asyncio.run(_run())
