from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select

from app.api import billing as billing_api
from app.connectors.billing.base import (
    HostedSubscription,
    ProviderPayment,
    ProviderSubscription,
)
from app.core.config.billing_settings import billing_settings
from app.domain.billing.activations import ActivationRejectedError, activate_pending
from app.domain.billing.catalog_revisions import payload_digest, validate_payload
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingCatalogRevision,
    PendingActivation,
)
from app.models.billing_payment import BillingPayment
from app.models.user import User
from tests.component.auth_helpers import register_and_login

pytestmark = pytest.mark.asyncio

_US_BILLING_IDENTITY = {
    "billing_name": "Fixture Buyer",
    "billing_address_line1": "1 Test Road",
    "billing_city": "New York",
    "billing_postal_code": "10001",
    "export_eligibility_attested": True,
}


def _sandbox_payload():
    return json.loads(
        (
            Path(__file__).resolve().parents[3]
            / "docs/operations/razorpay-sandbox-catalog.json"
        ).read_text()
    )


@pytest.fixture
async def checkout(client, db_session, monkeypatch):
    for name, value in {
        "razorpay_mode": "test",
        "razorpay_key_id": "rzp_test_fixture",
        "razorpay_key_secret": SecretStr("synthetic-api-secret"),
        "quote_signing_secret": SecretStr("synthetic-quote-secret"),
        "checkout_enabled": True,
        "razorpay_test_ready": True,
        "razorpay_test_international_ready": True,
        "seller_legal_name": "CiteLadder Private Limited",
        "seller_legal_address": "1 Seller Street, Mumbai",
        "seller_email": "billing@citeladder.test",
        "seller_gstin": "27ABCDE1234F1Z5",
        "seller_gst_state_code": "27",
        "seller_gst_state_name": "Maharashtra",
        "seller_sac": "998313",
        "seller_lut_reference": "LUT/2026/001",
    }.items():
        monkeypatch.setattr(billing_settings, name, value)
    payload = _sandbox_payload()
    payload["plans"][0]["regional_byok_prices"]["international"][
        "provider_price_ref"
    ] = "plan_fixture"
    parsed = validate_payload(payload)
    operator = User(email="operator@example.com", role="admin", is_active=True)
    db_session.add(operator)
    await db_session.flush()
    db_session.add(
        BillingCatalogRevision(
            revision="sandbox-fixture",
            payload=payload,
            payload_sha256=payload_digest(parsed),
            publication_state="published",
            created_by_user_id=operator.id,
            created_reason="fixture",
        )
    )
    await db_session.commit()

    class Provider:
        async def create_base_subscription(self, **kwargs):
            assert kwargs["price_ref"] == "plan_fixture"
            return HostedSubscription(
                external_subscription_id="sub_fixture",
                checkout_url="",
                status="created",
                price_ref="plan_fixture",
            )

    monkeypatch.setattr(billing_api, "get_billing_provider", lambda: Provider())
    await register_and_login(client, "payer@example.com")
    response = await client.post(
        "/api/v1/billing/subscriptions",
        json={
            "catalog_key": "tier_1",
            "credential_mode": "byok",
            "country_code": "US",
            **_US_BILLING_IDENTITY,
        },
        headers={"Idempotency-Key": "checkout-fixture"},
    )
    assert response.status_code == 202, response.text
    return response.json()


async def test_owner_checkout_callback_and_cross_account_isolation(
    client, db_session, checkout
):
    activation_id = checkout["activation_id"]
    prefix = f"/api/v1/billing/subscriptions/{activation_id}"
    response = await client.get(prefix + "/checkout")
    assert response.status_code == 200
    assert response.json()["subscription_id"] == "sub_fixture"
    assert "synthetic-api-secret" not in response.text
    signature = hmac.new(
        b"synthetic-api-secret", b"pay_fixture|sub_fixture", hashlib.sha256
    ).hexdigest()
    callback = {
        "razorpay_payment_id": "pay_fixture",
        "razorpay_subscription_id": "sub_fixture",
        "razorpay_signature": signature,
    }
    assert (
        await client.post(
            prefix + "/verify", json={**callback, "razorpay_signature": "0" * 64}
        )
    ).status_code == 400
    assert (await client.post(prefix + "/verify", json=callback)).json()[
        "status"
    ] == "pending"
    assert await db_session.scalar(select(func.count(BillingPayment.id))) == 0
    assert (
        await db_session.scalar(
            select(func.count(AccountGrant.id)).where(
                AccountGrant.source_kind == "plan"
            )
        )
        == 0
    )
    client.cookies.clear()
    await register_and_login(client, "other@example.com")
    assert (await client.get(prefix + "/checkout")).status_code == 404
    assert (await client.post(prefix + "/verify", json=callback)).status_code == 404
    assert (
        await client.get(f"/api/v1/billing/activations/{activation_id}")
    ).status_code == 404


