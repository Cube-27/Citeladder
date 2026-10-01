# Site Health API request/response DTOs (Slice 6).
#
# Every response model mirrors the checked-in strict frontend zod schema in
# ``frontend/lib/api/schemas.ts`` field-for-field so the two contracts can never
# drift (the frontend parses each payload with ``.strict()`` — an extra or
# missing key fails loud). The API layer builds these DTOs from persisted rows
# only (the service owns the projection rules); nothing here re-scores, fetches,
# or fabricates a metric. Count-bearing fields the backend redacts for a Free
# workspace are ``None`` (never a number), never leaking a full-site total.
from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SelectionSource = Literal["user", "free_sample", "bootstrap"]
MeasurementState = Literal["measured", "limited_evidence", "not_measured", "excluded"]
ClassificationState = Literal["complete", "partial", "not_measured"]
SearchEligibility = Literal["eligible", "blocked", "unknown", "excluded"]


class _Model(BaseModel):
    # Reject unknown keys on the way IN (request bodies) as loudly as the
    # frontend rejects them on the way OUT.
    model_config = ConfigDict(extra="forbid")


# =========================================================================
# Requests
# =========================================================================
class CreateCrawlRequest(_Model):
    project_id: uuid.UUID
    include_globs: list[str] | None = None
    exclude_globs: list[str] | None = None
    seed: str | None = None
    input_mode: Literal["auto", "exact_urls", "discovery_seeds"] | None = None
    requested_page_limit: int | None = Field(default=None, ge=1)
    discovery_count: int | None = Field(default=None, ge=1)
    seed_urls: list[str] | None = None
    page_kinds: list[str] | None = None


class UrlPreviewRequest(_Model):
    project_id: uuid.UUID
    content: str | list[str] | dict
    input_format: Literal["text", "csv", "json"] = "text"
    include_globs: list[str] | None = None
    exclude_globs: list[str] | None = None


class UrlPreviewRow(_Model):
    row: int
    input: str
    accepted: bool
    canonical_url: str | None
    reason_code: str | None
    value_kind: str
    priority: int


class UrlPreviewResponse(_Model):
    items: list[UrlPreviewRow]
    truncated: bool
    counts: dict[str, int]
    policy_version: str


class ReplaceMonitoredRequest(_Model):
    site_url_ids: list[uuid.UUID]
    expected_selection_version: int


class BulkSelectMonitoredRequest(_Model):
    """Server-resolved bulk selection of monitored URLs.

    ``first_n`` selects the first ``count`` admitted URLs of ``crawl_id`` in
    the inventory's ``(normalized_url, id)`` order (``count`` required);
    ``all`` selects every admitted URL; ``none`` clears the selection.
    ``query`` applies the same substring filter as the inventory listing, so
    "select first N" matches exactly what a filtered inventory shows.
    """

    mode: Literal["first_n", "all", "none"]
    crawl_id: uuid.UUID
    count: int | None = None
    query: str | None = None
    expected_selection_version: int


class RerunPageResponse(_Model):
    """Identity/status returned by the per-page rerun (202) so the frontend can

    poll the FRESH rerun. When ``created_new_crawl`` is ``True`` the rerun runs
    in a NEW crawl (the source crawl was terminal) and the client should poll
    ``crawl_id`` (not the crawl it came from). ``analysis_status`` is the fresh
    crawl's analysis sub-state at enqueue time (``pending`` for a new crawl) so
    polling starts from a known non-terminal baseline.
    """

    crawl_id: uuid.UUID
    site_url_id: uuid.UUID
    task_id: uuid.UUID
    created_new_crawl: bool
    analysis_status: str


# =========================================================================
# Crawl
# =========================================================================
class ScoreSummaryByType(_Model):
    """One page type's rollup inside ``score_summary.by_page_kind`` (v2 P1)."""

    analyzed_count: int
    web_fundamentals_score: float | None
    web_fundamentals_coverage: float | None
    web_fundamentals_state: MeasurementState
    aeo_readiness_score: float | None
    aeo_measurement_coverage: float | None
    aeo_measurement_state: MeasurementState
    aeo_measurement_reason: str


