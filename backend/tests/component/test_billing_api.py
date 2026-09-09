"""Component tests for the v8 billing surface: cancellation + Razorpay webhooks.

The v6 catalog/quote/checkout/workspace-entitlement routes are deleted; what
remains here is ``DELETE /billing/subscription`` and the signed webhook
ingress driving the lifecycle projector (``apply_subscription_state``): stale
rejection, the account ``entitlement_lifecycle_version`` bump per accepted
event, one idempotent period grant bundle (via the monkeypatched
``plan_period_grant_specs`` catalog seam), deterministic terminal revocations,
and the synchronous Site Health runtime re-projection. The commercial WRITE
path (subscriptions/add-ons/top-ups + activation) lives in
``test_billing_commercial.py``.
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
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import billing as billing_api
from app.connectors.billing.base import ProviderSubscription
from app.core.config.billing_settings import billing_settings
from app.core.config.entitlements import (
    GRANT_SOURCE_PLAN,
    KEY_MONITORED_URLS,
)
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingCatalogRevision,
    BillingSubscription,
    BillingWebhookEvent,
    GrantRevocation,
    PendingActivation,
)
from app.models.site_health.runtime import WorkspaceSiteHealthRuntime
from tests.component.auth_helpers import register_and_login as _register
from tests.component.billing_catalog_helpers import publish_test_catalog, tax_snapshot
from tests.component.billing_provider_helpers import (
    configure_test_provider,
    drain_webhook,
)
from tests.component.occupancy_helpers import revoke_signup_baseline_grants


@pytest.fixture(autouse=True)
def _provider_environment(monkeypatch):
    configure_test_provider(monkeypatch)


_SECRET = "component-webhook-secret"


@pytest.fixture(autouse=True)
async def _published_catalog(db_session: AsyncSession) -> None:
    await publish_test_catalog(db_session)


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
    response = await client.post(
        "/api/v1/billing/webhooks/razorpay",
        content=raw,
        headers={
            "X-Razorpay-Signature": _sign(raw),
            "X-Razorpay-Event-Id": event_id,
            "Content-Type": "application/json",
        },
    )

    if response.status_code == 204:
        await drain_webhook(json.loads(raw))
    return response


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
        provider_mode="test",
        external_price_id="plan_test",
        catalog_key=catalog_key,
        currency="USD",
        catalog_revision=billing_settings.catalog_version,
        frozen_terms={"grant_specs": [[KEY_MONITORED_URLS, 50]]},
        provider_state_version=provider_state_version,
    )
    db_session.add(subscription)
    now = datetime.now(UTC)
    db_session.add(
        PendingActivation(
            billing_account_id=account.id,
            activation_kind="base",
            catalog_key=catalog_key,
            quantity=1,
            catalog_revision=billing_settings.catalog_version,
            credential_mode="byok",
            status="activated",
            provider_mode="test",
            external_reference=external_id,
            external_price_id="plan_test",
            quote={
                "catalog_revision": billing_settings.catalog_version,
                "total_price": {"currency": "USD", "amount_minor": 4900},
                "tax": {"currency": "USD", "amount_minor": 0},
            },
            tax_snapshot=tax_snapshot(4900),
            idempotency_key=f"fixture:{external_id}",
            request_fingerprint="f" * 64,
            expires_at=now + timedelta(hours=1),
        )
    )
    await db_session.commit()
    return subscription


def _patch_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bind the catalog seam to a one-key monitored_urls bundle."""
    monkeypatch.setattr(
        "app.domain.billing.periods._frozen_grant_specs",
        lambda subscription: ((KEY_MONITORED_URLS, 50),),
    )


async def _account_version(db_session: AsyncSession) -> int:
    account = (await db_session.scalars(select(BillingAccount))).one()
    return account.entitlement_lifecycle_version


async def _total_grant_count(db_session: AsyncSession) -> int:
    return int(await db_session.scalar(select(func.count(AccountGrant.id))) or 0)


async def _commercial_grant_count(db_session: AsyncSession) -> int:
    """Count only authority created by the billing flow under test.

    Signup deliberately seeds free baseline grants; payment/webhook negatives
    must prove they add no plan/topup authority rather than expect no account
    grants at all.
    """
    return int(
        await db_session.scalar(
            select(func.count(AccountGrant.id)).where(
                AccountGrant.source_kind.in_(("plan", "addon", "topup", "trial"))
            )
        )
        or 0
    )


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
async def test_signed_unmatched_webhook_is_acknowledged_and_grants_nothing(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET))
    raw = json.dumps(
        {
            "event": "payment.captured",
            "created_at": 1,
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_unmatched",
                        "status": "captured",
                        "amount": 100,
                        "currency": "USD",
                        "created_at": 1,
                    }
                }
            },
        },
        separators=(",", ":"),
    ).encode()
    response = await _post_webhook(client, raw, event_id="evt_unmatched")
    assert response.status_code == 204
    # A valid but unmatched event is recorded safely and grants NOTHING.
    event = (await db_session.scalars(select(BillingWebhookEvent))).one()
    assert event.result_code == "unmatched"
    assert await _total_grant_count(db_session) == 0


