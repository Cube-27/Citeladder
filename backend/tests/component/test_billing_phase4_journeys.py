from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.catalog_revisions import (
    approved_phase1_payload,
    create_draft,
    publish_revision,
    seed_phase1_draft,
)
from app.models.billing import AccountGrant, BillingAccount, BillingCatalogRevision
from app.models.billing_journeys import IntroductoryClaim
from app.models.user import User
from tests.component.auth_helpers import register_and_login


async def _admin(session: AsyncSession) -> User:
    actor = User(
        email="phase4-admin@example.com",
        hashed_password=None,
        role="admin",
        is_active=True,
    )
    session.add(actor)
    await session.flush()
    return actor


@pytest.mark.asyncio
async def test_seeded_campaign_is_unavailable_and_cannot_be_claimed(
    client, db_session: AsyncSession
) -> None:
    actor = await _admin(db_session)
    draft = await seed_phase1_draft(
        db_session, actor=actor, reason="phase4 disabled campaign test"
    )
    await publish_revision(
        db_session,
        revision=draft.revision,
        actor=actor,
        reason="publish disabled commercial catalog",
    )
    await db_session.commit()
    await register_and_login(client, "phase4-disabled@example.com")

    offer = await client.get("/api/v1/billing/early-access")
    assert offer.status_code == 200
    assert offer.json()["status"] == "unavailable"
    assert offer.json()["unavailable_reason"] == "campaign_disabled"

    claim = await client.post(
        "/api/v1/billing/early-access/claim",
        headers={"Idempotency-Key": "phase4-disabled-claim"},
        json={
            "campaign_id": offer.json()["campaign_id"],
            "terms_consent": True,
            "data_sharing_consent": True,
        },
    )
    assert claim.status_code == 409
    assert claim.json()["detail"] == "campaign_disabled"
    count = await db_session.scalar(select(func.count()).select_from(IntroductoryClaim))
    assert count == 0


@pytest.mark.asyncio
async def test_enabled_fixture_claim_is_atomic_idempotent_and_lifetime_bounded(
    client, db_session: AsyncSession
) -> None:
    actor = await _admin(db_session)
    cohort_start = datetime.now(UTC) - timedelta(minutes=1)
    payload = approved_phase1_payload()
    payload["campaign"].update(
        {
            "state": "enabled",
            "enabled": True,
            "claim_available": True,
            "cohort_started_at": cohort_start.isoformat(),
            "ends_at": (cohort_start + timedelta(days=1)).isoformat(),
        }
    )
    draft = await create_draft(
        db_session,
        revision="phase4-enabled-test-only",
        payload=payload,
        actor=actor,
        reason="test-only enabled fixture",
    )
    await publish_revision(
        db_session,
        revision=draft.revision,
        actor=actor,
        reason="test enabled claim mechanics",
    )
    await db_session.commit()
    await register_and_login(client, "phase4-eligible@example.com")
    account = await db_session.scalar(
        select(BillingAccount).where(
            BillingAccount.owner_user_id
            == select(User.id)
            .where(User.email == "phase4-eligible@example.com")
            .scalar_subquery()
        )
    )
    assert account is not None

    offer = await client.get("/api/v1/billing/early-access")
    assert offer.status_code == 200
    assert offer.json()["status"] == "available"
    request = {
        "campaign_id": offer.json()["campaign_id"],
        "terms_consent": True,
        "data_sharing_consent": True,
    }
    headers = {"Idempotency-Key": "phase4-once"}
    first = await client.post(
        "/api/v1/billing/early-access/claim", headers=headers, json=request
    )
    replay = await client.post(
        "/api/v1/billing/early-access/claim", headers=headers, json=request
    )
    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json()
    assert first.json()["charged"] is False
    assert first.json()["renews"] is False

    claim = await db_session.scalar(
        select(IntroductoryClaim).where(
            IntroductoryClaim.billing_account_id == account.id
        )
    )
    assert claim is not None
    assert claim.expires_at - claim.claimed_at == timedelta(days=7)
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(AccountGrant)
            .where(AccountGrant.bundle_id == f"intro:{claim.id}")
        )
        > 0
    )

    second = await client.post(
        "/api/v1/billing/early-access/claim",
        headers={"Idempotency-Key": "phase4-second"},
        json=request,
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "lifetime_introduction_consumed"


@pytest.mark.asyncio
async def test_repository_seed_contains_no_enabled_campaign(
    db_session: AsyncSession,
) -> None:
    actor = await _admin(db_session)
    row = await seed_phase1_draft(db_session, actor=actor, reason="seed assertion")
    assert row.payload["campaign"]["enabled"] is False
    assert row.payload["campaign"]["claim_available"] is False
    assert row.payload["campaign"]["state"] == "draft"
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(BillingCatalogRevision)
            .where(BillingCatalogRevision.payload["campaign"]["enabled"].as_boolean())
        )
        == 0
    )
