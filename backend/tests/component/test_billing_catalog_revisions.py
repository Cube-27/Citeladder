from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.catalog_revisions import (
    approved_phase1_payload,
    create_draft,
    publish_revision,
    seed_phase1_draft,
)
from app.domain.billing.service import resolve_base_intent
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
    first = await seed_phase1_draft(
        db_session, actor=actor, reason="approved Phase 1 seed"
    )
    second = await seed_phase1_draft(
        db_session, actor=actor, reason="approved Phase 1 seed"
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
        payload=approved_phase1_payload(),
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
        payload=approved_phase1_payload(),
        actor=actor,
        reason="a",
    )
    payload = approved_phase1_payload()
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


@pytest.mark.asyncio
async def test_purchase_intent_reads_the_persisted_catalog_revision(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    actor = await _admin(db_session, "persisted-intent@example.com")
    payload = approved_phase1_payload()
    plans = payload["plans"]
    assert isinstance(plans, list)
    tier_1 = plans[0]
    assert isinstance(tier_1, dict)
    byok_price = tier_1["byok_price"]
    assert isinstance(byok_price, dict)
    byok_price["provider_price_ref"] = "plan_persisted_revision"
    row = await create_draft(
        db_session,
        revision="persisted-commercial-v1",
        payload=payload,
        actor=actor,
        reason="prove runtime ownership",
    )
    await publish_revision(
        db_session, revision=row.revision, actor=actor, reason="approved"
    )
    await db_session.commit()
    monkeypatch.setattr(
        "app.domain.billing.service.plan_checkout_availability",
        lambda _plan, _region: (True, None),
    )

    from pydantic import SecretStr

    from app.core.config.billing_settings import billing_settings

    monkeypatch.setattr(
        billing_settings, "quote_signing_secret", SecretStr("synthetic-quote")
    )
    intent = await resolve_base_intent(
        db_session,
        catalog_key="tier_1",
        credential_mode="byok",
        country_code="US",
        at=datetime(2026, 9, 8, tzinfo=UTC),
    )

    assert intent.quote.catalog_revision == "persisted-commercial-v1"
    assert intent.price_ref == "plan_persisted_revision"
