# Analysis/metrics + dashboard response DTOs (B6, projections only — invariant 7).
#
# Every response here is a PROJECTION of persisted analysis rows: the metrics
# endpoint serves the ``MetricSnapshot``, the dashboard serves a server-side
# view over the same snapshot, and the execution-evidence endpoint serves one
# ``ResponseAnalysis`` + its child rows. No provider is ever called to build
# these (invariant 7). Sentiment + average position are present but null until
# a tone-scoring stage is added (sentiment only).
from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.domain.audits.schemas import ModelProvenance


class MetricsResponse(BaseModel):
    """Single-run ``MetricSnapshot`` projection (``GET /audits/{id}/metrics``)."""

    model_config = ConfigDict(from_attributes=True)

    audit_id: uuid.UUID
    project_id: uuid.UUID
    analyzer_version: str
    scoring_rule_version: str
    total_completed: int
    total_failed: int
    visibility_score: float
    metrics: dict = Field(default_factory=dict)
    created_at: datetime


class MeasurementCounts(BaseModel):
    state: str = "unavailable"
    responses: int = 0
    brand_responses: int | None = None
    owned_citation_responses: int | None = None
    entity_presences: int | None = None
    expected: int | None = None
    failed: int | None = None
    not_run: int | None = None

    @property
    def is_complete(self) -> bool:
        """Every expected response was actually observed.

        An unknown expectation is NOT complete. Coverage decides whether a
        comparison may be stated without qualification, so the three places
        that ask spell the same question one way — a fourth spelling of it
        that drifted would be a movement claim over a partial measurement.
        """
        return self.expected is not None and self.responses == self.expected


class SourceRow(BaseModel):
    key: str
    responses: int
    prompts: int
    annotations: int
    urls: int
    response_rate: float | None = None
    prompt_coverage: float | None = None
    ownership: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    taxonomy_versions: list[str] = Field(default_factory=list)
    category_unavailable: bool = False
    response_delta: float | None = None


class CitationTotals(BaseModel):
    """Citation-level counts, distinct from the answer-level citation rate."""

    citations: int = 0
    owned_citations: int = 0
    owned_share: float | None = None


class SourcesResponse(BaseModel):
    items: list[SourceRow] = Field(default_factory=list)
    total: int = 0
    responses: int = 0
    prompts: int = 0
    # Domains per source class across the WHOLE filtered selection, not the
    # page. A client folding only the rows it loaded would chart page one.
    category_totals: dict[str, int] = Field(default_factory=dict)
    next_offset: int | None = None
    as_of: datetime
    comparison_status: str = "no_baseline"


class FanoutQueryRow(BaseModel):
    query: str
    event_count: int
    prompt_count: int
    engines: list[str]
    response_count: int
    brand_response_count: int


class FanoutAnswer(BaseModel):
    audit_id: uuid.UUID
    task_id: uuid.UUID
    prompt_text: str
    logical_engine: str
    brand_mentioned: bool
    owned_domain_cited: bool


class FanoutResponse(BaseModel):
    event_count: int = 0
    distinct_queries: int = 0
    coverage: dict[str, int] = Field(default_factory=dict)
    items: list[FanoutQueryRow] = Field(default_factory=list)
    next_offset: int | None = None
    answers: list[FanoutAnswer] = Field(default_factory=list)
    total_answers: int = 0


class PromptOutcome(BaseModel):
    logical_engine: str
    transport_model: str
    counts: MeasurementCounts
    visibility_rate: float | None = None
    owned_citation_rate: float | None = None
    gap_counts: dict[str, int] = Field(default_factory=dict)


