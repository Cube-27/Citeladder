"""Immediate upgrades and renewal-time downgrades of the base subscription.

Owner decisions (plan "Plan changes"):

* An UPGRADE takes effect immediately. The server charges the prorated
  difference in base price for the rest of the verified paid period as a
  one-time order (GST added by the same quote engine, with its own invoice).
  Once that charge settles, the higher plan's bundle is issued for the rest of
  the period and the provider subscription is moved to the higher plan's
  provider plan from its next cycle.
* A DOWNGRADE takes effect at the next renewal, with no refund and no
  mid-period grant change: the provider is asked to switch plans at cycle end.

Either way the subscription carries at most ONE ``scheduled_change``: the
complete frozen renewal terms of the target plan (catalog revision, provider
plan, quote, tax snapshot and grant specs). The renewal that the provider
bills on the target plan swaps those terms in, so renewal verification, the
period bundle and the renewal invoice all read the plan that was paid for.

A workspace never has two base subscriptions: a plan change edits the one it
has. One pending change at a time is enforced by ``scheduled_change`` and the
one-pending-upgrade index.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.billing.base import (
    BillingProvider,
    BillingProviderError,
    ProviderSubscription,
)
from app.core.config.billing_catalog import CatalogPrice, checkout_provider_mode
from app.core.config.billing_contracts import (
    ACTIVATION_KIND_UPGRADE,
    ACTIVATION_PENDING,
    PLAN_CHANGE_DOWNGRADE,
    PLAN_CHANGE_REJECTED,
    PLAN_CHANGE_REQUESTED,
    PLAN_CHANGE_SCHEDULED,
    PLAN_CHANGE_UPGRADE,
    REASON_PLAN_CHANGE_PENDING,
    REASON_PLAN_CHANGE_SAME_PLAN,
    REASON_PLAN_CHANGE_UNAVAILABLE,
    SUBSCRIPTION_ACTIVE,
    TAX_BEHAVIOR_EXCLUSIVE,
    UPGRADE_BUNDLE_PRIORITY,
)
from app.core.config.billing_settings import billing_settings
from app.core.config.billing_tax import BillingIdentity
from app.core.config.entitlements import GRANT_SOURCE_PLAN
from app.domain.billing.catalog_revisions import catalog_revision, grant_specs_from_row
from app.domain.billing.quotes import (
    BillingConflictError,
    ResolvedIntent,
    resolve_charge_intent,
)
from app.domain.entitlements.grants import issue_grant_bundle
from app.domain.entitlements.types import GrantSpec
from app.models.billing import BillingAccount, BillingSubscription, PendingActivation

logger = logging.getLogger("app.billing")


class PlanChangeEvidenceError(ValueError):
    """A settled upgrade's frozen change terms are missing or malformed."""


@dataclass(frozen=True, slots=True)
class PlanChange:
    """One validated plan change.

    ``terms`` are the target plan's full renewal terms. ``upgrade`` is the
    prorated one-time charge intent, present only for an upgrade.
    """

    direction: str
    subscription_id: uuid.UUID
    catalog_key: str
    terms: dict[str, object]
    effective_at: datetime
    upgrade: ResolvedIntent | None


def renewal_terms(
    intent: ResolvedIntent, grant_specs: tuple[tuple[str, int], ...]
) -> dict[str, object]:
    """The frozen terms a renewal on this plan is verified and invoiced by.

    The same shape as ``BillingSubscription.frozen_terms``, so swapping them
    in at renewal replaces the whole purchase evidence at once.
    """
    return {
        "catalog_revision": intent.quote.catalog_revision,
        "catalog_key": intent.catalog_key,
        "credential_mode": intent.credential_mode,
        "quantity": intent.quantity,
        "price_ref": intent.price_ref,
        "currency": intent.quote.total_price.currency,
        "quote": intent.quote.model_dump(mode="json"),
        "tax_snapshot": intent.tax_snapshot,
        "grant_specs": [list(spec) for spec in grant_specs],
    }


