"""Frozen subscription-period evidence and recurring grant issuance."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_catalog import scale_grant_specs
from app.core.config.billing_contracts import (
    SUBSCRIPTION_ACTIVE,
    SUBSCRIPTION_CANCEL_SCHEDULED,
    SUBSCRIPTION_KIND_ADDON,
)
from app.core.config.entitlements import GRANT_SOURCE_ADDON, GRANT_SOURCE_PLAN
from app.domain.entitlements.grants import issue_grant_bundle
from app.domain.entitlements.types import GrantSpec
from app.models.billing import AccountGrant, BillingSubscription

logger = logging.getLogger("app.billing")
_GRANT_AUTHORITY_STATUSES = frozenset(
    {SUBSCRIPTION_ACTIVE, SUBSCRIPTION_CANCEL_SCHEDULED}
)


class PeriodEvidenceError(ValueError):
    """Authoritative cycle evidence is missing or conflicts with history."""


def _period_bounds(
    period_start: datetime | None, period_end: datetime | None
) -> tuple[datetime, datetime]:
    if period_start is None or period_end is None:
        raise PeriodEvidenceError("subscription_period_bounds_missing")
    if period_start >= period_end:
        raise PeriodEvidenceError("subscription_period_bounds_invalid")
    return period_start, period_end


def _frozen_grant_specs(
    subscription: BillingSubscription,
) -> tuple[tuple[str, int], ...]:
    raw_specs = (subscription.frozen_terms or {}).get("grant_specs")
    if not isinstance(raw_specs, list):
        return ()
    return tuple((str(spec[0]), int(spec[1])) for spec in raw_specs)


async def issue_period_bundle(
    session: AsyncSession,
    *,
    subscription: BillingSubscription,
    status: str,
    period_start: datetime | None,
    period_end: datetime | None,
) -> None:
    """Issue one frozen bundle for the canonical subscription-period-purpose."""
    if status not in _GRANT_AUTHORITY_STATUSES:
        return
    start, end = _period_bounds(period_start, period_end)
    conflicting = await session.scalar(
        select(AccountGrant.id)
        .where(
            AccountGrant.source_ref == f"subscription:{subscription.id}",
            AccountGrant.period_start.is_not(None),
            AccountGrant.period_end.is_not(None),
            AccountGrant.period_start < end,
            AccountGrant.period_end > start,
            AccountGrant.period_start != start,
        )
        .limit(1)
    )
    if conflicting is not None:
        raise PeriodEvidenceError("subscription_period_overlap")
    templates = _frozen_grant_specs(subscription)
    if not templates:
        logger.warning(
            "subscription renewal resolved no frozen grant specs",
            extra={
                "catalog_key": subscription.catalog_key,
                "catalog_revision": subscription.catalog_revision,
            },
        )
        return
    templates = scale_grant_specs(templates, max(subscription.quantity, 1))
    purpose = subscription.subscription_kind
    period_identity = f"{start.isoformat()}:{end.isoformat()}"
    is_addon = purpose == SUBSCRIPTION_KIND_ADDON
    await issue_grant_bundle(
        session,
        account_id=subscription.billing_account_id,
        source_kind=GRANT_SOURCE_ADDON if is_addon else GRANT_SOURCE_PLAN,
        source_ref=f"subscription:{subscription.id}",
        grants=tuple(GrantSpec(key=key, value=value) for key, value in templates),
        catalog_revision=subscription.catalog_revision,
        idempotency_key=f"sub:{subscription.id}:{period_identity}:{purpose}",
        valid_from=start,
        valid_until=end,
        period_start=start,
        period_end=end,
        bundle_role="supplement" if is_addon else "primary",
        profile_key="" if is_addon else subscription.catalog_key,
        profile_priority=0 if is_addon else 200,
    )
