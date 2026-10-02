"""Python-owned traffic policy consumed by the TypeScript projection."""

from typing import Any

from app.core.config import traffic
from app.core.config.integrations_datasets import (
    DATASET_GSC_QUERY_PAGE_DAILY,
    DIMENSION_KEY_SEPARATOR,
    INTEGRATION_DATASET_TEMPLATES,
)
from app.core.config.task_queue import TASK_ACTIVE_STATUSES


def traffic_policy() -> dict[str, Any]:
    constants = {
        name: sorted(value) if isinstance(value, frozenset) else value
        for name, value in vars(traffic).items()
        if name.startswith(("TRAFFIC_", "PERFORMANCE_", "DATASET_"))
    }
    return {
        **constants,
        "dimension_key_separator": DIMENSION_KEY_SEPARATOR,
        "dimension_arity": {
            dataset: len(template.dimensions)
            for dataset, template in INTEGRATION_DATASET_TEMPLATES.items()
        },
    }


def demand_policy() -> dict[str, Any]:
    return {
        "query_page_dataset": DATASET_GSC_QUERY_PAGE_DAILY,
        "active_task_statuses": sorted(TASK_ACTIVE_STATUSES),
    }
