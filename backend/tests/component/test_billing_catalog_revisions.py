from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.catalog_revisions import (
    create_draft,
    publish_revision,
)
from app.domain.billing.launch_catalog import (
    launch_pricing_v1_payload,
    seed_launch_draft,
)
from app.models.billing import AccountGrant, BillingCatalogRevision
from app.models.user import User


async def _admin(
    session: AsyncSession, email: str = "catalog-admin@example.com"
) -> User:
    actor = User(email=email, hashed_password=None, role="admin", is_active=True)
    session.add(actor)
    await session.flush()
    return actor


@pytest.mark.asyncio
async def test_seed_is_idempotent_and_grants_nothing(db_session: AsyncSession) -> None:
    actor = await _admin(db_session)
    first = await seed_launch_draft(
        db_session, provider_mode=None, actor=actor, reason="approved Phase 1 seed"
    )
    second = await seed_launch_draft(
        db_session, provider_mode=None, actor=actor, reason="approved Phase 1 seed"
    )
    assert first.id == second.id
    assert first.publication_state == "draft"
    assert first.payload["campaign"]["enabled"] is False
    assert await db_session.scalar(select(func.count()).select_from(AccountGrant)) == 0


@pytest.mark.asyncio
async def test_draft_is_not_runtime_published_until_explicit_publication(
    db_session: AsyncSession,
) -> None:
    actor = await _admin(db_session)
    row = await create_draft(
        db_session,
        revision="commercial-test-v1",
        payload=launch_pricing_v1_payload(provider_mode=None),
        actor=actor,
        reason="review",
    )
    assert (
        await db_session.scalar(
            select(BillingCatalogRevision).where(
                BillingCatalogRevision.publication_state == "published"
            )
        )
        is None
    )
    published = await publish_revision(
        db_session,
        revision=row.revision,
        actor=actor,
        reason="approved",
        at=datetime(2026, 9, 8, tzinfo=UTC),
    )
    assert published.publication_state == "published"
    assert published.published_by_user_id == actor.id


@pytest.mark.asyncio
async def test_database_allows_only_one_published_revision(
    db_session: AsyncSession,
) -> None:
    actor = await _admin(db_session)
    first = await create_draft(
        db_session,
        revision="commercial-race-a",
        payload=launch_pricing_v1_payload(provider_mode=None),
        actor=actor,
        reason="a",
    )
    payload = launch_pricing_v1_payload(provider_mode=None)
    payload["contact_sales_url"] = "https://www.cube27.com/contact/sales/"
    second = await create_draft(
        db_session,
        revision="commercial-race-b",
        payload=payload,
        actor=actor,
        reason="b",
    )
    first.publication_state = "published"
    second.publication_state = "published"
    with pytest.raises(IntegrityError):
        await db_session.flush()
