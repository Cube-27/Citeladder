"""Shared traffic provenance and durable queue states."""

from typing import Any

from app.core.config.task_queue import TASK_ACTIVE_STATUSES
from app.core.config.traffic import (
    TRAFFIC_FORMULA_VERSION,
    TRAFFIC_NORMALIZATION_VERSION,
)


def traffic_policy() -> dict[str, Any]:
    return {
        "TRAFFIC_FORMULA_VERSION": TRAFFIC_FORMULA_VERSION,
        "TRAFFIC_NORMALIZATION_VERSION": TRAFFIC_NORMALIZATION_VERSION,
    }


def demand_policy() -> dict[str, Any]:
    return {"active_task_statuses": sorted(TASK_ACTIVE_STATUSES)}
