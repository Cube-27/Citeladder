"""Provider-neutral contracts for answer-engine adapters.

Every field is transport-agnostic so the Gemini (``google``), Anthropic
(``anthropic``) adapters produce the same shape. The response
records the resolved provenance triple — ``logical_engine`` (what was asked
for), ``transport_provider`` (how it was reached), and ``transport_model`` (the
concrete model) — so downstream persistence carries identity per invariant 10.

Ported from the reference ``ai_visibility/contracts.py`` and extended with the
logical/transport provenance fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class FinishReason(StrEnum):
    """Canonical, provider-neutral reason a generation stopped.

    Closed vocabulary: gates and persistence read ONLY these values. The raw
    provider token is preserved separately (``raw_finish_reason``) so no
    provider-specific spelling leaks into a decision. Modelled as a ``StrEnum``
    to match the other closed vocabularies in the codebase
    (e.g. ``config/entitlements.CapabilityType``).
    """

    STOP = "stop"
    LENGTH = "length"
    TOOL_ERROR = "tool_error"
    CONTENT_FILTER = "content_filter"
    CANCELLED = "cancelled"
    ERROR = "error"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class NormalizedUsage:
    """Provider-neutral usage counters for one call.

    EVERY field is nullable and defaults to ``None``. UNKNOWN NEVER BECOMES
    ZERO: a missing counter stays null so downstream cost projection reports it
    as unknown/partial instead of a fabricated zero that is indistinguishable
    from a real zero. Never add a ``0`` default here.
    """

    uncached_input_tokens: int | None = None
    cached_input_tokens: int | None = None
    output_tokens: int | None = None
    reasoning_tokens: int | None = None
    total_tokens: int | None = None
    web_search_requests: int | None = None
    provider_cost_microusd: int | None = None


@dataclass(frozen=True, slots=True)
class AnswerEngineRequest:
    prompt: str
    system_instruction: str
    model: str
    timeout_seconds: float
    # Frozen measurement-mode policy the adapter must obey verbatim: whether to
    # attach retrieval/search tools, the output-token cap, and the reasoning pin
    # (``off`` | ``unverified`` | an explicit effort — see
    # ``config/provider_catalog.RoutePolicy``). Defaults keep the pre-T3
    # construction sites compiling; the planner/worker pass all three
    # explicitly. ``max_output_tokens=0`` means "not supplied": no cap literal
    # is invented here (invariant 1 — caps are config-owned), so an adapter
    # reading a zero falls back to the configured catalog cap.
    retrieval_enabled: bool = True
    max_output_tokens: int = 0
    reasoning_effort: str = ""


@dataclass(frozen=True, slots=True)
class SearchEventResult:
    sequence: int
    query: str
    call_id: str = ""
    call_sequence: int = 0
    query_sequence: int = 0


@dataclass(frozen=True, slots=True)
class CitationResult:
    ordinal: int
    url: str
    title: str
    domain: str
    start_index: int | None
    end_index: int | None
    cited_text: str


@dataclass(frozen=True, slots=True)
class AnswerEngineResponse:
    # Provenance triple (invariant 10): logical engine requested, transport used
    # to reach it, and the concrete transport model that answered.
    logical_engine: str
    transport_provider: str
    transport_model: str
    answer_text: str
    search_used: bool
    search_events: tuple[SearchEventResult, ...]
    citations: tuple[CitationResult, ...]
    provider_metadata: dict = field(default_factory=dict)
    # Legacy untyped usage bag, now DERIVED from ``normalized_usage`` by every
    # parser (single source of truth — the parsers no longer compute it
    # separately). It survives only for the one remaining reader outside the
    # adapter layer, ``app/workers/audit_worker.py`` (persists it onto
    # ``RawResponseArtifact.usage``, which the cost projection then reads); the
    # field goes away with that reader. Prefer ``normalized_usage``.
    usage: dict = field(default_factory=dict)
    # Canonical finish reason (never null) plus the raw provider token it was
    # mapped from. Only the canonical value is used by gates.
    finish_reason: FinishReason = FinishReason.UNKNOWN
    raw_finish_reason: str = ""
    # Typed, all-nullable usage counters (unknown never becomes zero).
    normalized_usage: NormalizedUsage = field(default_factory=NormalizedUsage)
    latency_ms: int = 0