@pytest.mark.asyncio
async def test_activation_issues_one_period_bundle_and_projects_runtime(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET))
    _patch_catalog(monkeypatch)
    await _register(client, "billing-activate@example.com")
    baseline_version = await _account_version(db_session)
    account = (await db_session.scalars(select(BillingAccount))).one()
    subscription = await _seed_subscription(
        db_session, account, external_id="sub_activation"
    )
    subscription_id = subscription.id
    workspace = (await client.get("/api/v1/workspaces")).json()[0]
    # This narrow period-bundle projection fixture needs a bare account so its
    # runtime assertion remains exact. The Phase 2 paid/free composition defect
    # is intentionally not normalized here.
    await revoke_signup_baseline_grants(
        db_session, workspace_id=uuid.UUID(workspace["id"])
    )
    await db_session.commit()
    baseline_version = await _account_version(db_session)

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
    assert await _account_version(db_session) == baseline_version + 2
    grants = (
        await db_session.scalars(
            select(AccountGrant).where(AccountGrant.source_kind == GRANT_SOURCE_PLAN)
        )
    ).all()
    assert len(grants) == 1
    grant = grants[0]
    assert grant.key == KEY_MONITORED_URLS
    assert grant.value == 50
    assert grant.source_kind == GRANT_SOURCE_PLAN
    assert grant.source_ref == f"subscription:{subscription_id}"
    period_start_iso = datetime.fromtimestamp(start, tz=UTC).isoformat()
    period_end_iso = datetime.fromtimestamp(end, tz=UTC).isoformat()
    assert grant.idempotency_key == (
        f"sub:{subscription_id}:{period_start_iso}:{period_end_iso}:base"
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
    assert await _account_version(db_session) == baseline_version + 3
    assert await _commercial_grant_count(db_session) == 1
    assert await db_session.scalar(select(func.count(BillingWebhookEvent.id))) == 2


@pytest.mark.asyncio
async def test_stale_event_is_rejected_without_a_version_bump(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET))
    _patch_catalog(monkeypatch)
    await _register(client, "billing-stale@example.com")
    baseline_version = await _account_version(db_session)
    baseline_grants = await _total_grant_count(db_session)
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
    assert await _account_version(db_session) == baseline_version
    assert await _total_grant_count(db_session) == baseline_grants
    assert await _commercial_grant_count(db_session) == 0
    event = (await db_session.scalars(select(BillingWebhookEvent))).one()
    assert event.result_code == "stale"


@pytest.mark.asyncio
async def test_cancellation_without_period_preserves_verified_paid_time_on_replay(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET))
    _patch_catalog(monkeypatch)
    await _register(client, "billing-terminal@example.com")
    workspace = (await client.get("/api/v1/workspaces")).json()[0]
    # Isolate the paid bundle so the runtime assertion cannot pass because
    # of a free baseline allowance.
    await revoke_signup_baseline_grants(
        db_session, workspace_id=uuid.UUID(workspace["id"])
    )
    await db_session.commit()
    baseline_version = await _account_version(db_session)
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

    # Missing provider period fields cannot erase the verified paid period.
    cancelled_at = start + 100
    cancel = _webhook_payload(
        external_id="sub_terminal",
        status="cancelled",
        updated_at=cancelled_at,
    )
    response = await _post_webhook(client, cancel, event_id="evt_term_cxl")
    assert response.status_code == 204

    db_session.expire_all()
    # Activation (2) + cancellation projection (1), with no revocation.
    assert await _account_version(db_session) == baseline_version + 3
    persisted_sub = await db_session.get(BillingSubscription, subscription_id)
    assert persisted_sub is not None
    assert persisted_sub.status == "cancelled"
    assert persisted_sub.is_current is True
    assert persisted_sub.ended_at is None
    revocations = (
        await db_session.scalars(
            select(GrantRevocation).where(
                GrantRevocation.idempotency_key
                == f"sub:{subscription_id}:terminal:{cancelled_at}"
            )
        )
    ).all()
    assert not revocations
    assert int(persisted_sub.current_period_end.timestamp()) == int(
        (now + timedelta(days=30)).timestamp()
    )

    # Verified paid access remains projected until its natural expiry.
    assert (
        await db_session.scalar(
            select(func.count(WorkspaceSiteHealthRuntime.id)).where(
                WorkspaceSiteHealthRuntime.monitored_url_limit == 50
            )
        )
        == 1
    )

    # A redelivered cancellation cannot revoke or duplicate paid access.
    replay = await _post_webhook(client, cancel, event_id="evt_term_cxl_2")
    assert replay.status_code == 204
    db_session.expire_all()
    assert (
        await db_session.scalar(
            select(func.count(GrantRevocation.id)).where(
                GrantRevocation.idempotency_key
                == f"sub:{subscription_id}:terminal:{cancelled_at}"
            )
        )
        == 0
    )
    assert await _commercial_grant_count(db_session) == 1


