"""Shared commercial catalog, tax and operator/schema policy inputs."""

from __future__ import annotations

from typing import Any

from app.core.config import billing_contracts
from app.core.config import entitlements as entitlements_config
from app.core.config.billing_contracts import SUBSCRIPTION_KIND_BASE


def billing_policy() -> dict[str, Any]:
    return {
        "contracts": {
            name.lower(): sorted(value) if isinstance(value, frozenset) else value
            for name, value in vars(billing_contracts).items()
            if name.isupper()
        },
    }


def entitlements_policy() -> dict[str, Any]:
    """The capability registry and the account-capacity lock both stacks take."""
    ent = entitlements_config
    registry = ent.CAPABILITY_REGISTRY
    return {
        "registry_revision": registry.revision,
        "capabilities": {
            entry.key: {
                "type": entry.capability_type.value,
                "levels": len(entry.ordered_values),
                "ordered_values": list(entry.ordered_values),
                "issuable": entry.issuable,
                "public": entry.public,
                "rolling_window_seconds": entry.rolling_window_seconds,
            }
            for entry in registry.entries
        },
        "grant_source_kinds": sorted(ent.GRANT_SOURCE_KINDS),
        "draw_source_order": list(ent.CONSUMABLE_DRAW_SOURCE_ORDER),
        "paid_access_sources": [ent.GRANT_SOURCE_ADDON, ent.GRANT_SOURCE_TOPUP],
        "base_subscription_kind": SUBSCRIPTION_KIND_BASE,
        "prompt_slots": ent.KEY_PROMPT_SLOTS,
        "project_slots": ent.KEY_PROJECT_SLOTS,
        "project_deletion": ent.KEY_PROJECT_DELETION,
        "capacity_lock": {
            "namespace": ent.OCCUPANCY_LOCK_NAMESPACE,
            "person": ent.OCCUPANCY_LOCK_PERSON,
        },
        "baseline": {
            "revision": ent.BASELINE_GRANT_REVISION,
            "source_kind": ent.GRANT_SOURCE_OVERRIDE,
            "grants": {
                ent.KEY_PROJECT_SLOTS: ent.FREE_PROJECT_SLOTS,
                ent.KEY_PROMPT_SLOTS: ent.FREE_PROMPT_SLOTS,
                ent.KEY_MONITORED_URLS: ent.FREE_MONITORED_URLS,
            },
        },
        "codes": {
            "limit_exceeded": ent.CODE_OCCUPANCY_LIMIT_EXCEEDED,
            "unresolved": ent.CODE_OCCUPANCY_UNRESOLVED,
            "capability_not_granted": ent.CODE_CAPABILITY_NOT_GRANTED,
        },
    }
