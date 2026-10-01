# Site Health service for the Python routes and bridges that remain.
#
# The TypeScript service owns every Site Health read route (TypeScript
# migration PR 18b1). Python keeps the crawl list and summary, the atomic
# cancel and the monitored set for the crawl mutation routes, and the page
# reads and content hand-off the Agent and MCP bridges call until PR 19.
# Every lookup is filtered by the resolved workspace, so a foreign or missing
# id is a 404.
#
#   - ``presentation`` — pure ORM-row -> contract projections (no session);
#   - ``common``       — errors, the limit clamp, workspace-scoped loaders,
#                        typed keyset-cursor decoders;
#   - ``queries``      — crawl list/summary, monitored set, pages, page detail;
#   - ``lifecycle``    — ``cancel_crawl``.
from __future__ import annotations

from app.domain.site_health.service.aeo_readiness import get_content_handoff
from app.domain.site_health.service.common import (
    InvalidCursorError,
    SiteHealthNotFoundError,
)
from app.domain.site_health.service.lifecycle import cancel_crawl
from app.domain.site_health.service.pages import get_current_page_analysis_ids
from app.domain.site_health.service.presentation import (
    _score_summary,
    crawl_count_disclosure,
    display_label_for,
    presentation_status_for,
    project_crawl,
)
from app.domain.site_health.service.queries import (
    get_crawl_summary,
    get_monitored_set,
    get_page_detail,
    get_pages,
    list_crawls,
)

__all__ = [
    "InvalidCursorError",
    "SiteHealthNotFoundError",
    # Re-exported for the pure unit tests, which predate the split and should
    # not have to know which module it ended up in.
    "_score_summary",
    "cancel_crawl",
    "crawl_count_disclosure",
    "display_label_for",
    "get_content_handoff",
    "get_crawl_summary",
    "get_current_page_analysis_ids",
    "get_monitored_set",
    "get_page_detail",
    "get_pages",
    "list_crawls",
    "presentation_status_for",
    "project_crawl",
]
