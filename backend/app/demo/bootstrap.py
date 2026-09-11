"""Idempotently provision the configured deployment login."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import (
    DEVELOPMENT_ENV_NAMES,
    Settings,
    settings,
    validate_production_security,
)
from app.core.config.entitlements import KEY_MONITORED_URLS
from app.core.database import SessionLocal, dispose_engine
from app.core.security import hash_password, verify_password
from app.domain.auth.service import get_user_by_email, register_user
from app.domain.billing.bootstrap import (
    ensure_initial_catalog,
    owned_workspace_account,
    provision_development_access,
)
from app.domain.entitlements.grants import issue_override_bundle
from app.domain.entitlements.types import GrantSpec
from app.domain.workspaces.service import ensure_personal_workspace
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
        user = await register_user(
            session,
            expected_email,
            candidate.dev_login_password,
            provision_access=False,
        )
        if user is None:
            raise RuntimeError("Demo account creation lost a concurrent race")
    else:
        if len(users) != 1 or users[0].email.lower() != expected_email:
            raise RuntimeError("Demo database must contain only the configured account")
        user = users[0]
        user.hashed_password = hash_password(candidate.dev_login_password)
        user.is_active = True
        user.session_version += 1

    # The workspace must exist before its account can be resolved. Registration
    # provisions one for a fresh database, but a RESET reuses an existing user
    # row, which may predate the workspace-owned billing account.
    await ensure_personal_workspace(session, user)
    account = await owned_workspace_account(session, user, provision_access=False)
    expires_at = candidate.demo_expires_at
    if expires_at is None:  # validate_production_security rejects this first
        raise RuntimeError("Demo expiry is required for entitlement provisioning")
    await issue_override_bundle(
        session,
        operator_user=user,
        account_id=account.id,
        grants=(
            GrantSpec(
                key=KEY_MONITORED_URLS,
                value=candidate.demo_monitored_url_limit,
            ),
        ),
        reason="temporary demo monitored URL allowance",
        valid_from=datetime.now(UTC),
        valid_until=expires_at,
        idempotency_key=(
            f"demo-bootstrap:monitored-urls:{candidate.demo_monitored_url_limit}"
        ),
    )
    await session.commit()


async def ensure_configured_dev_account(
    session: AsyncSession,
    candidate: Settings = settings,
) -> None:
    """Provision and rotate the configured dev login in a public deployment."""
    if candidate.demo_mode:
        raise RuntimeError("Public dev-account bootstrap requires DEMO_MODE=false")
    issues = (
        []
        if candidate.app_env.strip().lower() in DEVELOPMENT_ENV_NAMES
        else validate_production_security(candidate)
    )
    if issues:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(issues))

    email = candidate.dev_login_email.strip().lower()
    user = await get_user_by_email(session, email)
    if user is None:
        user = await register_user(
            session,
            email,
            candidate.dev_login_password,
            role="admin",
        )
        if user is None:
            user = await get_user_by_email(session, email)
        if user is None:
            raise RuntimeError("Configured dev-account registration did not persist")

    if user.hashed_password is None or not verify_password(
        candidate.dev_login_password, user.hashed_password
    ):
        user.hashed_password = hash_password(candidate.dev_login_password)
        user.session_version += 1
    user.is_active = True
    user.role = "admin"
    await ensure_personal_workspace(session, user)
    account = await owned_workspace_account(session, user)
    await provision_development_access(
        session,
        user=user,
        account=account,
        allowance=candidate.dev_login_counter_allowance,
    )
    await ensure_initial_catalog(session, operator=user)
    await session.commit()


async def bootstrap_demo_account() -> None:
    if (
        settings.app_env.strip().lower() in DEVELOPMENT_ENV_NAMES
        and not settings.dev_login_password
        and not settings.demo_mode
    ):
        print(
            "Development login bootstrap skipped: DEV_LOGIN_PASSWORD is not configured."
        )
        return
    async with SessionLocal() as session:
        if settings.demo_mode:
            await ensure_demo_account(session)
        else:
            await ensure_configured_dev_account(session)


async def _main() -> None:
    try:
        await bootstrap_demo_account()
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(_main())
