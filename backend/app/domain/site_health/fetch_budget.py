"""Site Health page-fetch allowance (``site_health_page_fetches_per_period``).

Scheduled and manual crawls share one per-period allowance drawn from the
account's consumable grants: the plan's period bundle plus any Site Health
packs, earliest-expiring first. A crawl RESERVES its page budget when it is
created (before any fetch) and SETTLES once it is terminal: the pages it
actually analyzed are debited and the rest released, idempotently.

An account with no page-fetch grant at all (the free signup baseline) is not
metered here; its crawls stay bounded by the existing monitored-URL and
automatic-sample caps.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.entitlements import (
    CODE_SITE_HEALTH_FETCHES_EXHAUSTED,
    KEY_SITE_HEALTH_PAGE_FETCHES,
    LEDGER_ENTRY_RESERVATION,
)
from app.domain.billing.accounts import billing_account_id_for
from app.domain.entitlements.ledger import (
    _active_grants_in_draw_order,
    _grant_balances,
)
from app.domain.entitlements.metered import (
    MeteredSubject,
    reserve_metered_usage,
    settle_metered_usage,
)
from app.models.billing import ConsumableLedger
from app.models.site_health.crawl import SiteCrawl

_SUBJECT_KIND = "site_crawl"


class SiteHealthFetchesExhaustedError(RuntimeError):
    """A metered account has no page fetches left this period."""

    code = CODE_SITE_HEALTH_FETCHES_EXHAUSTED


async def available_page_fetches(
    session: AsyncSession, *, workspace_id: uuid.UUID, at: datetime
) -> int | None:
    """Unreserved page fetches left this period, or ``None`` when unmetered."""
    account_id = await billing_account_id_for(session, workspace_id)
    if account_id is None:
        return None
    grants = await _active_grants_in_draw_order(
        session,
        account_id=account_id,
        capability_key=KEY_SITE_HEALTH_PAGE_FETCHES,
        at=at,
    )
    if not grants:
        return None
    balances = await _grant_balances(session, grants)
    return sum(max(balance, 0) for balance in balances.values())


async def budgeted_page_limit(
    session: AsyncSession, *, workspace_id: uuid.UUID, requested: int, at: datetime
) -> tuple[int, bool]:
    """``(page limit, metered)`` for a new crawl, refusing an empty allowance.

    A metered crawl never plans more pages than the allowance has left.
    """
    budget = await available_page_fetches(session, workspace_id=workspace_id, at=at)
    if budget is None:
        return requested, False
    if budget <= 0:
        raise SiteHealthFetchesExhaustedError(
            "No Site Health page fetches remain this period"
        )
    return min(requested, budget), True


async def reserve_crawl_fetches(
    session: AsyncSession, *, crawl: SiteCrawl, units: int, at: datetime
) -> None:
    """Hold ``units`` page fetches for one new crawl (flushed, not committed)."""
    account_id = await billing_account_id_for(session, crawl.workspace_id)
    if account_id is None or units <= 0:
        return
    await reserve_metered_usage(
        session,
        account_id=account_id,
        capability_key=KEY_SITE_HEALTH_PAGE_FETCHES,
        subject=MeteredSubject(
            kind=_SUBJECT_KIND,
            subject_id=crawl.id,
            workspace_id=crawl.workspace_id,
        ),
        hold_units=units,
        idempotency_key=f"site-crawl-fetches:{crawl.id}",
        at=at,
    )


async def settle_crawl_fetches(
    session: AsyncSession, *, crawl: SiteCrawl, at: datetime
) -> None:
    """Debit the pages a terminal crawl analyzed; release the rest.

    A crawl with no reservation (unmetered) is a no-op, and a repeat call for
    an already-settled crawl changes nothing.
    """
    reservation_id = await session.scalar(
        select(ConsumableLedger.reservation_id)
        .where(
            ConsumableLedger.site_crawl_id == crawl.id,
            ConsumableLedger.entry_kind == LEDGER_ENTRY_RESERVATION,
        )
        .limit(1)
    )
    if reservation_id is None:
        return
    await settle_metered_usage(
        session,
        reservation_id=reservation_id,
        dispatch_key="crawl",
        attempt=1,
        charged_units=max(int(crawl.analyzed_url_count or 0), 0),
        unknown_usage_charge=0,
        idempotency_key=f"site-crawl-fetches:{crawl.id}:settle",
        at=at,
    )


__all__ = [
    "SiteHealthFetchesExhaustedError",
    "available_page_fetches",
    "budgeted_page_limit",
    "reserve_crawl_fetches",
    "settle_crawl_fetches",
]
