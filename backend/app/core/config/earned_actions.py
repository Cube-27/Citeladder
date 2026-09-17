# Earned-source action configuration (invariant 1: config lives in core/config).
#
# Split out of ``core/config/opportunities.py``, which owns the whole
# Opportunities catalog and was at its module ceiling. Everything about acting
# on somebody else's page -- the action-path vocabulary, the rollup bounds, the
# legacy domain-keyed thresholds and the page-keyed rule catalog entries --
# lives here, so the general catalog stays about rules in general.
#
# The ACTION PATH vocabulary here says who owns the page an action touches --
# us, or a publisher. A publisher's ``source_class`` is a different thing: it
# describes the domain, and never establishes the action path on its own.
from __future__ import annotations

from typing import Final

from app.core.config.source_patterns import (
    SOURCE_CLASS_COMMUNITY,
    SOURCE_CLASS_EDITORIAL_THIRD_PARTY,
    SOURCE_CLASS_INSTITUTIONAL,
    SOURCE_CLASS_REVIEW_MARKETPLACE,
    SOURCE_CLASS_SOCIAL,
    SOURCE_CLASS_VIDEO,
)

# =========================================================================
# Action path
# =========================================================================
ACTION_PATH_OWNED: Final = "owned"
ACTION_PATH_EARNED: Final = "earned"
ACTION_PATHS: Final[frozenset[str]] = frozenset({ACTION_PATH_OWNED, ACTION_PATH_EARNED})

# =========================================================================
# Source rollup bounds (the domain-keyed source mix)
# =========================================================================
SOURCE_ROLLUP_MAX_DOMAINS: Final = 100
SOURCE_ROLLUP_MAX_URLS: Final = 6
SOURCE_ROLLUP_MAX_PROMPTS: Final = 12

# =========================================================================
# Legacy domain-keyed earned detector
# =========================================================================
# Keys on a registrable domain, leaves ``target_url`` null, and scores on
# answer-level competitor co-occurrence.
RULE_EARNED_SOURCE_RECURS: Final = "earned_source_recurs_beside_gap"
EARNED_SOURCE_MIN_ANSWERS: Final = 2
EARNED_SOURCE_MIN_USAGE_RATE: Final = 0.1
EARNED_USAGE_FACTOR_MAX: Final = 2.0
EARNED_COMPETITOR_FACTOR_MAX: Final = 1.5
EARNED_SUGGESTED_SKILL_BY_CLASS: Final[dict[str, str]] = {
    SOURCE_CLASS_REVIEW_MARKETPLACE: "comparison",
    SOURCE_CLASS_EDITORIAL_THIRD_PARTY: "article",
    SOURCE_CLASS_COMMUNITY: "reddit",
    SOURCE_CLASS_SOCIAL: "linkedin",
    SOURCE_CLASS_INSTITUTIONAL: "article",
    SOURCE_CLASS_VIDEO: "youtube",
}
EARNED_SUGGESTED_ROLE_BY_CLASS: Final[dict[str, str]] = {
    SOURCE_CLASS_REVIEW_MARKETPLACE: "Marketing",
    SOURCE_CLASS_EDITORIAL_THIRD_PARTY: "PR",
    SOURCE_CLASS_COMMUNITY: "Founder",
    SOURCE_CLASS_SOCIAL: "Marketing",
    SOURCE_CLASS_INSTITUTIONAL: "PR",
    SOURCE_CLASS_VIDEO: "Marketing",
}