@pytest.mark.asyncio
async def test_cancel_at_period_end_keeps_access_and_writes_no_revocations(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "razorpay_webhook_secret", SecretStr(_SECRET))
    _patch_catalog(monkeypatch)
    await _register(client, "billing-cape@example.com")
    baseline_version = await _account_version(db_session)
    account = (await db_session.scalars(select(BillingAccount))).one()
    subscription = await _seed_subscription(db_session, account, external_id="sub_cape")
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
    assert await _account_version(db_session) == baseline_version + 3
    assert await _commercial_grant_count(db_session) == 1
    assert await db_session.scalar(select(func.count(GrantRevocation.id))) == 0


@pytest.mark.asyncio
async def test_delete_subscription_requires_an_idempotency_key(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "billing-delete-nokey@example.com")
    response = await client.delete("/api/v1/billing/subscription")
    assert response.status_code == 400
    assert "idempotency_key_required" in response.text


@pytest.mark.asyncio
async def test_cancel_without_subscription_is_conflict(
    client: httpx.AsyncClient,
) -> None:
    await _register(client, "billing-cancel-empty@example.com")
    response = await client.delete(
        "/api/v1/billing/subscription", headers={"Idempotency-Key": "cancel-key-1"}
    )
    assert response.status_code == 409
    assert "no_current_subscription" in response.text


