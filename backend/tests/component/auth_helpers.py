"""Shared HTTP authentication setup for component tests."""

from __future__ import annotations

import httpx


async def register_and_login(
    client: httpx.AsyncClient, email: str, password: str = "password123"
) -> None:
    registration = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    assert registration.status_code == 202
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200


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