def prorated_minor(
    *, difference_minor: int, period_start: datetime, period_end: datetime, at: datetime
) -> int:
    """The share of a monthly price difference left in the current period.

    Whole seconds, ``ROUND_HALF_UP`` to the minor unit, and never more than
    the full difference or less than zero.
    """
    total = int((period_end - period_start).total_seconds())
    remaining = min(max(int((period_end - at).total_seconds()), 0), total)
    if total <= 0 or difference_minor <= 0:
        return 0
    share = Decimal(difference_minor) * Decimal(remaining) / Decimal(total)
    return int(share.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _changeable_period(
    subscription: BillingSubscription, at: datetime
) -> tuple[datetime, datetime]:
    """The current paid period of a renewing subscription with no change in
    flight; anything else cannot change plan now.
    """
    if subscription.scheduled_change:
        raise BillingConflictError(REASON_PLAN_CHANGE_PENDING)
    start, end = subscription.current_period_start, subscription.current_period_end
    if (
        subscription.status != SUBSCRIPTION_ACTIVE
        or subscription.cancel_at_period_end
        or start is None
        or end is None
        or end <= at
        or subscription.provider_mode != checkout_provider_mode()
    ):
        raise BillingConflictError(REASON_PLAN_CHANGE_UNAVAILABLE)
    return start, end


async def reject_pending_upgrade(session: AsyncSession, account_id: uuid.UUID) -> None:
    """Refuse a second change while an earlier upgrade charge is settling."""
    pending = await session.scalar(
        select(PendingActivation.id).where(
            PendingActivation.billing_account_id == account_id,
            PendingActivation.activation_kind == ACTIVATION_KIND_UPGRADE,
            PendingActivation.status == ACTIVATION_PENDING,
        )
    )
    if pending is not None:
        raise BillingConflictError(REASON_PLAN_CHANGE_PENDING)


async def resolve_plan_change(
    session: AsyncSession,
    *,
    account: BillingAccount,
    subscription: BillingSubscription,
    target: ResolvedIntent,
    identity: BillingIdentity,
    at: datetime,
) -> PlanChange:
    """Classify and price one change from the current plan to ``target``.

    ``target`` is the server-resolved base intent of the new plan in the
    account's locked billing region (it carries today's published revision,
    provider plan and GST); its base price decides the direction.
    """
    period_start, effective_at = _changeable_period(subscription, at)
    if target.catalog_key == subscription.catalog_key:
        raise BillingConflictError(REASON_PLAN_CHANGE_SAME_PLAN)
    current = (subscription.frozen_terms or {}).get("quote") or {}
    current_base = current.get("base_price") or {}
    if current_base.get("currency") != target.quote.base_price.currency:
        raise BillingConflictError(REASON_PLAN_CHANGE_UNAVAILABLE)
    revision_row = await catalog_revision(session, target.quote.catalog_revision)
    specs = grant_specs_from_row(revision_row, target.catalog_key)
    if not specs:
        raise BillingConflictError(REASON_PLAN_CHANGE_UNAVAILABLE)
    terms = renewal_terms(target, specs)
    difference = target.quote.base_price.amount_minor - int(
        current_base.get("amount_minor", 0)
    )
    if difference <= 0:
        return PlanChange(
            direction=PLAN_CHANGE_DOWNGRADE,
            subscription_id=subscription.id,
            catalog_key=target.catalog_key,
            terms=terms,
            effective_at=effective_at,
            upgrade=None,
        )
    amount = prorated_minor(
        difference_minor=difference,
        period_start=period_start,
        period_end=effective_at,
        at=at,
    )
    if amount < billing_settings.plan_change_minimum_charge_minor:
        raise BillingConflictError(REASON_PLAN_CHANGE_UNAVAILABLE)
    upgrade = resolve_charge_intent(
        kind=ACTIVATION_KIND_UPGRADE,
        catalog_key=target.catalog_key,
        quantity=1,
        price=CatalogPrice(
            currency=target.quote.base_price.currency,
            amount_minor=amount,
            tax_behavior=TAX_BEHAVIOR_EXCLUSIVE,
            provider_price_ref=target.price_ref,
            one_time=True,
        ),
        country_code=account.billing_country,
        region=target.region,
        catalog_revision=target.quote.catalog_revision,
        at=at,
        billing_identity=identity,
        change_terms={
            "subscription_id": str(subscription.id),
            "effective_at": effective_at.isoformat(),
            "terms": terms,
        },
    )
    return PlanChange(
        direction=PLAN_CHANGE_UPGRADE,
        subscription_id=subscription.id,
        catalog_key=target.catalog_key,
        terms=terms,
        effective_at=effective_at,
        upgrade=upgrade,
    )


def _scheduled(
    direction: str, terms: dict[str, object], effective_at: datetime, source: str
) -> dict[str, object]:
    return {
        "direction": direction,
        "state": PLAN_CHANGE_REQUESTED,
        "catalog_key": terms["catalog_key"],
        "effective_at": effective_at.isoformat(),
        "source": source,
        "terms": terms,
    }


async def request_downgrade(
    session: AsyncSession, subscription: BillingSubscription, change: PlanChange
) -> None:
    """Commit the downgrade BEFORE the provider is asked to schedule it."""
    subscription.scheduled_change = _scheduled(
        PLAN_CHANGE_DOWNGRADE, change.terms, change.effective_at, "request"
    )
    await session.commit()


async def settle_upgrade(
    session: AsyncSession, pending: PendingActivation, paid_at: datetime
) -> int:
    """Grant a PAID upgrade for the rest of the period and schedule the move.

    Runs inside the shared activation transaction after the payment receipt
    is recorded. The bundle outranks the lower plan's until the period ends;
    the provider plan switch is committed as ``requested`` and performed by
    the subscription sweep after this transaction commits.
    """
    change = pending.change_terms or {}
    terms = change.get("terms")
    if not isinstance(terms, dict) or not change.get("subscription_id"):
        raise PlanChangeEvidenceError("upgrade_terms_missing")
    subscription = await session.scalar(
        select(BillingSubscription)
        .where(
            BillingSubscription.id == uuid.UUID(str(change["subscription_id"])),
            BillingSubscription.billing_account_id == pending.billing_account_id,
        )
        .with_for_update()
    )
    period_end = (
        subscription.current_period_end
        if subscription is not None and subscription.is_current
        else None
    )
    if subscription is None or period_end is None or period_end <= paid_at:
        # Paid after the period it upgrades had ended: nothing left to grant.
        # The receipt stands; an operator reviews the payment for a refund.
        logger.warning("billing.upgrade_paid_after_period activation_id=%s", pending.id)
        return 0
    specs = tuple((str(key), int(value)) for key, value in terms["grant_specs"])
    rows = await issue_grant_bundle(
        session,
        account_id=pending.billing_account_id,
        source_kind=GRANT_SOURCE_PLAN,
        source_ref=f"activation:{pending.id}",
        grants=tuple(GrantSpec(key=key, value=value) for key, value in specs),
        catalog_revision=str(terms["catalog_revision"]),
        idempotency_key=f"upgrade:{pending.id}",
        valid_from=paid_at,
        valid_until=period_end,
        period_start=paid_at,
        period_end=period_end,
        bundle_role="primary",
        profile_key=pending.catalog_key,
        profile_priority=UPGRADE_BUNDLE_PRIORITY,
    )
    if subscription.scheduled_change is None and not subscription.cancel_at_period_end:
        subscription.scheduled_change = _scheduled(
            PLAN_CHANGE_UPGRADE, terms, period_end, f"activation:{pending.id}"
        )
        # Let the next subscription sweep make the provider call promptly.
        subscription.reconciliation_next_at = paid_at - timedelta(seconds=1)
    return len(rows)


async def push_scheduled_change(
    session: AsyncSession, subscription_id: uuid.UUID, provider: BillingProvider
) -> str | None:
    """Ask the provider to move the subscription at cycle end, once.

    The read transaction is closed before the provider call (invariant 8).
    A retryable failure leaves the change ``requested`` for the next sweep;
    an authoritative refusal records ``provider_rejected``.
    """
    subscription = await session.get(BillingSubscription, subscription_id)
    change = subscription.scheduled_change if subscription else None
    if subscription is None or not change:
        await session.rollback()
        return None
    if change.get("state") != PLAN_CHANGE_REQUESTED:
        await session.rollback()
        return str(change.get("state"))
    reference = subscription.external_subscription_id
    price_ref = str((change.get("terms") or {}).get("price_ref", ""))
    await session.commit()
    try:
        await provider.schedule_plan_change(reference, price_ref=price_ref)
        state = PLAN_CHANGE_SCHEDULED
    except BillingProviderError as exc:
        if exc.retryable:
            return PLAN_CHANGE_REQUESTED
        logger.warning(
            "billing.plan_change_rejected subscription_id=%s code=%s",
            subscription_id,
            exc.code,
        )
        state = PLAN_CHANGE_REJECTED
    locked = await session.scalar(
        select(BillingSubscription)
        .where(BillingSubscription.id == subscription_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    current = locked.scheduled_change if locked else None
    if locked is not None and current and current.get("source") == change["source"]:
        locked.scheduled_change = {**current, "state": state}
    await session.commit()
    return state


async def clear_scheduled_change(
    session: AsyncSession, subscription_id: uuid.UUID
) -> None:
    """Drop a change the provider refused before anything depended on it."""
    locked = await session.scalar(
        select(BillingSubscription)
        .where(BillingSubscription.id == subscription_id)
        .with_for_update()
    )
    if locked is not None:
        locked.scheduled_change = None
    await session.commit()


def promote_scheduled_change(
    subscription: BillingSubscription, record: ProviderSubscription
) -> bool:
    """Swap in the scheduled terms when the provider bills the new plan.

    Only a cycle that starts at or after the change's effective time AND is
    billed on the target provider plan proves the switch happened; anything
    else leaves the current terms in force.
    """
    change = subscription.scheduled_change
    terms = (change or {}).get("terms")
    if not change or not isinstance(terms, dict):
        return False
    if record.price_ref != terms.get("price_ref") or record.current_start is None:
        return False
    # Provider cycle bounds are whole seconds.
    effective_at = datetime.fromisoformat(str(change["effective_at"]))
    if record.current_start < int(effective_at.timestamp()):
        return False
    subscription.external_price_id = str(terms["price_ref"])
    subscription.catalog_key = str(terms["catalog_key"])
    subscription.catalog_revision = str(terms["catalog_revision"])
    subscription.currency = str(terms["currency"])
    subscription.frozen_terms = dict(terms)
    subscription.scheduled_change = None
    return True


__all__ = [
    "PlanChange",
    "PlanChangeEvidenceError",
    "clear_scheduled_change",
    "promote_scheduled_change",
    "prorated_minor",
    "push_scheduled_change",
    "reject_pending_upgrade",
    "renewal_terms",
    "request_downgrade",
    "resolve_plan_change",
    "settle_upgrade",
]
