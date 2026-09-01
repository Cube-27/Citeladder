from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import verify_password
from app.demo.bootstrap import ensure_demo_account
from app.domain.auth.service import register_user
from app.models.user import User


def _demo_settings() -> Settings:
    return Settings(
        APP_ENV="production",
        DEMO_MODE=True,
        DEMO_EXPIRES_AT=datetime.now(UTC) + timedelta(days=7),
        DEV_LOGIN_EMAIL="dev@citeladder.com",
        DEV_LOGIN_PASSWORD="demo-password-with-more-than-thirty-two-random-characters-123",
        JWT_SECRET_KEY="jwt-independent-production-secret-with-more-than-thirty-two-characters",
        ENCRYPTION_KEY="encryption-independent-production-secret-more-than-thirty-two-characters",
        REFERRAL_HASH_SALT="referral-independent-production-secret-with-more-than-thirty-two-characters",
        DATABASE_URL="postgresql+asyncpg://citeladder:database-independent-password-123456789@db/citeladder",
        DB_SSL_MODE="require",
        TRUSTED_PROXY_CIDRS="127.0.0.1/32",
    )


@pytest.mark.asyncio
async def test_demo_bootstrap_creates_and_resets_one_account(
    db_session: AsyncSession,
) -> None:
    candidate = _demo_settings()
    await ensure_demo_account(db_session, candidate)
    users = list((await db_session.scalars(select(User))).all())
    assert len(users) == 1
    assert users[0].email == candidate.dev_login_email
    assert verify_password(candidate.dev_login_password, users[0].hashed_password)

    original_version = users[0].session_version
    await ensure_demo_account(db_session, candidate)
    users = list((await db_session.scalars(select(User))).all())
    assert len(users) == 1
    assert users[0].session_version == original_version + 1


@pytest.mark.asyncio
async def test_demo_bootstrap_rejects_unexpected_account(
    db_session: AsyncSession,
) -> None:
    await register_user(db_session, "other@example.com", "password123")
    with pytest.raises(RuntimeError, match="only the configured account"):
        await ensure_demo_account(db_session, _demo_settings())
