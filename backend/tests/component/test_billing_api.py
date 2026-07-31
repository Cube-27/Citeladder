"""Component tests for the v8 billing surface: cancel + Razorpay webhooks.

The v6 catalog/quote/checkout/workspace-entitlement routes are deleted; what
remains is ``POST /billing/cancel`` and the signed webhook ingress driving the
lifecycle projector (``apply_subscription_state``): stale rejection, the
account ``entitlement_lifecycle_version`` bump per accepted event, one
idempotent period grant bundle (via the monkeypatched
``plan_period_grant_specs`` catalog seam), deterministic terminal revocations,
and the synchronous Site Health runtime re-projection.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import billing as billing_api
from app.connectors.billing.base import ProviderSubscription
from app.core.config.billing import billing_settings
from app.core.config.entitlements import (
    GRANT_SOURCE_PLAN,
    KEY_MONITORED_URLS,
)
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingSubscription,
    BillingWebhookEvent,
    GrantRevocation,
)
from app.models.site_health import WorkspaceSiteHealthRuntime

_SECRET = "component-webhook-secret"


async def _register(client: httpx.AsyncClient, email: str) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201


def _sign(raw: bytes) -> str:
    return hmac.new(_SECRET.encode(), raw, hashlib.sha256).hexdigest()


def _webhook_payload(
    *,
    external_id: str,
    status: str,
    updated_at: int,
    current_start: int | None = None,
    current_end: int | None = None,
    cancel_at_cycle_end: bool = False,
) -> bytes:
    entity: dict[str, object] = {
        "id": external_id,
        "status": status,
        "updated_at": updated_at,
    }
    if current_start is not None:
        entity["current_start"] = current_start
    if current_end is not None:
        entity["current_end"] = current_end
    if cancel_at_cycle_end:
        entity["cancel_at_cycle_end"] = True
    return json.dumps(
        {
            "event": f"subscription.{status if status != 'active' else 'activated'}",
            "created_at": updated_at,
            "payload": {"subscription": {"entity": entity}},
        },
        separators=(",", ":"),
    ).encode()


async def _post_webhook(
    client: httpx.AsyncClient, raw: bytes, *, event_id: str
) -> httpx.Response:
    return await client.post(
        "/api/v1/billing/webhooks/razorpay",
        content=raw,
        headers={
            "X-Razorpay-Signature": _sign(raw),
            "X-Razorpay-Event-Id": event_id,
            "Content-Type": "application/json",
        },
    )


async def _seed_subscription(
    db_session: AsyncSession,
    account: BillingAccount,
    *,
    external_id: str,
    catalog_key: str = "tier_1",
    provider_state_version: int = 0,
) -> BillingSubscription:
    subscription = BillingSubscription(
        billing_account_id=account.id,
        external_subscription_id=external_id,
        external_price_id="plan_test",
        catalog_key=catalog_key,
        currency="USD",
        provider_state_version=provider_state_version,
    )
    db_session.add(subscription)
    await db_session.commit()
    return subscription


def _patch_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bind the catalog seam to a one-key monitored_urls bundle."""
    monkeypatch.setattr(
        "app.domain.billing.service.plan_period_grant_specs",
        lambda catalog_key, catalog_revision: ((KEY_MONITORED_URLS, 50),),
    )


