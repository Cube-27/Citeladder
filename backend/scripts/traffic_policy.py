"""Python-owned traffic policy consumed by the TypeScript projection."""

from typing import Any

from app.analysis.lexical import STOP_WORDS
from app.core.config import demand, opportunities, traffic
from app.core.config.integrations_datasets import (
    DATASET_GSC_QUERY_PAGE_DAILY,
    DIMENSION_KEY_SEPARATOR,
    INTEGRATION_DATASET_TEMPLATES,
)
from app.core.config.opportunities import IMPLEMENTATION_VERIFIER_VERSION
from app.core.config.site_health_crawl_policy import URL_IDENTITY_IGNORED_QUERY_KEYS
from app.core.config.site_health_rules import (
    ALLOWED_URL_PORTS,
    ALLOWED_URL_SCHEMES,
    TRACKING_QUERY_PARAMS,
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
        "implementation_verifier_version": IMPLEMENTATION_VERIFIER_VERSION,
        "dimension_key_separator": DIMENSION_KEY_SEPARATOR,
        "dimension_arity": {
            dataset: len(template.dimensions)
            for dataset, template in INTEGRATION_DATASET_TEMPLATES.items()
        },
        "url_schemes": sorted(ALLOWED_URL_SCHEMES),
        "url_ports": sorted(ALLOWED_URL_PORTS),
        "ignored_query_keys": sorted(
            TRACKING_QUERY_PARAMS | URL_IDENTITY_IGNORED_QUERY_KEYS
        ),
    }


def demand_policy() -> dict[str, Any]:
    return {
        "query_page_dataset": DATASET_GSC_QUERY_PAGE_DAILY,
        "active_task_statuses": sorted(TASK_ACTIVE_STATUSES),
        "opportunity_versions": [
            opportunities.ANALYZER_VERSION,
            opportunities.RULE_VERSION,
            opportunities.FORMULA_VERSION,
        ],
        "stop_words": sorted(STOP_WORDS),
        **{
            name: sorted(value) if isinstance(value, frozenset) else value
            for name, value in vars(demand).items()
            if name.isupper()
        },
    }
