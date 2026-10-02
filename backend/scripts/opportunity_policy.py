"""Minimal Python model defaults and provenance bridge for native Opportunities."""

from typing import Any

from app.core.config import (
    actions,
    opportunities,
    placement,
    source_pages,
    source_patterns,
)
from app.core.config.analytics import ANALYTICS_TASK_KIND_OPPORTUNITY_REFRESH
from app.core.config.site_health_contracts import (
    CRAWL_STATUS_CANCELLED,
    CRAWL_STATUS_COMPLETED,
    CRAWL_STATUS_PARTIALLY_COMPLETED,
)


def opportunity_policy() -> dict[str, Any]:
    """Shared persisted defaults and versions; detection policy is native."""
    return {
        "opportunities": {
            "ANALYZER_VERSION": opportunities.ANALYZER_VERSION,
            "RULE_VERSION": opportunities.RULE_VERSION,
            "FORMULA_VERSION": opportunities.FORMULA_VERSION,
        },
        "actions": {"ACTION_STATUS_OPEN": actions.ACTION_STATUS_OPEN},
        "placement": {
            "PLACEMENT_CHECKER_VERSION": placement.PLACEMENT_CHECKER_VERSION,
            "PLACEMENT_STATE_PENDING": placement.PLACEMENT_STATE_PENDING,
        },
        "source_patterns": {
            "SOURCE_ORIGIN_EXTERNAL": source_patterns.SOURCE_ORIGIN_EXTERNAL,
        },
        "source_pages": {
            "INSPECTION_NOT_INSPECTED": source_pages.INSPECTION_NOT_INSPECTED,
            "PAGE_FORMAT_UNRESOLVED": source_pages.PAGE_FORMAT_UNRESOLVED,
        },
        "refresh": _refresh_policy(),
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
    }
