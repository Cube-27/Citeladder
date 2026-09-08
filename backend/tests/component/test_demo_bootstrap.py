from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.config.entitlements import GRANT_SOURCE_OVERRIDE, KEY_MONITORED_URLS
from app.core.security import verify_password
from app.demo.bootstrap import ensure_configured_dev_account, ensure_demo_account
from app.domain.auth.service import register_user
from app.models.billing import AccountGrant, BillingCatalogRevision
from app.models.site_health.runtime import WorkspaceSiteHealthRuntime
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
    grants = list((await db_session.scalars(select(AccountGrant))).all())
    assert len(grants) == 1
    assert grants[0].key == KEY_MONITORED_URLS
    assert grants[0].value == 50_000
    assert grants[0].source_kind == GRANT_SOURCE_OVERRIDE
    assert grants[0].valid_until == candidate.demo_expires_at
    runtime = await db_session.scalar(select(WorkspaceSiteHealthRuntime))
    assert runtime is not None
    assert runtime.discovery_mode == "full"
    assert runtime.monitored_url_limit == 50_000

    original_version = users[0].session_version
    await ensure_demo_account(db_session, candidate)
    users = list((await db_session.scalars(select(User))).all())
    assert len(users) == 1
    assert users[0].session_version == original_version + 1
    assert len(list((await db_session.scalars(select(AccountGrant))).all())) == 1


@pytest.mark.asyncio
async def test_demo_bootstrap_rejects_unexpected_account(
    db_session: AsyncSession,
) -> None:
    await register_user(db_session, "other@example.com", "password123")
    with pytest.raises(RuntimeError, match="only the configured account"):
        await ensure_demo_account(db_session, _demo_settings())


@pytest.mark.asyncio
async def test_public_bootstrap_rotates_only_the_configured_dev_account(
    db_session: AsyncSession,
) -> None:
    await register_user(db_session, "other@example.com", "password123")
    dev_user = await register_user(
        db_session,
        "dev@citeladder.com",
        "old-development-password-with-thirty-two-characters",
    )
    assert dev_user is not None
    original_version = dev_user.session_version
    candidate = _demo_settings().model_copy(update={"demo_mode": False})

    await ensure_configured_dev_account(db_session, candidate)

    users = list((await db_session.scalars(select(User))).all())
    assert {user.email for user in users} == {
        "dev@citeladder.com",
        "other@example.com",
    }
    refreshed = next(user for user in users if user.email == "dev@citeladder.com")
    assert verify_password(candidate.dev_login_password, refreshed.hashed_password)
    assert refreshed.session_version == original_version + 1
    assert refreshed.role == "admin"


@pytest.mark.asyncio
async def test_empty_public_bootstrap_creates_login_and_published_pricing_once(
    db_session: AsyncSession,
) -> None:
    candidate = _demo_settings().model_copy(update={"demo_mode": False})
    await ensure_configured_dev_account(db_session, candidate)
    user = await db_session.scalar(select(User))
    assert user is not None and user.role == "admin"
    assert verify_password(candidate.dev_login_password, user.hashed_password)
    catalog = await db_session.scalar(select(BillingCatalogRevision))
    assert catalog is not None and catalog.publication_state == "published"
    assert catalog.published_by_user_id == user.id
    assert catalog.payload["checkout_enabled"] is False
    assert len(catalog.payload["plans"]) == 4
    assert catalog.payload["campaign"]["enabled"] is False
    original_publication = catalog.published_at
    await ensure_configured_dev_account(db_session, candidate)
    catalogs = list((await db_session.scalars(select(BillingCatalogRevision))).all())
    assert len(catalogs) == 1
    assert catalogs[0].published_at == original_publication


@pytest.mark.asyncio
async def test_local_bootstrap_uses_development_transport_policy(
    db_session: AsyncSession,
) -> None:
    candidate = Settings(
        APP_ENV="development",
        DEV_LOGIN_EMAIL="local-dev@example.com",
        DEV_LOGIN_PASSWORD="local-password-123",
        DB_SSL_MODE="disable",
        TRUSTED_PROXY_CIDRS="",
    )
    await ensure_configured_dev_account(db_session, candidate)
    user = await db_session.scalar(
        select(User).where(User.email == candidate.dev_login_email)
    )
    assert user is not None and verify_password(
        candidate.dev_login_password, user.hashed_password
    )
    assert await db_session.scalar(select(BillingCatalogRevision.id)) is not None
