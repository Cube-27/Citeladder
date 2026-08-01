# Pure entitlement resolver fold (invariants 1, 4, 7).
#
# The fold is a PURE function over frozen value types at a caller-supplied
# ``at``: it never reads the clock, queries the DB, touches global provider
# state, or calls a connector. The service boundary (``service.py``) loads ORM
# rows into these values, invokes the fold, and fails closed on
# ``ResolverInputError``.
from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import UTC, datetime

from app.core.config.entitlements import (
    CONSUMABLE_DRAW_SOURCE_ORDER,
    GRANT_SOURCE_KINDS,
    GRANT_SOURCE_TOPUP,
    CapabilityDefinition,
    CapabilityRegistry,
    CapabilityType,
)
from app.domain.entitlements.types import (
    STATUS_RESOLVED,
    GrantInput,
    ResolvedCapability,
    ResolvedEntitlement,
    RevocationInput,
)

# A top-up with no readable current base subscription end resolves unavailable:
# its effective expiry is the distant past, so it is never active at ``at``.
_TOPUP_UNAVAILABLE = datetime.min.replace(tzinfo=UTC)
# Grants with no expiry draw after every expiring grant.
_NO_EXPIRY = datetime.max.replace(tzinfo=UTC)
_SOURCE_WEIGHT = {kind: i for i, kind in enumerate(CONSUMABLE_DRAW_SOURCE_ORDER)}


class ResolverInputError(ValueError):
    """Corrupt/missing fold input; the service boundary fails closed."""


def effective_grant_expiry(
    grant: GrantInput, subscription_end: datetime | None
) -> datetime | None:
    """The instant a grant stops counting toward resolution.

    Top-ups fund only while a base subscription is readable: their effective
    expiry is ``min(valid_until, subscription_end)`` and, with no readable
    end, the distant past (never active). Every other source uses its stored
    ``valid_until`` (None = no expiry).
    """
    if grant.source_kind != GRANT_SOURCE_TOPUP:
        return grant.valid_until
    if subscription_end is None:
        return _TOPUP_UNAVAILABLE
    if grant.valid_until is None:
        return subscription_end
    return min(grant.valid_until, subscription_end)


def ordered_consumable_grants(
    grants: tuple[GrantInput, ...], subscription_end: datetime | None
) -> tuple[uuid.UUID, ...]:
    """Total consumable draw order: effective expiry ascending, then the frozen
    source order (trial, plan, addon, override, topup), then UUID."""

    def sort_key(grant: GrantInput) -> tuple[datetime, int, bytes]:
        expiry = effective_grant_expiry(grant, subscription_end)
        return (
            expiry if expiry is not None else _NO_EXPIRY,
            _SOURCE_WEIGHT.get(grant.source_kind, len(_SOURCE_WEIGHT)),
            grant.id.bytes,
        )

    return tuple(grant.id for grant in sorted(grants, key=sort_key))


def resolve_flag(
    definition: CapabilityDefinition, active_grants: tuple[GrantInput, ...]
) -> ResolvedCapability:
    """Flags OR: any active grant with value 1 enables the flag."""
    value = 1 if any(grant.value == 1 for grant in active_grants) else 0
    return ResolvedCapability(
        key=definition.key,
        capability_type=definition.capability_type,
        value=value,
        contributing_grant_ids=tuple(grant.id for grant in active_grants),
    )


def resolve_counter(
    definition: CapabilityDefinition,
    active_grants: tuple[GrantInput, ...],
    ordered_draw_ids: tuple[uuid.UUID, ...] = (),
) -> ResolvedCapability:
    """Counters SUM: occupancy/consumable/rate allowances add across grants."""
    return ResolvedCapability(
        key=definition.key,
        capability_type=definition.capability_type,
        value=sum(grant.value for grant in active_grants),
        contributing_grant_ids=tuple(grant.id for grant in active_grants),
        ordered_draw_grant_ids=ordered_draw_ids,
    )


def resolve_level(
    definition: CapabilityDefinition, active_grants: tuple[GrantInput, ...]
) -> ResolvedCapability:
    """Levels MAX: the highest granted ordinal wins (never SUM)."""
    return ResolvedCapability(
        key=definition.key,
        capability_type=definition.capability_type,
        value=max((grant.value for grant in active_grants), default=0),
        contributing_grant_ids=tuple(grant.id for grant in active_grants),
    )


def _validate_grant(grant: GrantInput, registry: CapabilityRegistry) -> None:
    definition = registry.get(grant.key)
    if definition is None:
        raise ResolverInputError(f"unknown capability key in grant: {grant.key!r}")
    if grant.source_kind not in GRANT_SOURCE_KINDS:
        raise ResolverInputError(f"unknown grant source kind: {grant.source_kind!r}")
    if definition.capability_type is CapabilityType.FLAG:
        if grant.value not in (0, 1):
            raise ResolverInputError(f"flag grant value not 0/1: {grant.key!r}")
    elif definition.capability_type is CapabilityType.LEVEL:
        if not 0 <= grant.value < len(definition.ordered_values):
            raise ResolverInputError(f"level grant ordinal out of range: {grant.key!r}")
    elif grant.value < 0:
        raise ResolverInputError(f"counter grant value negative: {grant.key!r}")


