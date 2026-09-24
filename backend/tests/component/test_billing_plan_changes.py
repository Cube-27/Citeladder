"""Upgrade now (prorated order) and downgrade at renewal, end to end.

The provider is a recording double; everything else — the published launch
catalog, the quote engine, webhook dedupe, the activation transaction, the
subscription sweep, grants and receipts — is the real code on PostgreSQL.
"""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import billing_plan_changes
from app.connectors.billing.base import (
    BillingProviderError,
    HostedPayment,
    ProviderPayment,
    ProviderSubscription,
)
from app.core.config.billing_settings import billing_settings
from app.core.config.billing_tax import BillingIdentity, calculate_tax, tax_snapshot
from app.core.config.razorpay_settings import razorpay_settings
from app.domain.billing.subscription_recovery import reconcile_current_subscriptions
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingSubscription,
    PendingActivation,
)
from tests.billing_catalog_support import TEST_CATALOG_REVISION, launch_catalog
from tests.component.auth_helpers import register_and_login
from tests.component.billing_catalog_helpers import (
    apply_seller_settings,
    publish_test_catalog,
)
from tests.component.billing_provider_helpers import (
    configure_test_provider,
    post_webhook,
)

pytestmark = pytest.mark.asyncio

_SECRET = "plan-change-webhook-secret"
_REFS = {
    "tier_1:international": "plan_starter",
    "tier_2:international": "plan_growth",
    "tier_3:international": "plan_scale",
}
_USD = {"tier_1": 4_900, "tier_2": 9_900, "tier_3": 19_900}
_IDENTITY = BillingIdentity(
    name="Fixture Buyer",
    address_line1="1 Test Road",
    city="New York",
    state_code=None,
    postal_code="10001",
    customer_gstin=None,
    export_eligibility_attested=True,
)


