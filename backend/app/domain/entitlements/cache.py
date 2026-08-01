# Bounded in-process entitlement cache (never caches ORM objects).
#
# Replica safety: the loader (``service.resolve_account_entitlement``) reads
# the persisted ``BillingAccount.entitlement_lifecycle_version`` on EVERY
# resolution before consulting this cache, and the key includes it. A grant,
# revocation, or base/add-on lifecycle event bumps that scalar transactionally,
# so every process misses naturally on the next lookup — correctness never
# depends on process-local invalidation. A registry revision change also
# misses naturally; stale revisions are cleared at startup/config reload.
#
# An entry's validity window (``ResolvedEntitlement.valid_until``, capped by
# the max TTL) is enforced on read rather than stored in the key: the caller
# cannot know the window before resolving, and a changed window always
# coincides with a version or revision change (already a key change).
from __future__ import annotations

import uuid
from collections import OrderedDict
from datetime import datetime

from app.core.config.entitlements import (
    ENTITLEMENT_CACHE_MAX_ENTRIES,
    ENTITLEMENT_CACHE_MAX_TTL_SECONDS,
)
from app.domain.entitlements.types import ResolvedEntitlement

_CacheKey = tuple[uuid.UUID, str, int]

_entries: OrderedDict[_CacheKey, ResolvedEntitlement] = OrderedDict()


def _is_servable(entry: ResolvedEntitlement, at: datetime) -> bool:
    if entry.valid_until is not None and at >= entry.valid_until:
        return False
    age = (at - entry.resolved_at).total_seconds()
    return age < ENTITLEMENT_CACHE_MAX_TTL_SECONDS


def get_cached(
    *,
    account_id: uuid.UUID,
    registry_revision: str,
    entitlement_lifecycle_version: int,
    at: datetime,
) -> ResolvedEntitlement | None:
    key = (account_id, registry_revision, entitlement_lifecycle_version)
    entry = _entries.get(key)
    if entry is None:
        return None
    if not _is_servable(entry, at):
        _entries.pop(key, None)
        return None
    _entries.move_to_end(key)
    return entry


def put_cached(entitlement: ResolvedEntitlement) -> None:
    key = (
        entitlement.account_id,
        entitlement.registry_revision,
        entitlement.entitlement_lifecycle_version,
    )
    _entries[key] = entitlement
    _entries.move_to_end(key)
    while len(_entries) > ENTITLEMENT_CACHE_MAX_ENTRIES:
        _entries.popitem(last=False)


def invalidate_account(account_id: uuid.UUID) -> None:
    """Eagerly evict an account's entries (optimization only; the versioned
    key already guarantees correctness without this)."""
    for key in [key for key in _entries if key[0] == account_id]:
        _entries.pop(key, None)


def invalidate_registry(revision: str) -> None:
    """Evict every entry resolved under ``revision`` (startup/config reload)."""
    for key in [key for key in _entries if key[1] == revision]:
        _entries.pop(key, None)


def clear_cache() -> None:
    """Test hook: drop every entry."""
    _entries.clear()
