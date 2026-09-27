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
from app.core.config.agent import OUTPUT_PHASE_OUTLINE
from app.core.config.agent_skills import CONTENT_FORMAT_IDS
from app.core.config.analytics import ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH
from app.core.config.audits import MEASUREMENT_POLICY_KEY
from app.core.config.site_change_intel import (
    CHANGE_ANALYZER_VERSION,
    CHANGE_CLASS_CRITICAL,
    CHANGE_CLASS_REGRESSION,
    CHANGE_MAX_OBSERVATIONS,
    CHANGE_STATE_AVAILABLE,
    CONTENT_CHANGE_FIELD,
)
from app.core.config.site_health_contracts import (
    CRAWL_STATUS_CANCELLED,
    CRAWL_STATUS_COMPLETED,
    CRAWL_STATUS_PARTIALLY_COMPLETED,
)
from app.core.config.site_health_rule_types import FINDING_CLASS_DEFECT
from app.core.config.site_health_rules import TRACKING_QUERY_PARAMS
from app.domain.prompts import locks, normalization
from app.domain.source_pages.persistence import OUTCOME_INSPECTED


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
        "refresh": _refresh_policy(),
        "declaration": {"output_phase_outline": OUTPUT_PHASE_OUTLINE},
    }


def _refresh_policy() -> dict[str, Any]:
    """What the Opportunity refresh and its persisted reads select and bound by."""
    return {
        "task_kind": ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH,
        # Terminal crawl statuses whose completed analyses feed detection.
        "evidence_crawl_statuses": [
            CRAWL_STATUS_COMPLETED,
            CRAWL_STATUS_PARTIALLY_COMPLETED,
            CRAWL_STATUS_CANCELLED,
        ],
        "crawl_status_completed": CRAWL_STATUS_COMPLETED,
        "finding_class_defect": FINDING_CLASS_DEFECT,
        "change_analyzer_version": CHANGE_ANALYZER_VERSION,
        "change_class_regression": CHANGE_CLASS_REGRESSION,
        "change_class_critical": CHANGE_CLASS_CRITICAL,
        "change_max_observations": CHANGE_MAX_OBSERVATIONS,
        "change_state_available": CHANGE_STATE_AVAILABLE,
        "content_change_field": CONTENT_CHANGE_FIELD,
        "source_page_outcome_inspected": OUTCOME_INSPECTED,
        "content_format_ids": list(CONTENT_FORMAT_IDS),
        # The prompt writers' project advisory lock, which recompute shares so
        # both stacks serialize on one key while a rollout overlaps them.
        "project_lock": {
            "namespace": locks._PROJECT_NAMESPACE,
            "person": locks._LOCK_PERSON.decode(),
        },
        "prompt_trailing_punctuation": normalization._TRAILING_PUNCTUATION_CHARS,
    }
