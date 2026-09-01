"""Idempotently provision the one allowed demo account."""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, settings, validate_production_security
from app.core.database import SessionLocal, dispose_engine
from app.core.security import hash_password
from app.domain.auth.service import register_user
from app.models.user import User


async def ensure_demo_account(
    session: AsyncSession,
    candidate: Settings = settings,
) -> None:
    """Create or reset the sole configured demo account in ``session``."""
    if not candidate.demo_mode:
        raise RuntimeError("DEMO_MODE must be true for demo account bootstrap")
    issues = validate_production_security(candidate)
    if issues:
        raise RuntimeError("Unsafe demo configuration: " + "; ".join(issues))

    users = list((await session.scalars(select(User).order_by(User.created_at))).all())
    expected_email = candidate.dev_login_email.strip().lower()
    if not users:
        created = await register_user(
            session,
            expected_email,
            candidate.dev_login_password,
        )
        if created is None:
            raise RuntimeError("Demo account creation lost a concurrent race")
        return
    if len(users) != 1 or users[0].email.lower() != expected_email:
        raise RuntimeError("Demo database must contain only the configured account")

    user = users[0]
    user.hashed_password = hash_password(candidate.dev_login_password)
    user.is_active = True
    user.session_version += 1
    await session.commit()


async def bootstrap_demo_account() -> None:
    async with SessionLocal() as session:
        await ensure_demo_account(session)


async def _main() -> None:
    try:
        await bootstrap_demo_account()
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(_main())
