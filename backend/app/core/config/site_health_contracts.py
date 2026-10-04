"""Persisted schema vocabulary; application policy is native."""

from __future__ import annotations

from typing import Final

CRAWL_STATUS_DRAFT: Final = "draft"

CRAWL_STATUS_RUNNING: Final = "running"

CRAWL_STATUS_COMPLETED: Final = "completed"

DISCOVERY_STATUS_PENDING: Final = "pending"

DISCOVERY_STATUS_COMPLETED: Final = "completed"

ANALYSIS_STATUS_PENDING: Final = "pending"

PAGE_ANALYSIS_STATUS_PENDING: Final = "pending"

TASK_KIND_DISCOVER: Final = "discover"

TASK_KIND_ANALYZE: Final = "analyze"

INITIAL_TASK_GENERATION: Final = 0
