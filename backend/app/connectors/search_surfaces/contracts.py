"""Request/result contracts for an OBSERVED answer surface.

``AnswerEngineRequest``/``AnswerEngineResponse`` stay untouched: they describe
asking a question, and every field they carry — system instruction, reasoning
effort, output-token cap — is a control over an answer that is about to be
generated. None of that exists here. A search surface is submitted, waited
for, and then read.

Hence a parallel pair rather than an extension. In particular ``FinishReason``
is NOT extended with a "no AI Overview" token: nothing about the surface
finished early, and a surface with no overview did not stop generating — it
never generated. ``search_ai`` results leave it alone entirely.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Final

from app.core.config.costs import MICRO_USD_PER_USD

# --- Terminal outcomes ----------------------------------------------------
# The closed vocabulary persisted for every task that reaches an end. Every
# rate in the product divides by these, so the distinctions are load-bearing:
# in particular "we could not retrieve it" is kept apart from "there was no AI
# Overview", because collapsing them would report CiteLadder's own failures as
# measured absence of the brand.
OUTCOME_AI_OVERVIEW_PRESENT: Final = "ai_overview_present"
OUTCOME_NO_AI_OVERVIEW: Final = "no_ai_overview"
OUTCOME_PROVIDER_ERROR: Final = "provider_error"
OUTCOME_PARSER_ERROR: Final = "parser_error"
OUTCOME_EXECUTION_FAILURE: Final = "execution_failure"

TERMINAL_OUTCOMES: Final[frozenset[str]] = frozenset(
    {
        OUTCOME_AI_OVERVIEW_PRESENT,
        OUTCOME_NO_AI_OVERVIEW,
        OUTCOME_PROVIDER_ERROR,
        OUTCOME_PARSER_ERROR,
        OUTCOME_EXECUTION_FAILURE,
    }
)

# The two outcomes that observed something. Only these enter a published
# denominator; the other three are recorded and excluded.
SUCCESSFUL_OUTCOMES: Final[frozenset[str]] = frozenset(
    {OUTCOME_AI_OVERVIEW_PRESENT, OUTCOME_NO_AI_OVERVIEW}
)

# An intermediate parser result, NOT a terminal outcome and never persisted as
# one. It is a signal to re-park. Nothing counts it, because a task that has
# not finished has not observed anything.
RESULT_STILL_PENDING: Final = "still_pending"

# --- Internal error codes (only ever on `execution_failure`) --------------
# These name CiteLadder's own failures. They exist so a local failure has
# somewhere honest to go instead of being dressed up as a measurement.
ERROR_POLL_CEILING_EXCEEDED: Final = "poll_ceiling_exceeded"
ERROR_SUBMISSION_UNRECONCILED: Final = "submission_unreconciled"
ERROR_CREDENTIAL_UNAVAILABLE: Final = "credential_unavailable_for_retrieval"

EXECUTION_FAILURE_CODES: Final[frozenset[str]] = frozenset(
    {
        ERROR_POLL_CEILING_EXCEEDED,
        ERROR_SUBMISSION_UNRECONCILED,
        ERROR_CREDENTIAL_UNAVAILABLE,
    }
)


@dataclass(frozen=True, slots=True, kw_only=True)
class SearchSurfaceRequest:
    """One observation to submit.

    Carries the query and the search context and NOTHING ELSE. There is
    deliberately no ``target`` parameter: sending the monitored domain to the
    provider would let the provider's filtering decide what CiteLadder is
    allowed to see, and a brand's absence from a filtered SERP is
    indistinguishable from its absence from the real one.

    ``provider_submission_ref`` is required and is serialised verbatim as the
    provider ``tag``. It is passed in like every other input — the adapter
    never reads it from the database and never holds it between calls —
    because reconciliation identity depends on that exact value surviving
    unchanged from the committed intent to the wire.
    """

    query: str
    location_code: int
    language_code: str
    device: str
    depth: int
    load_async_ai_overview: bool
    timeout_seconds: float
    provider_submission_ref: str
    request_settings: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True, kw_only=True)
class SearchSurfaceSubmission:
    """Proof that a paid submission landed.

    ``provider_cost_microusd`` is read from the POST response and persisted
    immediately: the provider charges when a task is SET, not when it is
    retrieved, so a task whose retrieval never succeeds has still cost money.
    """

    provider_task_id: str
    submitted_at: datetime
    provider_cost_microusd: int | None
    raw_payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True, kw_only=True)
class AioLink:
    """One inline link inside an AI Overview element.

    Distinct from a citation. A link is something the overview pointed at from
    within its own text; a citation is a source in the block's reference list.
    Conflating them would make every cited entity look linked.
    """

    url: str
    domain: str
    title: str
    element_index: int


@dataclass(frozen=True, slots=True, kw_only=True)
class AioReference:
    """One row of the AI Overview's root reference list.

    ``source_origin`` is provenance -- who owns the platform -- and nothing
    more. What KIND of source it is, and whether it is worth pursuing, is
    decided later by the shared source taxonomy against the same domain.
    """

    url: str
    domain: str
    title: str
    source_origin: str


@dataclass(frozen=True, slots=True, kw_only=True)
class SearchSurfaceResult:
    """What one completed observation found.

    ``aio_present`` is NULLABLE and that is the whole point: it is ``False``
    only for ``no_ai_overview``, an actual observation of absence. For every
    non-observation outcome it stays ``None`` — CiteLadder did not look
    successfully, so it knows nothing either way. ``provider_status_code`` and
    ``observed_at`` stay empty for the same reason rather than being
    manufactured.
    """

    outcome: str
    provider_status_code: int | None = None
    error_code: str = ""
    aio_present: bool | None = None
    aio_serp_position: int | None = None
    answer_text: str = ""
    aio_markdown: str = ""
    elements: tuple[dict[str, Any], ...] = ()
    links: tuple[AioLink, ...] = ()
    references: tuple[AioReference, ...] = ()
    provider_cost_microusd: int | None = None
    observed_at: datetime | None = None
    raw_payload: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.outcome not in TERMINAL_OUTCOMES:
            raise ValueError(f"not a terminal outcome: {self.outcome!r}")
        self._require_coherent_presence()
        self._require_coherent_error_code()

    def _require_coherent_presence(self) -> None:
        """``aio_present`` must say exactly what the outcome says."""
        if self.outcome == OUTCOME_NO_AI_OVERVIEW and self.aio_present is not False:
            raise ValueError("no_ai_overview is the observation that aio_present=False")
        if self.outcome == OUTCOME_AI_OVERVIEW_PRESENT and self.aio_present is not True:
            raise ValueError("ai_overview_present must set aio_present=True")
        if self.outcome not in SUCCESSFUL_OUTCOMES and self.aio_present is not None:
            raise ValueError(
                f"{self.outcome} observed nothing, so aio_present must stay null"
            )

    def _require_coherent_error_code(self) -> None:
        """An internal error code belongs to a LOCAL failure and nowhere else."""
        if self.error_code and self.outcome != OUTCOME_EXECUTION_FAILURE:
            raise ValueError("error_code names a LOCAL failure; use it only there")
        if self.outcome != OUTCOME_EXECUTION_FAILURE:
            return
        if self.error_code not in EXECUTION_FAILURE_CODES:
            raise ValueError(
                f"execution_failure needs a known error code, got {self.error_code!r}"
            )
        if self.provider_status_code is not None or self.observed_at is not None:
            raise ValueError(
                "no provider result supplied a status or an observation time"
            )


def provider_cost_microusd(task: dict[str, Any]) -> int | None:
    """What the provider charged for one task, in micro-USD, or None.

    Both ends of the surface read this off the same ``cost`` field -- the
    submission reads what the task was billed at, the retrieval reads what it
    finally cost -- so it is decided once here rather than twice. ``bool`` is
    excluded ahead of the numeric check because it is an ``int`` in Python,
    and a ``cost`` of ``True`` would otherwise bill one micro-USD.
    """
    cost = task.get("cost")
    if isinstance(cost, bool) or not isinstance(cost, (int, float)):
        return None
    if not math.isfinite(cost) or cost < 0 or cost > (2**63 - 1) / MICRO_USD_PER_USD:
        return None
    return round(float(cost) * MICRO_USD_PER_USD)