@pytest.mark.asyncio
async def test_cancel_marks_cancel_at_period_end(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _register(client, "billing-cancel@example.com")
    baseline_version = await _account_version(db_session)
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
        catalog_revision=billing_settings.catalog_version,
        frozen_terms={"grant_specs": [[KEY_MONITORED_URLS, 50]]},
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
    response = await client.delete(
        "/api/v1/billing/subscription", headers={"Idempotency-Key": "cancel-key-2"}
    )

    assert response.status_code == 200
    body = response.json()
    # The deletion vocabulary is SubscriptionChangeResponse, deliberately NOT
    # an activation: no pending/activated/failed/abandoned tokens.
    assert body["catalog_key"] == "tier_1"
    assert body["status"] == "cancellation_scheduled"
    assert "cancel_at_period_end" not in body
    assert calls == [True]

    db_session.expire_all()
    persisted_sub = await db_session.get(BillingSubscription, subscription_id)
    assert persisted_sub is not None
    assert persisted_sub.cancel_at_period_end is True
    # Cancellation without captured-payment evidence projects lifecycle only.
    assert await _account_version(db_session) == baseline_version + 1
    assert await _commercial_grant_count(db_session) == 0
    assert await db_session.scalar(select(func.count(GrantRevocation.id))) == 0

    # Cancelling again reports already_scheduled with NO second provider call.
    again = await client.delete(
        "/api/v1/billing/subscription", headers={"Idempotency-Key": "cancel-key-3"}
    )
    assert again.status_code == 200
    assert again.json()["status"] == "already_scheduled"
    assert calls == [True]


# --- Public catalog route --------------------------------------------------
@pytest.mark.asyncio
async def test_public_catalog_returns_503_when_no_revision_is_published(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await db_session.execute(delete(BillingCatalogRevision))
    await db_session.commit()

    response = await client.get("/api/v1/billing/catalog")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "catalog_unavailable"


@pytest.mark.asyncio
async def test_public_catalog_needs_no_auth_and_previews_without_a_country(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/api/v1/billing/catalog")
    assert response.status_code == 200
    body = response.json()
    assert body["catalog_revision"] == billing_settings.catalog_version
    # No country supplied: null country, config-owned international preview.
    assert body["country_code"] is None
    assert body["region"] == "international"
    assert body["currency"] == "USD"
    assert body["currency_minor_units"] == 2
    assert [plan["key"] for plan in body["plans"]] == [
        "tier_1",
        "tier_2",
        "tier_3",
        "enterprise",
    ]
    # Lists are always present and may be empty, never null.
    for key in ("plans", "addons", "topups", "providers"):
        assert isinstance(body[key], list)
    # No workspace state and no private provider reference anywhere.
    raw = response.text
    for token in (
        "provider_price_ref",
        "workspace_id",
        "connection",
        "latest_probe",
        "api_key",
    ):
        assert token not in raw


@pytest.mark.asyncio
async def test_public_catalog_resolves_india_region_server_side(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/api/v1/billing/catalog", params={"country": "in"})
    assert response.status_code == 200
    body = response.json()
    assert body["country_code"] == "IN"
    assert body["region"] == "india"
    assert body["currency"] == "INR"
    # The persisted approved revision contains USD-only commercial terms. It
    # never guesses an INR conversion, so the regional price is absent.
    tier_1 = body["plans"][0]
    assert tier_1["base_price"] is None
    assert tier_1["checkout_available"] is False
    assert tier_1["unavailable_reason"] == "checkout_unavailable"


@pytest.mark.asyncio
async def test_public_catalog_plan_rows_separate_base_and_credit_prices(
    client: httpx.AsyncClient,
) -> None:
    body = (await client.get("/api/v1/billing/catalog")).json()
    plans = {plan["key"]: plan for plan in body["plans"]}
    assert [
        plans[key]["base_price"]["amount_minor"]
        for key in ("tier_1", "tier_2", "tier_3")
    ] == [4_900, 9_900, 14_900]
    assert [
        plans[key]["funded_total_price"]["amount_minor"]
        for key in ("tier_1", "tier_2", "tier_3")
    ] == [9_900, 14_900, 29_900]
    for key in ("tier_1", "tier_2", "tier_3"):
        plan = plans[key]
        # The persisted revision freezes distinct BYOK and funded totals.
        assert plan["credit_price"] is not None
        assert plan["trial_availability"] == "unavailable"
        assert plan["trial_unavailable_reason"] == "trial_unavailable"
        assert plan["trial_days"] == billing_settings.trial_days
        assert plan["contact_url"] is None
    enterprise = plans["enterprise"]
    assert enterprise["contact_only"] is True
    assert enterprise["self_serve"] is False
    assert enterprise["base_price"] is None
    assert enterprise["credit_price"] is None
    assert enterprise["checkout_available"] is False
    assert enterprise["unavailable_reason"] == "contact_only"
    assert enterprise["contact_url"] == "https://www.cube27.com/contact/"
    # Upper tiers show the coming-soon provider rows with no granted value.
    tier_2_rows = {row["key"]: row for row in plans["tier_2"]["capabilities"]}
    for key in ("provider.grok", "provider.perplexity", "provider.copilot"):
        assert tier_2_rows[key]["value"] is None
    assert tier_2_rows["provider.copilot"]["issuable"] is False
    assert "provider.grok" not in {
        row["key"] for row in plans["tier_1"]["capabilities"]
    }


@pytest.mark.asyncio
async def test_public_catalog_reports_unset_addons_and_topups_as_unavailable(
    client: httpx.AsyncClient,
) -> None:
    body = (await client.get("/api/v1/billing/catalog")).json()
    # Phase 1 persisted terms intentionally publish no add-ons or top-ups;
    # absence is the unavailable contract rather than config-derived placeholders.
    assert body["addons"] == []
    assert body["topups"] == []


@pytest.mark.asyncio
async def test_public_provider_rows_mark_coming_soon_engines_unavailable(
    client: httpx.AsyncClient,
) -> None:
    body = (await client.get("/api/v1/billing/catalog")).json()
    providers = {row["key"]: row for row in body["providers"]}
    for key in ("grok", "perplexity", "copilot"):
        row = providers[key]
        assert row["availability"] == "unavailable"
        assert row["unavailable_reason"] == "provider_unavailable"
        assert row["adapter_shipped"] is False
        assert row["grant_key"] == f"provider.{key}"
        assert row["routes"] == []
    assert providers["copilot"]["issuable"] is False
    assert providers["grok"]["issuable"] is True
    # Shipped engines carry one exact citation-capable route.
    assert providers["chatgpt"]["availability"] == "available"
    assert providers["chatgpt"]["routes"] == [
        {
            "logical_engine": "chatgpt",
            "transport_provider": "openai",
            "model": "gpt-5.5",
        },
    ]
    # Public availability vocabulary only — never a connection state.
    assert {row["availability"] for row in body["providers"]} <= {
        "available",
        "unavailable",
    }


@pytest.mark.asyncio
async def test_public_catalog_openapi_locks_the_final_plan_literals(
    client: httpx.AsyncClient,
) -> None:
    schemas = (await client.get("/openapi.json")).json()["components"]["schemas"]
    assert schemas["CatalogPlanResponse"]["properties"]["key"]["enum"] == [
        "tier_1",
        "tier_2",
        "tier_3",
        "enterprise",
    ]
    assert schemas["BillingCatalogResponse"]["additionalProperties"] is False
