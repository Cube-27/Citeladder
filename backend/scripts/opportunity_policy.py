"""Python-owned policy for the opportunity detector foundation and verifier."""

import dataclasses
from typing import Any

from pydantic import BaseModel

from app.core.config import (
    actions,
    earned_actions,
    opportunities,
    placement,
    source_pages,
    source_patterns,
)
from app.core.config.audits import MEASUREMENT_POLICY_KEY
from app.core.config.site_health_rules import TRACKING_QUERY_PARAMS


def _value(value: Any) -> Any:
    if isinstance(value, opportunities.OpportunityRule):
        return {name: getattr(value, name) for name in value.__slots__}
    if isinstance(value, BaseModel):
        return _value(value.model_dump())
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return _value(dataclasses.asdict(value))
    if isinstance(value, (set, frozenset)):
        return [_value(item) for item in sorted(value)]
    if isinstance(value, (tuple, list)):
        return [_value(item) for item in value]
    if isinstance(value, dict):
        return _mapping(value)
    return value


def _mapping(value: dict) -> Any:
    if any(isinstance(key, tuple) for key in value):
        return [[_value(key), _value(item)] for key, item in value.items()]
    return {key: _value(item) for key, item in value.items()}


def opportunity_policy() -> dict[str, Any]:
    modules = (opportunities, earned_actions, actions, placement, source_patterns)
    return {
        **{
            module.__name__.rsplit(".", 1)[1]: {
                name: _value(value)
                for name, value in vars(module).items()
                if name.isupper()
                and not name.startswith("__")
                and name != "OPPORTUNITY_RULES"
            }
            for module in modules
        },
        "source_pages": {
            name: _value(value)
            for name, value in vars(source_pages).items()
            if name.startswith(
                ("ENTITY_KIND_", "PRESENCE_", "INSPECTION_", "PAGE_FORMAT_")
            )
            or name
            in {
                "SOURCE_PAGE_MIN_COVERAGE_CHARS",
                "SOURCE_PAGE_FORMAT_VERSION",
                "SOURCE_PAGE_INSPECTOR_VERSION",
                "SOURCE_PAGE_PRESENCE_VERSION",
            }
        },
        "measurement_policy_key": MEASUREMENT_POLICY_KEY,
        "tracking_query_params": sorted(TRACKING_QUERY_PARAMS),
    }
