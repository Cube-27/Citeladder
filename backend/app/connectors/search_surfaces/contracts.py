"""Persisted observed-surface vocabulary consumed by models, MCP evidence
and the native policy export. Acquisition and parsing are native;
no Python execution path remains."""

from __future__ import annotations

from typing import Final

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