class PromptMetricItem(BaseModel):
    """Persisted prompt score and movement, ordered strongest-to-weakest."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audit_id: uuid.UUID
    prompt_id: uuid.UUID | None = None
    prompt_index: int
    prompt_text: str
    cohort: str
    prompt_snapshot_id: uuid.UUID | None = None
    composite_score: float | None
    source_audit_ids: list[uuid.UUID] = Field(default_factory=list)
    previous_score: float | None = None
    immediate_delta: float | None = None
    rolling_four: list[float] = Field(default_factory=list)
    per_engine_scores: dict[str, float] = Field(default_factory=dict)
    components: dict[str, float | None] = Field(default_factory=dict)
    engine_agreement: float
    repetition_agreement: float
    evidence_coverage: float
    trend_confidence: float
    decline_confirmed: bool
    analyzer_version: str
    scoring_rule_version: str
    created_at: datetime
    theme: str = ""
    intent: str = ""
    visibility_rate: float | None = None
    owned_citation_rate: float | None = None
    # Mean rank among the brands named in this prompt's answers.
    avg_position: float | None = None
    visibility_delta: float | None = None
    comparison_status: str = "no_baseline"
    counts: MeasurementCounts = Field(default_factory=MeasurementCounts)
    outcomes: list[PromptOutcome] = Field(default_factory=list)
    comparison: VisibilityComparison | None = None


class RankingRow(BaseModel):
    """One brand-vs-competitor rankings-table row for the dashboard."""

    name: str
    is_brand: bool = False
    logo_url: str | None = None
    website_url: str | None = None
    mention_rate: float | None = None
    citation_rate: float | None = None
    share_of_voice: float | None = None
    mention_count: int = 0
    visibility_delta: float | None = None
    gap_count: int | None = None
    matched_visibility_rate: float | None = None
    matched_visibility_delta: float | None = None
    matched_response_count: int | None = None
    # `avg_position` is deterministic (mention offsets); `sentiment` stays null
    # until a tone-scoring stage exists.
    sentiment: str | None = None
    avg_position: float | None = None


class VisibilityComparison(BaseModel):
    status: str = "no_baseline"
    baseline_audit_id: uuid.UUID | None = None
    baseline_audit_ids: list[uuid.UUID] = Field(default_factory=list)
    baseline_at: datetime | None = None
    baseline_counts: MeasurementCounts | None = None
    current_counts: MeasurementCounts | None = None
    deltas: dict[str, float | None] = Field(default_factory=dict)
    rankings: list[RankingRow] = Field(default_factory=list)
    skipped_runs: int = 0
    matched_cells: int = 0
    current_cells: int = 0
    baseline_cells: int = 0
    current_values: dict[str, float | None] = Field(default_factory=dict)
    baseline_values: dict[str, float | None] = Field(default_factory=dict)
    current_rankings: list[RankingRow] = Field(default_factory=list)


class EngineComparisonRow(BaseModel):
    """One per-engine comparison row for the selected run."""

    logical_engine: str
    total_completed: int
    brand_mention_rate: float | None = None
    owned_citation_rate: float | None = None
    search_use_rate: float | None = None
    visibility_score: float | None = None
    counts: MeasurementCounts = Field(default_factory=MeasurementCounts)


class VisibilityResponse(BaseModel):
    """Selected-run dashboard projection (``GET /projects/{id}/visibility``).

    Computed server-side from the persisted ``MetricSnapshot`` for the selected
    audit (defaults to the project's latest completed audit). No cross-run trend
    yet (roadmap). Visibility %, SOV and average position are populated;
    sentiment stays null until a tone-scoring stage exists.
    """

    project_id: uuid.UUID
    audit_id: uuid.UUID
    audit_status: str
    analyzer_version: str
    scoring_rule_version: str
    cohort: str = "core"
    coverage: dict[str, int | float | None] = Field(default_factory=dict)
    total_completed: int
    total_failed: int
    # Historical composite alias; never a presence percentage.
    visibility_score: float | None
    visibility_rate: float | None = None
    prompt_performance_score: float | None = None
    owned_citation_rate: float | None = None
    counts: MeasurementCounts = Field(default_factory=MeasurementCounts)
    comparison_key: str | None = None
    comparison: VisibilityComparison = Field(default_factory=VisibilityComparison)
    citation_totals: CitationTotals = Field(default_factory=CitationTotals)
    selection_mode: str = "run"
    source_audit_ids: list[uuid.UUID] = Field(default_factory=list)
    configuration_groups: dict[str, int] = Field(default_factory=dict)
    from_at: datetime | None = None
    to_at: datetime | None = None
    # Frozen measurement provenance of the selected run (invariants 4/7): the
    # stable catalog-ordered route list
    # (aggregate surface — never a forced singular model across engines).
    model_provenance: list[ModelProvenance] = Field(default_factory=list)
    rankings: list[RankingRow] = Field(default_factory=list)
    per_engine: list[EngineComparisonRow] = Field(default_factory=list)
    # `avg_position` is deterministic (mention offsets); `sentiment` stays null
    # until a tone-scoring stage exists.
    sentiment: str | None = None
    avg_position: float | None = None
    created_at: datetime


class VisibilityTrendSov(BaseModel):
    """Both Share-of-Voice definitions for one trend point (projection only).

    ``response`` is the response-level SOV (brand response-presence share vs the
    competitors' response-presence rates); ``mention`` is the mention-level SOV
    derived from the persisted ``share_of_voice.mention_counts``. Both are
    deterministic reprojections of persisted metrics — no re-scoring (inv. 7).
    """

    response: float | None = None
    mention: float | None = None


class VisibilityTrendRankingRow(BaseModel):
    """One brand-vs-competitor ranking-history row within a trend point.

    Projected from the persisted snapshot(s) the point folds; for a bucket the
    mention counts are summed and the mention-level share recomputed from those
    sums (deterministic, no re-scoring — invariant 7).
    """

    name: str
    is_brand: bool = False
    logo_url: str | None = None
    website_url: str | None = None
    mention_rate: float | None = None
    citation_rate: float | None = None
    share_of_voice: float | None = None
    mention_count: int = 0
    # `avg_position` is deterministic (mention offsets); `sentiment` stays null
    # until a tone-scoring stage exists.
    sentiment: str | None = None
    avg_position: float | None = None


class VisibilityTrendPoint(BaseModel):
    """One point in the cross-run Visibility trend (projection only, inv. 7).

    A raw per-run point projects a single persisted ``MetricSnapshot`` (its
    ``audit_id`` is set); a day/week/month bucket folds every contributing
    snapshot (``audit_id`` is null) and carries the full provenance list.
    ``avg_position`` folds by completions; ``sentiment`` stays null. Version
    metadata lists every distinct analyzer/scoring version the point folds, with
    ``spans_version_boundary`` set when a bucket mixes versions.
    """

    audit_id: uuid.UUID | None = None
    completed_at: datetime
    logical_engine: str | None = None
    visibility_score: float | None = None
    visibility_rate: float | None = None
    prompt_performance_score: float | None = None
    counts: MeasurementCounts = Field(default_factory=MeasurementCounts)
    comparison_key: str | None = None
    run_count: int = 1
    source_audit_ids: list[uuid.UUID] = Field(default_factory=list)
    brand_mention_rate: float | None = None
    owned_citation_rate: float | None = None
    sov: VisibilityTrendSov = Field(default_factory=VisibilityTrendSov)
    rankings: list[VisibilityTrendRankingRow] = Field(default_factory=list)
    # `avg_position` is deterministic (mention offsets); `sentiment` stays null
    # until a tone-scoring stage exists.
    sentiment: str | None = None
    avg_position: float | None = None
    # Measurement identity partition (invariant 7): folding may combine points
    # ONLY inside one ``(transport_model, retrieval_enabled)`` identity, so a
    # point never mixes models or retrieval states.
    # ``transport_model`` is singular only when the point spans exactly one
    # model; it is null for a multi-model aggregate (see ``model_provenance``).
    transport_model: str | None = None
    retrieval_enabled: bool | None = None
    model_provenance: list[ModelProvenance] = Field(default_factory=list)
    # Provenance (invariant 4): every source snapshot this point folds.
    source_snapshot_ids: list[uuid.UUID] = Field(default_factory=list)
    # Distinct versions across the folded snapshots (invariant 4).
    analyzer_versions: list[str] = Field(default_factory=list)
    scoring_rule_versions: list[str] = Field(default_factory=list)
    spans_version_boundary: bool = False


class CitationEvidence(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ordinal: int
    url: str = ""
    title: str = ""
    domain: str = ""
    classification: str = "third_party"
    source_class: str | None = None
    source_taxonomy_version: str | None = None
    is_owned: bool = False
    is_unintended: bool = False
    matched_competitor: str | None = None


class ExecutionEvidenceResponse(BaseModel):
    """One execution's persisted analysis + evidence (``GET /executions/{id}``).

    ``id``/``task_id`` are the *execution* (``AuditTask``) id — the id clients
    receive from ``GET /audits/{id}/executions`` and pass here. ``analysis_id``
    is the internal ``ResponseAnalysis`` id (exposed for traceability).
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    analysis_id: uuid.UUID
    audit_id: uuid.UUID
    task_id: uuid.UUID
    artifact_id: uuid.UUID | None = None
    analyzer_version: str
    scoring_rule_version: str
    logical_engine: str = ""
    transport_provider: str = ""
    transport_model: str = ""
    # Frozen measurement provenance (execution-level: singular model, frozen
    # task request/route snapshots — never live config, invariants 4/7).
    retrieval_enabled: bool | None = None
    prompt_index: int
    repetition: int
    prompt_class: str = ""
    cohort: str = "core"
    brand_mentioned: bool = False
    brand_first_offset: int | None = None
    owned_domain_cited: bool = False
    owned_citation_count: int = 0
    unintended_domain_cited: bool = False
    citation_count: int = 0
    search_used: bool = False
    search_query_count: int = 0
    # `avg_position` is deterministic (mention offsets); `sentiment` stays null
    # until a tone-scoring stage exists.
    sentiment: str | None = None
    avg_position: float | None = None
    score: dict | None = None
    citations: list[CitationEvidence] = Field(default_factory=list)
    competitors_mentioned: list[str] = Field(default_factory=list)
    created_at: datetime


# ---------------------------------------------------------------------------
# Execution-evidence projection for the Mentions & Citations and Query Fanout
# tabs (``GET /projects/{id}/visibility/evidence``). Every field is a pure
# projection of already-persisted rows — no provider is called and no evidence
# is inferred/backfilled at read time (invariant 7).
# ---------------------------------------------------------------------------


class VisibilityFanoutState(StrEnum):
    """Three-state query-fanout availability for one execution.

    - ``queries_available``: at least one stored search event has non-blank
      query text (e.g. a Gemini/Anthropic/OpenAI grounded response).
    - ``count_only``: search was used or the persisted count is positive, but no
      stored event carries query text.
    - ``no_search``: neither a search signal nor a positive count is present.
    """

    QUERIES_AVAILABLE = "queries_available"
    COUNT_ONLY = "count_only"
    NO_SEARCH = "no_search"


class VisibilityEvidenceSearchEvent(BaseModel):
    """One normalized stored search event (projection only).

    Mirrors the persisted JSONB shape on ``AuditTask.search_events`` /
    ``RawResponseArtifact.search_events``. Empty query strings are preserved
    verbatim (a count-only event); query text is never invented.
    """

    sequence: int = 0
    query: str = ""
    call_id: str = ""
    call_sequence: int = 0
    query_sequence: int = 0


class VisibilityMentionEvidence(BaseModel):
    """One persisted brand/competitor mention row (projection only).

    Projected directly from ``BrandMention`` / ``CompetitorMention``; mentions
    are never inferred from answer text at read time.
    """

    kind: str  # "brand" | "competitor"
    name: str = ""
    first_offset: int | None = None
    artifact_id: uuid.UUID | None = None
    analyzer_version: str = ""


class VisibilityExecutionEvidence(BaseModel):
    """One execution's persisted mention/citation + query-fanout evidence.

    Read-only projection over ``ResponseAnalysis`` + its child mention/citation
    rows + the frozen ``AuditTask``/immutable ``RawResponseArtifact`` search
    events.
    """

    audit_id: uuid.UUID
    task_id: uuid.UUID
    analysis_id: uuid.UUID
    artifact_id: uuid.UUID | None = None

    # Frozen prompt provenance (``prompt_id`` is nullable so a deleted source
    # prompt stays readable via its frozen text under "All prompts").
    prompt_snapshot_id: uuid.UUID
    prompt_id: uuid.UUID | None = None
    prompt_index: int = 0
    prompt_text: str = ""
    repetition: int = 0

    completed_at: datetime | None = None

    # Historical provenance strings (tolerant of retired transports).
    logical_engine: str = ""
    transport_provider: str = ""
    transport_model: str = ""
    # Frozen measurement provenance (execution-level surface, invariants 4/7).
    retrieval_enabled: bool | None = None

    # Query-fanout signals + derived availability state.
    search_used: bool = False
    search_query_count: int = 0
    query_text_available: bool = False
    state: VisibilityFanoutState = VisibilityFanoutState.NO_SEARCH
    search_events: list[VisibilityEvidenceSearchEvent] = Field(default_factory=list)
    event_source: str = "none"  # "raw_artifact" | "audit_task" | "none"

    mentions: list[VisibilityMentionEvidence] = Field(default_factory=list)
    citations: list[CitationEvidence] = Field(default_factory=list)


class VisibilityEvidenceResponse(BaseModel):
    """The shared persisted evidence dataset for the two evidence tabs.

    Items use descending analysis creation time and UUID for stable cursor
    ordering. Totals and prompt options describe the complete selection.
    The cursor is bound to all filters and the returned as_of boundary.
    """

    items: list[VisibilityExecutionEvidence] = Field(default_factory=list)
    truncated: bool = False
    total: int = 0
    next_cursor: str | None = None
    as_of: datetime | None = None
    prompt_options: list[EvidencePromptOption] = Field(default_factory=list)


class EvidencePromptOption(BaseModel):
    id: uuid.UUID
    label: str
