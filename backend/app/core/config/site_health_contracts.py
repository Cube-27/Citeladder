"""Shared Site Health model defaults and supported operator policy."""

from __future__ import annotations

from typing import Final

CRAWL_STATUS_DRAFT: Final = "draft"

CRAWL_STATUS_RUNNING: Final = "running"

CRAWL_STATUS_COMPLETED: Final = "completed"

CRAWL_STATUS_PARTIALLY_COMPLETED: Final = "partially_completed"

CRAWL_STATUS_FAILED: Final = "failed"

CRAWL_STATUS_CANCELLED: Final = "cancelled"

CRAWL_TERMINAL_STATUSES: Final[frozenset[str]] = frozenset(
    {
        CRAWL_STATUS_COMPLETED,
        CRAWL_STATUS_PARTIALLY_COMPLETED,
        CRAWL_STATUS_FAILED,
        CRAWL_STATUS_CANCELLED,
    }
)

DISCOVERY_STATUS_PENDING: Final = "pending"

DISCOVERY_STATUS_COMPLETED: Final = "completed"

ANALYSIS_STATUS_PENDING: Final = "pending"

PAGE_ANALYSIS_STATUS_PENDING: Final = "pending"

TASK_KIND_DISCOVER: Final = "discover"

TASK_KIND_ANALYZE: Final = "analyze"

INITIAL_TASK_GENERATION: Final = 0
