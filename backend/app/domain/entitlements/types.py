# Frozen value types for the v8 entitlement resolver fold.
#
# These are the pure, immutable inputs/outputs of the resolver fold. They carry
# no ORM references, open no sessions, and call no clock or connector — the
# fold is a pure function over these values at a caller-supplied ``at``
# (invariants 1, 4, 7). Service code is responsible for loading ORM rows into
# these types and for projecting the resolved values back out.
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from app.core.config.entitlements import CapabilityType

# ResolvedEntitlement.status vocabulary.
STATUS_RESOLVED: Literal["resolved"] = "resolved"
STATUS_ENTITLEMENT_UNRESOLVED: Literal["entitlement_unresolved"] = (
    "entitlement_unresolved"
)
ResolverStatus = Literal["resolved", "entitlement_unresolved"]


@dataclass(frozen=True, slots=True)
class GrantInput:
    """One persisted AccountGrant reduced to its resolver-relevant fields."""

    id: uuid.UUID
    key: str
    value: int
    source_kind: str  # plan | addon | topup | trial | override
    valid_from: datetime
    valid_until: datetime | None
    period_start: datetime | None = None
    period_end: datetime | None = None


@dataclass(frozen=True, slots=True)
class RevocationInput:
    """One persisted GrantRevocation reduced to its resolver-relevant fields."""

    grant_id: uuid.UUID
    effective_from: datetime


@dataclass(frozen=True, slots=True)
class ResolvedCapability:
    """The folded value of one capability key at resolution time."""

    key: str
    capability_type: CapabilityType
    value: int
    contributing_grant_ids: tuple[uuid.UUID, ...] = ()
    # Consumable draw order: grant IDs in the exact order units are spent.
    ordered_draw_grant_ids: tuple[uuid.UUID, ...] = ()
    # The next timestamp at which this resolved value may change.
    next_change_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class ResolvedEntitlement:
    """The folded, provenance-complete entitlement for one billing account."""

    account_id: uuid.UUID
    registry_revision: str
    entitlement_lifecycle_version: int
    resolved_at: datetime
    valid_until: datetime | None
    status: ResolverStatus
    capabilities: tuple[ResolvedCapability, ...] = ()
    errors: tuple[str, ...] = field(default_factory=tuple)

    def capability(self, key: str) -> ResolvedCapability | None:
        for capability in self.capabilities:
            if capability.key == key:
                return capability
        return None

    def capability_value(self, key: str) -> int:
        resolved = self.capability(key)
        return resolved.value if resolved is not None else 0

    def has_flag(self, key: str) -> bool:
        return self.capability_value(key) == 1


def no_capability_entitlement(
    *,
    account_id: uuid.UUID,
    registry_revision: str,
    entitlement_lifecycle_version: int,
    at: datetime,
    errors: tuple[str, ...] = (),
) -> ResolvedEntitlement:
    """Fail-closed entitlement: empty capabilities, no draw order, no funding.

    Returned whenever the resolver input is corrupt/missing or the fold cannot
    complete. Never a partial fold — an unresolved entitlement grants nothing.
    """
    return ResolvedEntitlement(
        account_id=account_id,
        registry_revision=registry_revision,
        entitlement_lifecycle_version=entitlement_lifecycle_version,
        resolved_at=at,
        valid_until=None,
        status=STATUS_ENTITLEMENT_UNRESOLVED,
        capabilities=(),
        errors=errors,
    )
