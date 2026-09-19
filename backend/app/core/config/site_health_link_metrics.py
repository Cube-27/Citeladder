"""Versioned policy for crawl coverage and internal-link projections."""

from __future__ import annotations

from typing import Final

COVERAGE_STATE_COMPLETE: Final = "complete"
COVERAGE_STATE_PARTIAL: Final = "partial"
COVERAGE_STATE_UNKNOWN: Final = "unknown"
COVERAGE_STATES: Final[frozenset[str]] = frozenset(
    {
        COVERAGE_STATE_COMPLETE,
        COVERAGE_STATE_PARTIAL,
        COVERAGE_STATE_UNKNOWN,
    }
)

# These tokens make post-terminal derivations replayable without pretending
# that a later formula is the same result over old evidence.
COVERAGE_FORMULA_VERSION: Final = "sh-coverage-1"
LINK_METRIC_FORMULA_VERSION: Final = "sh-link-metrics-3"

# Internal Authority is a model over the observed crawl, not a search-engine
# metric. Per-anchor weights are combined before duplicate source/destination
# pairs are collapsed, so a main-content nofollow plus a navigation follow link
# can never masquerade as one main-content follow link.
AUTHORITY_DAMPING_FACTOR: Final = 0.85
AUTHORITY_MAX_ITERATIONS: Final = 100
AUTHORITY_CONVERGENCE_EPSILON: Final = 1e-12
AUTHORITY_EDGE_WEIGHTS: Final[dict[tuple[bool, bool], float]] = {
    (True, True): 1.0,
    (False, True): 0.35,
    (True, False): 0.15,
    (False, False): 0.05,
}
AUTHORITY_REPEATED_ANCHOR_FACTOR: Final = 0.1

ANCHOR_GENERIC_TEXTS: Final[frozenset[str]] = frozenset(
    {"click here", "learn more", "read more", "view more", "view product"}
)
ANCHOR_REPEATED_DESTINATION_MIN: Final = 2
ANCHOR_LOW_ALIGNMENT_COVERAGE_MAX: Final = 0.5

# URL detail needs useful neighbours, not an unbounded edge projection.
LINK_METRIC_TOP_NEIGHBOUR_LIMIT: Final = 10
