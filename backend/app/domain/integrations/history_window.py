"""How much provider history a workspace may import (plan-scoped).

The `history_window` capability has been declared, tiered, and granted since
the entitlement registry was written, but nothing ever read it — the backfill
imported the `sync_backfill_window_days` global for everyone regardless of
plan. This module is the one place that turns the resolved level into a number
of days, so the enqueue path stays a pure window computation.

Two bounds apply on top of the plan:

- `sync_backfill_max_days` (480 ≈ 16 months) caps every window. That is not an
  arbitrary budget — it is roughly Search Console's own retention, so a plan
  level above it would promise history the provider cannot return.
- A workspace with no resolved grant gets `FREE_HISTORY_WINDOW_DAYS`. It is a
  DEFAULT, not a grant: the free signup profile is frozen ("Do not add or
  remove grants"), so the allowance is expressed here instead of by issuing
  every public signup a capability row.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.entitlements import (
    HISTORY_WINDOW_VALUES,
    KEY_HISTORY_WINDOW,
)
from app.domain.entitlements.service import resolve_workspace_entitlement
from app.domain.entitlements.types import STATUS_RESOLVED

# What a workspace imports with no resolved history_window grant.
FREE_HISTORY_WINDOW_DAYS = 30

# Days per declared level. Keyed by the public value rather than the ordinal so
# reordering HISTORY_WINDOW_VALUES cannot silently re-price a plan.
HISTORY_WINDOW_DAYS: dict[str, int] = {
    "unset": FREE_HISTORY_WINDOW_DAYS,
    "90d": 90,
    "12mo": 365,
    "24mo": 730,
}


def history_window_days_for_level(level: str) -> int:
    """Days of history one declared `history_window` value allows."""
    return HISTORY_WINDOW_DAYS.get(level, FREE_HISTORY_WINDOW_DAYS)


async def resolve_history_window_days(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    at: datetime | None = None,
) -> int:
    """Days of provider history this workspace's plan allows it to import.

    Falls back to the free allowance whenever the entitlement does not
    resolve, so a billing outage shortens a backfill rather than failing the
    property selection that triggered it.
    """
    entitlement = await resolve_workspace_entitlement(
        session, workspace_id=workspace_id, at=at or datetime.now(UTC)
    )
    if entitlement.status != STATUS_RESOLVED:
        return FREE_HISTORY_WINDOW_DAYS
    ordinal = entitlement.capability_value(KEY_HISTORY_WINDOW)
    if not 0 <= ordinal < len(HISTORY_WINDOW_VALUES):
        return FREE_HISTORY_WINDOW_DAYS
    return history_window_days_for_level(HISTORY_WINDOW_VALUES[ordinal])