@pytest.fixture(autouse=True)
async def _environment(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    configure_test_provider(monkeypatch)
    apply_seller_settings(monkeypatch)
    monkeypatch.setattr(billing_settings, "checkout_enabled", True)
    monkeypatch.setattr(razorpay_settings, "webhook_secret", SecretStr(_SECRET))
    await publish_test_catalog(db_session, refs=_REFS)


class _Provider:
    """Records every provider call the plan-change paths make."""

    def __init__(self) -> None:
        self.orders: list[int] = []
        self.scheduled: list[tuple[str, str]] = []
        self.reject_schedule = False
        self.cycle: ProviderSubscription | None = None

    async def create_one_time_payment(self, *, amount_minor, currency, **_kwargs):
        self.orders.append(amount_minor)
        return HostedPayment(
            external_order_id="order_upgrade",
            checkout_url="",
            status="created",
            amount_minor=amount_minor,
            currency=currency,
        )

    async def schedule_plan_change(self, reference: str, *, price_ref: str):
        if self.reject_schedule:
            raise BillingProviderError("provider_rejected")
        self.scheduled.append((reference, price_ref))
        assert self.cycle is not None
        return self.cycle

    async def fetch_subscription(self, _reference: str) -> ProviderSubscription:
        assert self.cycle is not None
        return self.cycle


def _terms(plan: str) -> dict[str, object]:
    catalog = launch_catalog(refs=_REFS)
    entry = catalog.plan(plan)
    assert entry is not None
    amount = _USD[plan]
    calculation = calculate_tax(
        subtotal_minor=amount,
        discount_minor=0,
        currency="USD",
        country_code="US",
        identity=_IDENTITY,
    )
    money = {"currency": "USD", "amount_minor": amount}
    zero = {"currency": "USD", "amount_minor": 0}
    return {
        "catalog_revision": TEST_CATALOG_REVISION,
        "catalog_key": plan,
        "credential_mode": "byok",
        "quantity": 1,
        "price_ref": _REFS[f"{plan}:international"],
        "currency": "USD",
        "quote": {
            "quote_id": "q" * 64,
            "catalog_revision": TEST_CATALOG_REVISION,
            "catalog_key": plan,
            "credential_mode": "byok",
            "country_code": "US",
            "region": "international",
            "base_price": money,
            "credit_price": None,
            "subtotal_price": money,
            "discount": zero,
            "taxable_value": money,
            "tax_treatment": calculation.treatment,
            "tax_rate": str(calculation.tax_rate),
            "cgst": zero,
            "sgst": zero,
            "igst": zero,
            "tax_policy_version": calculation.policy_version,
            "tax": zero,
            "total_price": money,
            "expires_at": datetime.now(UTC).isoformat(),
        },
        "tax_snapshot": tax_snapshot(identity=_IDENTITY, calculation=calculation),
        "grant_specs": [[grant.key, grant.value] for grant in entry.grant_bundle],
    }


async def _subscribed(
    client: httpx.AsyncClient, db_session: AsyncSession, plan: str, email: str
) -> tuple[BillingSubscription, datetime, datetime]:
    """A paid, half-elapsed 30-day period on ``plan`` and its base intent."""
    await register_and_login(client, email)
    account = (await db_session.scalars(select(BillingAccount))).one()
    account.billing_country = "US"
    account.billing_profile = _IDENTITY.snapshot()
    # Provider cycle bounds are whole seconds.
    now = datetime.now(UTC).replace(microsecond=0)
    start, end = now - timedelta(days=15), now + timedelta(days=15)
    terms = _terms(plan)
    db_session.add(
        PendingActivation(
            billing_account_id=account.id,
            activation_kind="base",
            catalog_key=plan,
            quantity=1,
            catalog_revision=TEST_CATALOG_REVISION,
            credential_mode="byok",
            status="activated",
            provider_mode="test",
            external_reference="sub_live",
            external_price_id=str(terms["price_ref"]),
            quote=terms["quote"],
            tax_snapshot=terms["tax_snapshot"],
            country_code="US",
            region="international",
            idempotency_key="seeded-base-intent",
            request_fingerprint="f" * 64,
            expires_at=now,
            activated_at=start,
        )
    )
    subscription = BillingSubscription(
        billing_account_id=account.id,
        provider_mode="test",
        external_subscription_id="sub_live",
        external_price_id=str(terms["price_ref"]),
        catalog_revision=TEST_CATALOG_REVISION,
        catalog_key=plan,
        currency="USD",
        status="active",
        is_current=True,
        frozen_terms=terms,
        current_period_start=start,
        current_period_end=end,
    )
    db_session.add(subscription)
    await db_session.commit()
    return subscription, start, end


def _cycle(price_ref: str, start: datetime, end: datetime) -> ProviderSubscription:
    return ProviderSubscription(
        external_subscription_id="sub_live",
        status="active",
        current_start=int(start.timestamp()),
        current_end=int(end.timestamp()),
        updated_at=int(start.timestamp()),
        cancel_at_period_end=False,
        price_ref=price_ref,
        provider_mode="test",
    )


async def _sweep(session_factory, subscription_id, provider) -> None:
    """One subscription sweep, with the row made immediately due."""
    async with session_factory() as session:
        row = await session.get(BillingSubscription, subscription_id)
        row.reconciliation_next_at = None
        row.reconciliation_lease_expires_at = None
        await session.commit()
        await reconcile_current_subscriptions(session, provider)


def _captured(order_payment: dict[str, object]) -> bytes:
    return json.dumps(
        {
            "event": "payment.captured",
            "created_at": order_payment["created_at"],
            "payload": {"payment": {"entity": order_payment}},
        },
        separators=(",", ":"),
    ).encode()


async def test_upgrade_is_immediate_after_the_prorated_charge_settles(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _Provider()
    monkeypatch.setattr(billing_plan_changes, "get_billing_provider", lambda: provider)
    subscription, start, end = await _subscribed(
        client, db_session, "tier_1", "upgrade@example.com"
    )
    subscription_id, account_id = subscription.id, subscription.billing_account_id

    change = await client.post(
        "/api/v1/billing/subscription/change",
        json={"catalog_key": "tier_2"},
        headers={"Idempotency-Key": "upgrade-key-0001"},
    )
    assert change.status_code == 202, change.text
    body = change.json()
    assert (body["direction"], body["status"]) == ("upgrade", "payment_required")
    activation = body["activation"]
    # Half the period is left: half of the $50 monthly difference, as a
    # one-time order for exactly the quoted amount.
    assert activation["kind"] == "upgrade"
    assert activation["quote"]["total_price"] == {
        "currency": "USD",
        "amount_minor": 2_500,
    }
    assert provider.orders == [2_500]
    # Nothing about the plan changes before the charge is paid.
    unpaid = await client.get("/api/v1/billing/entitlement")
    assert unpaid.json()["subscription"]["scheduled_change"] is None

    paid_at = int(datetime.now(UTC).timestamp())
    payment = {
        "id": "pay_upgrade",
        "order_id": "order_upgrade",
        "status": "captured",
        "amount": 2_500,
        "currency": "USD",
        "created_at": paid_at,
        "notes": {
            "citeladder_intent_id": activation["activation_id"],
            "citeladder_account_ref": str(account_id),
        },
    }
    assert (
        await post_webhook(
            client, _captured(payment), event_id="evt_up", secret=_SECRET
        )
    ).status_code == 204

    db_session.expire_all()
    upgrade_grants = (
        await db_session.scalars(
            select(AccountGrant).where(
                AccountGrant.source_ref == f"activation:{activation['activation_id']}"
            )
        )
    ).all()
    assert upgrade_grants
    assert {grant.profile_key for grant in upgrade_grants} == {"tier_2"}
    assert {grant.valid_until for grant in upgrade_grants} == {end}
    summary = (await client.get("/api/v1/billing/entitlement")).json()["subscription"]
    assert summary["catalog_key"] == "tier_1"  # renewal terms switch at period end
    assert summary["scheduled_change"]["direction"] == "upgrade"
    assert summary["scheduled_change"]["state"] == "requested"
    documents = (await client.get("/api/v1/billing/invoices")).json()["invoices"]
    assert len(documents) == 1

    # The sweep moves the provider subscription to Growth from the next cycle.
    provider.cycle = _cycle("plan_starter", start, end)
    await _sweep(session_factory, subscription_id, provider)
    assert provider.scheduled == [("sub_live", "plan_growth")]
    summary = (await client.get("/api/v1/billing/entitlement")).json()["subscription"]
    assert summary["scheduled_change"]["state"] == "scheduled"

    # The renewal is billed on Growth: its terms swap in, the period bundle is
    # Growth's, and the renewal receipt is for the Growth amount.
    next_end = end + timedelta(days=30)
    renewal = _cycle("plan_growth", end, next_end)
    provider.cycle = replace(
        renewal,
        intent_id=str((await _base_intent(db_session)).id),
        account_ref=str(account_id),
        catalog_revision=TEST_CATALOG_REVISION,
        payment=ProviderPayment(
            external_payment_id="pay_renewal",
            external_invoice_id="inv_renewal",
            external_subscription_id="sub_live",
            status="paid",
            amount_minor=9_900,
            currency="USD",
            updated_at=renewal.updated_at,
            paid_at=renewal.current_start,
            period_start=renewal.current_start,
            period_end=renewal.current_end,
            provider_mode="test",
        ),
    )
    await _sweep(session_factory, subscription_id, provider)
    db_session.expire_all()
    renewed = await db_session.get(BillingSubscription, subscription_id)
    assert renewed is not None
    assert (renewed.catalog_key, renewed.external_price_id) == ("tier_2", "plan_growth")
    assert renewed.scheduled_change is None
    period_bundle = (
        await db_session.scalars(
            select(AccountGrant).where(
                AccountGrant.source_ref == f"subscription:{subscription_id}",
                AccountGrant.period_start == end,
            )
        )
    ).all()
    assert {grant.profile_key for grant in period_bundle} == {"tier_2"}
    documents = (await client.get("/api/v1/billing/invoices")).json()["invoices"]
    assert sorted(
        (document["amount_paid"]["amount_minor"], document["description"])
        for document in documents
    ) == [
        (2_500, "CiteLadder upgrade to Growth (prorated for the current period)"),
        (9_900, "CiteLadder Growth subscription"),
    ]


async def _base_intent(db_session: AsyncSession) -> PendingActivation:
    return (
        await db_session.scalars(
            select(PendingActivation).where(PendingActivation.activation_kind == "base")
        )
    ).one()


async def test_downgrade_is_scheduled_for_renewal_and_one_change_at_a_time(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _Provider()
    monkeypatch.setattr(
        "app.api.billing_plan_changes.adapter_for_record", lambda *_args: provider
    )
    _subscription, start, end = await _subscribed(
        client, db_session, "tier_2", "downgrade@example.com"
    )
    provider.cycle = _cycle("plan_growth", start, end)

    # A provider refusal leaves nothing scheduled.
    provider.reject_schedule = True
    refused = await client.post(
        "/api/v1/billing/subscription/change",
        json={"catalog_key": "tier_1"},
        headers={"Idempotency-Key": "downgrade-key-01"},
    )
    assert refused.status_code == 502
    summary = (await client.get("/api/v1/billing/entitlement")).json()["subscription"]
    assert summary["scheduled_change"] is None

    provider.reject_schedule = False
    scheduled = await client.post(
        "/api/v1/billing/subscription/change",
        json={"catalog_key": "tier_1"},
        headers={"Idempotency-Key": "downgrade-key-02"},
    )
    assert scheduled.status_code == 200, scheduled.text
    body = scheduled.json()
    assert (body["direction"], body["status"], body["activation"]) == (
        "downgrade",
        "scheduled",
        None,
    )
    assert datetime.fromisoformat(body["effective_at"]) == end
    assert provider.scheduled == [("sub_live", "plan_starter")]
    # No refund and no mid-period change: the current plan stays in force.
    summary = (await client.get("/api/v1/billing/entitlement")).json()["subscription"]
    assert summary["catalog_key"] == "tier_2"
    assert summary["scheduled_change"]["catalog_key"] == "tier_1"

    # Repeating the same downgrade reports it; a different change waits.
    again = await client.post(
        "/api/v1/billing/subscription/change",
        json={"catalog_key": "tier_1"},
        headers={"Idempotency-Key": "downgrade-key-03"},
    )
    assert again.status_code == 200
    assert provider.scheduled == [("sub_live", "plan_starter")]
    other = await client.post(
        "/api/v1/billing/subscription/change",
        json={"catalog_key": "tier_3"},
        headers={"Idempotency-Key": "downgrade-key-04"},
    )
    assert other.status_code == 409
    assert "plan_change_pending" in other.text
