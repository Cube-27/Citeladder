"""Shared HTTP authentication setup for component tests."""

from __future__ import annotations

import httpx


async def register_and_login(
    client: httpx.AsyncClient, email: str, password: str = "password123"
) -> None:
    """Seed persisted identity/session; Python component tests do not serve auth."""
    from app.core.config import settings
    from app.core.database import get_session
    from app.core.security import create_access_token
    from app.domain.auth.service import get_user_by_email, register_user
    from app.main import app

    async for session in app.dependency_overrides[get_session]():
        user = await get_user_by_email(session, email)
        if user is None:
            user = await register_user(session, email, password)
        assert user is not None
        token = create_access_token(str(user.id), token_version=user.session_version)
        client.cookies.set(settings.session_cookie_name, token)


async def grant_test_capabilities(email: str) -> None:
    """Explicit entitlement fixture; public authentication never grants these."""
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.core.config.entitlements import CAPABILITY_REGISTRY, CapabilityType
    from app.core.database import get_session
    from app.domain.entitlements.grants import issue_grant_bundle
    from app.domain.entitlements.types import GrantSpec
    from app.main import app
    from app.models.billing import BillingAccount
    from app.models.user import User

    async for session in app.dependency_overrides[get_session]():
        account = await session.scalar(
            select(BillingAccount)
            .join(User, User.id == BillingAccount.owner_user_id)
            .where(User.email == email)
        )
        assert account is not None
        grants = tuple(
            GrantSpec(
                key=c.key,
                value=1
                if c.capability_type is CapabilityType.FLAG
                else len(c.ordered_values) - 1
                if c.capability_type is CapabilityType.LEVEL
                else 1000,
            )
            for c in CAPABILITY_REGISTRY.entries
            if c.issuable
        )
        await issue_grant_bundle(
            session,
            account_id=account.id,
            source_kind="override",
            source_ref="test:explicit-access",
            grants=grants,
            catalog_revision=CAPABILITY_REGISTRY.revision,
            idempotency_key="test:explicit-access",
            valid_from=datetime.now(UTC),
            valid_until=None,
            bundle_role="primary",
            profile_key="development",
            profile_priority=100,
        )
        await session.commit()


async def invalidate_session(client: httpx.AsyncClient) -> None:
    """Model an auth-owner logout for consumers that must reject stale sessions."""
    import uuid

    from sqlalchemy import select

    from app.core.config import settings
    from app.core.database import get_session
    from app.core.security import decode_access_token
    from app.main import app
    from app.models.user import User

    token = client.cookies.get(settings.session_cookie_name)
    assert token is not None
    user_id = uuid.UUID(str(decode_access_token(token)["sub"]))
    async for session in app.dependency_overrides[get_session]():
        user = await session.scalar(select(User).where(User.id == user_id))
        assert user is not None
        user.session_version += 1
        await session.commit()
    client.cookies.clear()


async def workspace_ids_for_session(client: httpx.AsyncClient) -> list[str]:
    """Persisted membership fixture lookup for remaining Python consumers."""
    from app.core.config import settings
    from app.core.database import get_session
    from app.domain.auth.service import resolve_session_user
    from app.domain.workspaces.service import list_workspaces_for_user
    from app.main import app

    token = client.cookies.get(settings.session_cookie_name)
    assert token is not None
    async for session in app.dependency_overrides[get_session]():
        user = await resolve_session_user(session, token)
        assert user is not None
        return [
            str(workspace.id)
            for workspace, _ in await list_workspaces_for_user(session, user)
        ]
    raise AssertionError("test session unavailable")