async def _account_version(db_session: AsyncSession) -> int:
    account = (await db_session.scalars(select(BillingAccount))).one()
    return account.entitlement_lifecycle_version


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/billing/webhooks/razorpay",
        content=b'{"event":"subscription.activated"}',
        headers={
            "X-Razorpay-Signature": "invalid",
            "X-Razorpay-Event-Id": "evt_invalid",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_signed_unhandled_webhook_is_acknowledged(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET)
    )
    raw = b'{"event":"payment.captured"}'
    response = await client.post(
        "/api/v1/billing/webhooks/razorpay",
        content=raw,
        headers={
            "X-Razorpay-Signature": _sign(raw),
            "X-Razorpay-Event-Id": "evt_unhandled",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_activation_issues_one_period_bundle_and_projects_runtime(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET)
    )
    _patch_catalog(monkeypatch)
    await _register(client, "billing-activate@example.com")
    account = (await db_session.scalars(select(BillingAccount))).one()
    subscription = await _seed_subscription(
        db_session, account, external_id="sub_activation"
    )
    subscription_id = subscription.id
    workspace = (await client.get("/api/v1/workspaces")).json()[0]

    now = datetime.now(UTC)
    start = int(now.timestamp())
    end = int((now + timedelta(days=30)).timestamp())
    raw = _webhook_payload(
        external_id="sub_activation",
        status="active",
        updated_at=start,
        current_start=start,
        current_end=end,
    )
    first = await _post_webhook(client, raw, event_id="evt_activation_1")
    assert first.status_code == 204

    db_session.expire_all()
    # Accepted event bump (+1) plus one logical grant bundle bump (+1).
    assert await _account_version(db_session) == 2
    grants = (await db_session.scalars(select(AccountGrant))).all()
    assert len(grants) == 1
    grant = grants[0]
    assert grant.key == KEY_MONITORED_URLS
    assert grant.value == 50
    assert grant.source_kind == GRANT_SOURCE_PLAN
    assert grant.source_ref == f"subscription:{subscription_id}"
    period_start_iso = datetime.fromtimestamp(start, tz=UTC).isoformat()
    assert grant.idempotency_key == (
        f"sub:{subscription_id}:{period_start_iso}:"
        f"{billing_settings.catalog_version}"
    )
    assert grant.period_end is not None

    # The subscription projected the active state + period fields.
    db_session.expire_all()
    persisted_sub = await db_session.get(BillingSubscription, subscription_id)
    assert persisted_sub is not None
    assert persisted_sub.status == "active"
    assert persisted_sub.is_current is True

    # Synchronous Site Health re-projection: the linked workspace's runtime
    # row carries the new allowance without any lazy read.
    runtime = await db_session.scalar(
        select(WorkspaceSiteHealthRuntime).where(
            WorkspaceSiteHealthRuntime.workspace_id == uuid.UUID(workspace["id"])
        )
    )
    assert runtime is not None
    assert runtime.monitored_url_limit == 50
    assert runtime.count_disclosure is True

    # A redelivery under a NEW event id (provider retry after an ack loss)
    # re-accepts (event bump only) but never duplicates the bundle.
    retry = await _post_webhook(client, raw, event_id="evt_activation_2")
    assert retry.status_code == 204
    db_session.expire_all()
    assert await _account_version(db_session) == 3
    assert await db_session.scalar(select(func.count(AccountGrant.id))) == 1
    assert await db_session.scalar(select(func.count(BillingWebhookEvent.id))) == 2


@pytest.mark.asyncio
async def test_stale_event_is_rejected_without_a_version_bump(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET)
    )
    _patch_catalog(monkeypatch)
    await _register(client, "billing-stale@example.com")
    account = (await db_session.scalars(select(BillingAccount))).one()
    await _seed_subscription(
        db_session,
        account,
        external_id="sub_stale",
        provider_state_version=1_000,
    )

    raw = _webhook_payload(
        external_id="sub_stale",
        status="active",
        updated_at=500,  # older than the persisted provider state version
        current_start=500,
        current_end=500 + 30 * 86400,
    )
    response = await _post_webhook(client, raw, event_id="evt_stale_1")
    assert response.status_code == 204

    db_session.expire_all()
    assert await _account_version(db_session) == 0
    assert await db_session.scalar(select(func.count(AccountGrant.id))) == 0
    event = (await db_session.scalars(select(BillingWebhookEvent))).one()
    assert event.result_code == "stale"


@pytest.mark.asyncio
async def test_immediate_terminal_loss_revokes_with_deterministic_idempotency(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET)
    )
    _patch_catalog(monkeypatch)
    await _register(client, "billing-terminal@example.com")
    account = (await db_session.scalars(select(BillingAccount))).one()
    subscription = await _seed_subscription(
        db_session, account, external_id="sub_terminal"
    )
    subscription_id = subscription.id

    now = datetime.now(UTC)
    start = int(now.timestamp())
    activate = _webhook_payload(
        external_id="sub_terminal",
        status="active",
        updated_at=start,
        current_start=start,
        current_end=int((now + timedelta(days=30)).timestamp()),
    )
    response = await _post_webhook(client, activate, event_id="evt_term_act")
    assert response.status_code == 204

    # Cancelled with NO future period end: immediate terminal loss.
    cancelled_at = start + 100
    cancel = _webhook_payload(
        external_id="sub_terminal",
        status="cancelled",
        updated_at=cancelled_at,
    )
    response = await _post_webhook(client, cancel, event_id="evt_term_cxl")
    assert response.status_code == 204

    db_session.expire_all()
    # Activation (2) + terminal event bump (+1) + revocation write bump (+1).
    assert await _account_version(db_session) == 4
    persisted_sub = await db_session.get(BillingSubscription, subscription_id)
    assert persisted_sub is not None
    assert persisted_sub.status == "cancelled"
    assert persisted_sub.is_current is False
    assert persisted_sub.ended_at is not None
    revocations = (await db_session.scalars(select(GrantRevocation))).all()
    assert len(revocations) == 1
    assert revocations[0].idempotency_key == (
        f"sub:{subscription_id}:terminal:{cancelled_at}"
    )
    assert revocations[0].reason == "subscription_ended"

    # The lost allowance re-projected the workspace runtime row to zero.
    assert await db_session.scalar(
        select(func.count(WorkspaceSiteHealthRuntime.id)).where(
            WorkspaceSiteHealthRuntime.monitored_url_limit == 0
        )
    ) == 1

    # A redelivered terminal webhook (same logical event, new event id) hits
    # the deterministic idempotency key: no second revocation row.
    replay = await _post_webhook(client, cancel, event_id="evt_term_cxl_2")
    assert replay.status_code == 204
    db_session.expire_all()
    assert await db_session.scalar(select(func.count(GrantRevocation.id))) == 1
    assert await db_session.scalar(select(func.count(AccountGrant.id))) == 1


