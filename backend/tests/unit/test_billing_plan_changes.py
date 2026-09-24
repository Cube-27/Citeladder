"""Plan-change pricing and the renewal that makes a scheduled change real."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.connectors.billing.base import ProviderSubscription
from app.domain.billing.plan_changes import promote_scheduled_change, prorated_minor
from app.models.billing import BillingSubscription

_START = datetime(2026, 9, 1, tzinfo=UTC)
_END = datetime(2026, 10, 1, tzinfo=UTC)


def test_upgrade_charges_the_remaining_share_of_the_price_difference() -> None:
    halfway = _START + (_END - _START) / 2
    assert (
        prorated_minor(
            difference_minor=5_000, period_start=_START, period_end=_END, at=halfway
        )
        == 2_500
    )
    # Rounds half up to the minor unit: 1/3 of 1000 = 333.33 -> 333.
    third_left = _END - (_END - _START) / 3
    assert (
        prorated_minor(
            difference_minor=1_000, period_start=_START, period_end=_END, at=third_left
        )
        == 333
    )
    # Never more than the full difference, never negative.
    assert (
        prorated_minor(
            difference_minor=5_000, period_start=_START, period_end=_END, at=_START
        )
        == 5_000
    )
    assert (
        prorated_minor(
            difference_minor=5_000,
            period_start=_START,
            period_end=_END,
            at=_END + timedelta(days=1),
        )
        == 0
    )


def _subscription() -> BillingSubscription:
    return BillingSubscription(
        external_subscription_id="sub_1",
        external_price_id="plan_growth",
        catalog_key="tier_2",
        catalog_revision="rev-1",
        currency="USD",
        frozen_terms={"catalog_key": "tier_2"},
        scheduled_change={
            "direction": "downgrade",
            "state": "scheduled",
            "catalog_key": "tier_1",
            "effective_at": _END.isoformat(),
            "source": "request",
            "terms": {
                "catalog_key": "tier_1",
                "catalog_revision": "rev-2",
                "price_ref": "plan_starter",
                "currency": "USD",
                "quantity": 1,
                "quote": {"total_price": {"currency": "USD", "amount_minor": 4_900}},
                "tax_snapshot": {},
                "grant_specs": [["project_slots", 1]],
            },
        },
    )


def _cycle(price_ref: str, start: datetime) -> ProviderSubscription:
    return ProviderSubscription(
        external_subscription_id="sub_1",
        status="active",
        current_start=int(start.timestamp()),
        current_end=int((start + timedelta(days=30)).timestamp()),
        updated_at=int(start.timestamp()),
        cancel_at_period_end=False,
        price_ref=price_ref,
    )


def test_scheduled_terms_swap_in_only_on_a_cycle_billed_on_the_new_plan() -> None:
    subscription = _subscription()
    # Still the old plan, or the new plan before the change's effective time:
    # the current terms stay in force.
    assert not promote_scheduled_change(subscription, _cycle("plan_growth", _END))
    early = _END - timedelta(days=1)
    assert not promote_scheduled_change(subscription, _cycle("plan_starter", early))
    assert subscription.catalog_key == "tier_2"

    assert promote_scheduled_change(subscription, _cycle("plan_starter", _END))
    assert (subscription.catalog_key, subscription.external_price_id) == (
        "tier_1",
        "plan_starter",
    )
    assert subscription.catalog_revision == "rev-2"
    assert subscription.frozen_terms["grant_specs"] == [["project_slots", 1]]
    assert subscription.scheduled_change is None