def _earliest_revocations(
    revocations: tuple[RevocationInput, ...],
) -> dict[uuid.UUID, datetime]:
    earliest: dict[uuid.UUID, datetime] = {}
    for revocation in revocations:
        current = earliest.get(revocation.grant_id)
        if current is None or revocation.effective_from < current:
            earliest[revocation.grant_id] = revocation.effective_from
    return earliest


def _is_active(
    grant: GrantInput,
    revoked_at: dict[uuid.UUID, datetime],
    subscription_end: datetime | None,
    at: datetime,
) -> bool:
    if grant.valid_from > at:
        return False
    revocation = revoked_at.get(grant.id)
    if revocation is not None and revocation <= at:
        return False
    expiry = effective_grant_expiry(grant, subscription_end)
    return expiry is None or at < expiry


def _next_change_at(
    grants: tuple[GrantInput, ...],
    revoked_at: dict[uuid.UUID, datetime],
    subscription_end: datetime | None,
    at: datetime,
) -> datetime | None:
    """Earliest future instant at which this key's resolved value may change."""
    candidates: list[datetime] = []
    for grant in grants:
        if grant.valid_from > at:
            candidates.append(grant.valid_from)
        expiry = effective_grant_expiry(grant, subscription_end)
        if expiry is not None and expiry > at:
            candidates.append(expiry)
        revocation = revoked_at.get(grant.id)
        if revocation is not None and revocation > at:
            candidates.append(revocation)
    return min(candidates) if candidates else None


def _resolve_capability(
    definition: CapabilityDefinition,
    active_grants: tuple[GrantInput, ...],
    revoked_at: dict[uuid.UUID, datetime],
    subscription_end: datetime | None,
    at: datetime,
) -> ResolvedCapability:
    if definition.capability_type is CapabilityType.FLAG:
        resolved = resolve_flag(definition, active_grants)
    elif definition.capability_type is CapabilityType.LEVEL:
        resolved = resolve_level(definition, active_grants)
    elif definition.capability_type is CapabilityType.COUNTER_CONSUMABLE:
        resolved = resolve_counter(
            definition,
            active_grants,
            ordered_draw_ids=ordered_consumable_grants(active_grants, subscription_end),
        )
    else:
        resolved = resolve_counter(definition, active_grants)
    return replace(
        resolved,
        next_change_at=_next_change_at(active_grants, revoked_at, subscription_end, at),
    )


def _entitlement_valid_until(
    grants: tuple[GrantInput, ...],
    revocations: tuple[RevocationInput, ...],
    subscription_end: datetime | None,
    at: datetime,
) -> datetime | None:
    """Earliest future grant start/end, revocation, or period boundary."""
    candidates: list[datetime] = []
    for grant in grants:
        if grant.valid_from > at:
            candidates.append(grant.valid_from)
        expiry = effective_grant_expiry(grant, subscription_end)
        if expiry is not None and expiry > at:
            candidates.append(expiry)
    for revocation in revocations:
        if revocation.effective_from > at:
            candidates.append(revocation.effective_from)
    if subscription_end is not None and subscription_end > at:
        candidates.append(subscription_end)
    return min(candidates) if candidates else None


def fold_entitlement(
    *,
    account_id: uuid.UUID,
    grants: tuple[GrantInput, ...],
    revocations: tuple[RevocationInput, ...],
    registry: CapabilityRegistry,
    subscription_end: datetime | None,
    entitlement_lifecycle_version: int,
    at: datetime,
) -> ResolvedEntitlement:
    """Fold immutable grants/revocations into one resolved entitlement.

    Validates every key/value against the registry BEFORE resolving anything
    (a single corrupt row fails the whole fold — never a partial fold). The
    persisted account version is returned as provenance/cache identity;
    capability values derive only from grants/revocations/registry/subscription
    end at ``at``.
    """
    for grant in grants:
        _validate_grant(grant, registry)
    revoked_at = _earliest_revocations(revocations)
    active_by_key: dict[str, list[GrantInput]] = {}
    for grant in grants:
        if _is_active(grant, revoked_at, subscription_end, at):
            active_by_key.setdefault(grant.key, []).append(grant)
    capabilities = tuple(
        _resolve_capability(
            registry.require(key),
            tuple(key_grants),
            revoked_at,
            subscription_end,
            at,
        )
        for key, key_grants in sorted(active_by_key.items())
    )
    return ResolvedEntitlement(
        account_id=account_id,
        registry_revision=registry.revision,
        entitlement_lifecycle_version=entitlement_lifecycle_version,
        resolved_at=at,
        valid_until=_entitlement_valid_until(grants, revocations, subscription_end, at),
        status=STATUS_RESOLVED,
        capabilities=capabilities,
        errors=(),
    )
