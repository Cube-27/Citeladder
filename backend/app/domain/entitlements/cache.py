"""Compatibility no-cache boundary for entitlement authorization.

Entitlements are transaction-sensitive authorization data. Process-local state
must never answer an authorization read, so this module deliberately stores
nothing and always reports a miss. Callers resolve current database rows.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.domain.entitlements.types import ResolvedEntitlement


def get_cached(
    *,
    account_id: uuid.UUID,
    registry_revision: str,
    entitlement_lifecycle_version: int,
    at: datetime,
) -> ResolvedEntitlement | None:
    """Always miss; arguments remain for compatibility with older callers."""
    del account_id, registry_revision, entitlement_lifecycle_version, at
    return None


def put_cached(entitlement: ResolvedEntitlement) -> None:
    """Store nothing; authorization must read authoritative database state."""
    del entitlement


def invalidate_account(account_id: uuid.UUID) -> None:
    """No-op because no process-local entitlement state exists."""
    del account_id


def invalidate_registry(revision: str) -> None:
    """No-op because no process-local entitlement state exists."""
    del revision


def clear_cache() -> None:
    """No-op compatibility hook."""
