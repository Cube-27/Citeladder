"""JSON-safe export of the config-owned architecture and rule catalogs."""

from __future__ import annotations

import dataclasses
from typing import Any

from app.core.config import site_health_archetypes as archetypes
from app.core.config.site_health_rule_types import SiteHealthRule
from app.core.config.site_health_rules import SITE_HEALTH_RULES


def _json_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_value(value[key]) for key in sorted(value)}
    if isinstance(value, frozenset):
        return sorted(value)
    if isinstance(value, (tuple, list)):
        return [_json_value(item) for item in value]
    return value


def _rule(rule: SiteHealthRule) -> dict[str, Any]:
    data = {
        name: _json_value(getattr(rule, name))
        for name in rule.__slots__
        if name != "composite_contract"
    }
    contract = rule.composite_contract
    data["composite_contract"] = (
        {
            "threshold": contract.threshold,
            "atoms": [
                {name: getattr(atom, name) for name in atom.__slots__}
                for atom in contract.atoms
            ],
        }
        if contract is not None
        else None
    )
    return data


def architecture_policy() -> dict[str, Any]:
    return {
        "architecture": {
            name.removeprefix("ARCHITECTURE_").lower(): _json_value(value)
            for name, value in vars(archetypes).items()
            if name.startswith("ARCHITECTURE_")
        },
        "archetypes": {
            name.removeprefix("ARCHETYPE_").lower(): _json_value(value)
            for name, value in vars(archetypes).items()
            if name.startswith("ARCHETYPE_")
        },
        "common_structures": {
            key: [_json_value(dataclasses.asdict(item)) for item in structures]
            for key, structures in archetypes.COMMON_STRUCTURES.items()
        },
        "rule_catalog": [_rule(rule) for rule in SITE_HEALTH_RULES],
    }