@pytest.mark.asyncio
async def test_cancel_at_period_end_keeps_access_and_writes_no_revocations(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET)
    )
    _patch_catalog(monkeypatch)
    await _register(client, "billing-cape@example.com")
    account = (await db_session.scalars(select(BillingAccount))).one()
    subscription = await _seed_subscription(
        db_session, account, external_id="sub_cape"
    )
    subscription_id = subscription.id

    now = datetime.now(UTC)
    start = int(now.timestamp())
    end = int((now + timedelta(days=30)).timestamp())
    activate = _webhook_payload(
        external_id="sub_cape",
        status="active",
        updated_at=start,
        current_start=start,
        current_end=end,
    )
    response = await _post_webhook(client, activate, event_id="evt_cape_act")
    assert response.status_code == 204

    # Same period, now flagged cancel-at-cycle-end: access runs to the
    # natural period end, so no revocations and no new bundle.
    cancel = _webhook_payload(
        external_id="sub_cape",
        status="cancelled",
        updated_at=start + 100,
        current_start=start,
        current_end=end,
        cancel_at_cycle_end=True,
    )
    response = await _post_webhook(client, cancel, event_id="evt_cape_cxl")
    assert response.status_code == 204

    db_session.expire_all()
    persisted_sub = await db_session.get(BillingSubscription, subscription_id)
    assert persisted_sub is not None
    assert persisted_sub.is_current is True
    assert persisted_sub.ended_at is None
    # Accepted event bump only: the bundle replayed (same period key) and
    # nothing was revoked.
    assert await _account_version(db_session) == 3
    assert await db_session.scalar(select(func.count(AccountGrant.id))) == 1
    assert await db_session.scalar(select(func.count(GrantRevocation.id))) == 0


@pytest.mark.asyncio
async def test_cancel_without_subscription_is_conflict(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "billing-cancel-empty@example.com")
    response = await client.post("/api/v1/billing/cancel")
    assert response.status_code == 409
    assert "no_current_subscription" in response.text


@pytest.mark.asyncio
async def test_cancel_marks_cancel_at_period_end(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _register(client, "billing-cancel@example.com")
    account = (await db_session.scalars(select(BillingAccount))).one()
    now = datetime.now(UTC)
    subscription = BillingSubscription(
        billing_account_id=account.id,
        external_subscription_id="sub_cancel_me",
        external_price_id="plan_test",
        catalog_key="tier_1",
        currency="USD",
        status="active",
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
    )
    db_session.add(subscription)
    await db_session.commit()
    subscription_id = subscription.id

    calls: list[bool] = []

    class FakeProvider:
        async def cancel_subscription(
            self, external_subscription_id: str, *, at_cycle_end: bool
        ) -> ProviderSubscription:
            assert external_subscription_id == "sub_cancel_me"
            calls.append(at_cycle_end)
            return ProviderSubscription(
                external_subscription_id=external_subscription_id,
                status="active",
                current_start=int(now.timestamp()),
                current_end=int((now + timedelta(days=30)).timestamp()),
                updated_at=int(now.timestamp()),
                cancel_at_period_end=True,
            )

    monkeypatch.setattr(billing_api, "get_billing_provider", FakeProvider)
    response = await client.post("/api/v1/billing/cancel")

    assert response.status_code == 200
    body = response.json()
    assert body["cancel_at_period_end"] is True
    assert body["status"] == "cancel_scheduled"
    assert calls == [True]

    db_session.expire_all()
    persisted_sub = await db_session.get(BillingSubscription, subscription_id)
    assert persisted_sub is not None
    assert persisted_sub.cancel_at_period_end is True
    # The accepted lifecycle projection bumped the account version (no
    # bundle: the catalog seam is unbound in this test, and cancel-at-period
    # -end never revokes).
    assert await _account_version(db_session) == 1

    # Cancelling again is an idempotent no-op (no second provider call).
    again = await client.post("/api/v1/billing/cancel")
    assert again.status_code == 200
    assert calls == [True]