async def test_settlement_requires_captured_invoice_and_deduplicates_receipt(
    db_session, checkout, monkeypatch
):
    pending = await db_session.scalar(select(PendingActivation))
    account = await db_session.scalar(
        select(BillingAccount).where(BillingAccount.id == pending.billing_account_id)
    )
    now = datetime.now(UTC).replace(microsecond=0)
    end = now + timedelta(days=30)
    payment = ProviderPayment(
        external_payment_id="pay_fixture",
        status="paid",
        amount_minor=4900,
        currency="USD",
        updated_at=int(now.timestamp()),
        paid_at=int(now.timestamp()),
        tax_minor=0,
        provider_mode="test",
        external_invoice_id="inv_fixture",
        external_subscription_id="sub_fixture",
        period_start=int(now.timestamp()),
        period_end=int(end.timestamp()),
    )
    record = ProviderSubscription(
        external_subscription_id="sub_fixture",
        status="active",
        current_start=payment.period_start,
        current_end=payment.period_end,
        updated_at=int(now.timestamp()),
        cancel_at_period_end=False,
        price_ref="plan_fixture",
        provider_mode="test",
        catalog_revision=pending.catalog_revision,
        intent_id=str(pending.id),
        account_ref=str(account.id),
        payment=payment,
    )
    pending_id = pending.id
    for invalid in [
        replace(record, payment=None),
        replace(record, payment=replace(payment, status="payment_pending")),
        replace(record, payment=replace(payment, amount_minor=1)),
        replace(record, provider_mode="live"),
    ]:
        with pytest.raises(ActivationRejectedError):
            await activate_pending(
                db_session,
                pending_id=pending_id,
                provider_record=invalid,
                authority="reconciliation",
                authority_id="fixture",
                at=now,
            )
        await db_session.rollback()
    for _ in range(2):
        result = await activate_pending(
            db_session,
            pending_id=pending_id,
            provider_record=record,
            authority="reconciliation",
            authority_id="fixture",
            at=now,
        )
        assert result.status == "activated"
    assert await db_session.scalar(select(func.count(BillingPayment.id))) == 1
    receipt = await db_session.scalar(select(BillingPayment))
    assert (
        receipt.subscription_id is not None
        and receipt.pending_activation_id == pending_id
    )
    assert receipt.period_start == now and receipt.provider_mode == "test"
    assert (
        await db_session.scalar(
            select(func.count(AccountGrant.id)).where(
                AccountGrant.source_kind == "plan"
            )
        )
        > 0
    )

    # Provider cancellation may omit period fields; previously verified paid
    # time remains authoritative and no additional bundle may be issued.
    from app.domain.billing.service import apply_subscription_state
    from app.models.billing import BillingSubscription

    subscription = await db_session.get(BillingSubscription, receipt.subscription_id)
    count_before = await db_session.scalar(select(func.count(AccountGrant.id)))
    assert await apply_subscription_state(
        db_session,
        subscription,
        provider_status="cancelled",
        current_start=None,
        current_end=None,
        updated_at=int(now.timestamp()) + 1,
        cancel_at_period_end=False,
    )
    assert subscription.is_current and subscription.current_period_end == end
    assert await db_session.scalar(select(func.count(AccountGrant.id))) == count_before

    class AfterPaidPeriod(datetime):
        @classmethod
        def now(cls, tz=None):
            return end + timedelta(seconds=1)

    monkeypatch.setattr("app.domain.billing.service.datetime", AfterPaidPeriod)
    assert await apply_subscription_state(
        db_session,
        subscription,
        provider_status="active",
        current_start=payment.period_start,
        current_end=payment.period_end,
        updated_at=int(now.timestamp()) + 2,
        cancel_at_period_end=False,
    )
    assert not subscription.is_current and subscription.status == "cancelled"
    assert await db_session.scalar(select(func.count(AccountGrant.id))) == count_before


async def test_ambiguous_creation_recovers_checkout_without_granting_access(
    db_session, session_factory, checkout
):
    from app.domain.billing.reconciliation import reconcile_pending_activations

    pending = await db_session.scalar(select(PendingActivation))
    pending.external_reference = None
    pending.created_at = datetime.now(UTC) - timedelta(minutes=10)
    identity = (str(pending.id), str(pending.billing_account_id))
    revision = pending.catalog_revision
    pending_id = pending.id
    await db_session.commit()

    class Provider:
        async def find_subscription(self, intent_id, account_ref):
            assert (intent_id, account_ref) == identity
            return ProviderSubscription(
                external_subscription_id="sub_recovered",
                status="created",
                current_start=None,
                current_end=None,
                updated_at=0,
                cancel_at_period_end=False,
                price_ref="plan_fixture",
                intent_id=intent_id,
                account_ref=account_ref,
                catalog_revision=revision,
                provider_mode="test",
            )

    result = await reconcile_pending_activations(
        session_factory,
        Provider(),
        now=datetime.now(UTC),
    )
    assert result.claimed == 1 and result.still_pending == 1
    db_session.expire_all()
    recovered = await db_session.get(PendingActivation, pending_id)
    assert recovered.external_reference == "sub_recovered"
    assert recovered.status == "pending"
    assert await db_session.scalar(select(func.count(BillingPayment.id))) == 0
    assert (
        await db_session.scalar(
            select(func.count(AccountGrant.id)).where(
                AccountGrant.source_kind == "plan"
            )
        )
        == 0
    )