class ScoreSummary(_Model):
    web_fundamentals_score: float | None
    web_fundamentals_coverage: float | None
    web_fundamentals_state: MeasurementState
    aeo_readiness_score: float | None
    aeo_measurement_coverage: float | None
    aeo_measurement_state: MeasurementState
    search_eligibility: SearchEligibility
    selected_count: int
    analyzed_count: int
    issue_count: int
    scoring_version: str
    classified_page_count: int
    other_page_count: int
    classification_error_page_count: int
    classification_expected_page_count: int
    classification_coverage: float | None
    classification_state: ClassificationState
    classification_reason_groups: dict[str, int]
    classification_formula_version: str
    classification_source_analysis_ids: list[uuid.UUID]
    classification_source_artifact_ids: list[uuid.UUID]
    classification_source_task_ids: list[uuid.UUID]
    scored_page_kind_set: list[str]
    scored_page_count_by_kind: dict[str, int]
    # Per-page-type breakdown (only types with >= 1 analyzed URL appear).
    by_page_kind: dict[str, ScoreSummaryByType] = {}


class CrawlFailureSummary(_Model):
    # Why a crawl failed (SH-2/SH-5 — B1): stable machine ``code`` + human
    # ``message`` + the terminal HTTP status / attempt count when present.
    # Projected from the root discover task's terminal fetch attempts — the
    # same shape that rides the ``crawl.failed`` event payload.
    code: str
    message: str
    attempts: int | None
    status_code: int | None
    target_url: str


class CrawlActivity(_Model):
    state: Literal["working", "waiting", "stalled", "terminal"]
    reason: Literal[
        "active_work",
        "host_gate",
        "retry_backoff",
        "expired_lease",
        "terminal",
    ]
    queue_depth: int
    next_available_at: str | None


class CrawlCounters(_Model):
    discovered: int | None
    selected: int
    queued: int
    running: int
    analyzed: int
    errors: int
    blocked: int
    failure_breakdown: dict[
        Literal["robots_denied", "http_4xx", "http_5xx", "timeout"], int
    ]
    activity: CrawlActivity
    by_page_kind: dict[str, int] = {}


class CrawlResponse(_Model):
    id: uuid.UUID
    workspace_id: uuid.UUID
    project_id: uuid.UUID
    profile_id: uuid.UUID
    status: str
    discovery_status: str
    analysis_status: str
    root_url: str
    sample_mode: bool
    seed: str
    inventory_complete: bool
    # Why a PARTIALLY_COMPLETED crawl is partial: URLs that could not be
    # fetched during discovery, analyses that fell short, or both. Empty on
    # every other status. Unreachable links are routine on a real site and are
    # NOT an analysis failure, so the two can never share one message.
    partial_reason: Literal[
        "",
        "discovery_incomplete",
        "analysis_incomplete",
        "discovery_and_analysis_incomplete",
    ] = ""
    visible_url_count: int
    analyzed_count: int
    failed_count: int
    discovery_requested_count: int
    analysis_requested_count: int
    counters: CrawlCounters
    # Redactable count fields (Free → None, never a number).
    discovered_count: int | None = None
    total_url_count: int | None = None
    has_more_site_urls: bool | None = None
    score_summary: ScoreSummary | None = None
    # B1: present only on a failed crawl whose root fetch failed; ``None`` on
    # healthy/partial crawls and on list projections (N+1 avoidance).
    failure_summary: CrawlFailureSummary | None = None
    # v2 P2: bounded site-level facts (robots AI stance / llms.txt / sitemap
    # files); no discovered totals inside, so it is never redacted.
    site_facts: dict | None = None
    extractor_version: str
    analyzer_version: str
    rule_version: str
    scoring_version: str
    error_message: str
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None


class CrawlListPage(_Model):
    items: list[CrawlResponse]
    next_cursor: str | None


# =========================================================================
# Monitored set
# =========================================================================
class MonitoredQuota(_Model):
    used: int
    limit: int


class MonitoredUrl(_Model):
    site_url_id: uuid.UUID
    normalized_url: str
    display_url: str
    title: str | None
    active: bool
    selection_source: SelectionSource
    selected_at: str | None
    deselected_at: str | None


class MonitoredUrlsResponse(_Model):
    project_id: uuid.UUID
    selection_version: int
    monitored_urls: list[MonitoredUrl]
    quota: MonitoredQuota
