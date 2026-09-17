# Earned-source action configuration (invariant 1: config lives in core/config).
#
# Split out of ``core/config/opportunities.py``, which owns the whole
# Opportunities catalog and was at its module ceiling. Everything about acting
# on somebody else's page -- the action-path vocabulary, the rollup bounds, the
# legacy domain-keyed thresholds and the page-keyed rule catalog entries --
# lives here, so the general catalog stays about rules in general.
#
# Two vocabularies here are easy to collapse and must not be. The ACTION PATH
# says who owns the page an action touches -- us, or a publisher. The PAGE
# FORMAT says what kind of page it is, derived per page from its own content.
# A publisher's ``source_class`` is neither; it describes a domain, and one
# inspected page never promotes it.
from __future__ import annotations

from typing import Final

from app.core.config.source_pages import (
    PAGE_FORMAT_ARTICLE,
    PAGE_FORMAT_COMPARISON,
    PAGE_FORMAT_DIRECTORY,
    PAGE_FORMAT_DISCUSSION,
    PAGE_FORMAT_LISTICLE,
    PAGE_FORMAT_REFERENCE,
    PAGE_FORMAT_REVIEW,
    PAGE_FORMAT_VIDEO,
)
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

# =========================================================================
# Page-keyed earned actions
# =========================================================================
# Four rule ids rather than one rule carrying an action field. ``_score_hits``
# consolidates on ``(rule_id, target_key)`` and the partial unique index is
# keyed identically, so a single rule would collapse two different actions on
# one page into one row with one status -- and acquiring a listing and
# correcting a listing have different done-states.
#
# The target key is ``earned-page:{url_hash}``. Source class and page format
# are EVIDENCE, never key fields: keying on a classification is what made a
# reclassification supersede a row with no successor and silently discard a
# human decision.
RULE_EARNED_PAGE_ACQUIRE: Final = "earned_page_acquire_listing"
RULE_EARNED_PAGE_CORRECT: Final = "earned_page_correct_listing"
RULE_EARNED_PAGE_DEFEND: Final = "earned_page_defend_listing"
RULE_EARNED_PAGE_RESEARCH: Final = "earned_page_research_source"
EARNED_PAGE_RULE_IDS: Final[frozenset[str]] = frozenset(
    {
        RULE_EARNED_PAGE_ACQUIRE,
        RULE_EARNED_PAGE_CORRECT,
        RULE_EARNED_PAGE_DEFEND,
        RULE_EARNED_PAGE_RESEARCH,
    }
)

# The persisted anchor for a page-keyed row, matched by a partial unique
# index. Built and parsed here rather than at each call site, because a
# positional slice of the prefix yields a wrong-but-plausible hash if the
# prefix ever changes, instead of an error.
EARNED_PAGE_TARGET_PREFIX: Final = "earned-page:"


def earned_page_target_key(url_hash: str) -> str:
    return f"{EARNED_PAGE_TARGET_PREFIX}{url_hash}"


def url_hash_from_target_key(target_key: str) -> str:
    """The identity inside a page target key, or ``""`` for any other key."""
    if not target_key.startswith(EARNED_PAGE_TARGET_PREFIX):
        return ""
    return target_key[len(EARNED_PAGE_TARGET_PREFIX) :]


# =========================================================================
# Named discrepancies
# =========================================================================
# What a correction task can assert is wrong with a page, and therefore what a
# placement check has to see resolved. Both kinds are checkable from the page
# itself; neither infers intent from prose.
#
# Config-owned because the detector that raises one and the verifier that
# settles it are in different layers. Two copies of this vocabulary would let a
# renamed code silently stop matching, and a correction would then verify as
# unavailable forever with nothing to point at.
DISCREPANCY_NOT_LISTED_AS_ENTRY: Final = "not_listed_as_entry"
DISCREPANCY_OWNED_DOMAIN_MISSING: Final = "owned_domain_missing"

# =========================================================================
# Qualification gate
# =========================================================================
# Hard, and ahead of ranking. An unqualified candidate stays a source state or
# a research candidate; it never becomes a fabricated action.
#
# ``earned_page_research_source`` is the deliberate exception -- it exists for
# precisely what this gate rejects, and applying the gate to it would put every
# unresolved source back in the silent-drop path.
#
# Page formats whose shape admits a new entrant. An article ABOUT a company is
# not a place a second company can be added, so it is absent: correcting or
# defending an existing mention there is still available, acquiring one is not.
EARNED_PAGE_INCLUDABLE_FORMATS: Final[frozenset[str]] = frozenset(
    {
        PAGE_FORMAT_COMPARISON,
        PAGE_FORMAT_LISTICLE,
        PAGE_FORMAT_DIRECTORY,
        PAGE_FORMAT_REVIEW,
    }
)
# How often a page must recur before it is worth a human's attention at all.
# Below it a cited page is inventory, visible in Sources, and not a task.
EARNED_PAGE_MIN_RECURRENCE: Final = 2
# Research fires on relevance and recurrence alone, so its bar is the one that
# keeps a single incidental citation from becoming a queue item.
EARNED_PAGE_RESEARCH_MIN_RECURRENCE: Final = 3

# =========================================================================
# Priority inputs
# =========================================================================
# Bounded, and computed from VERIFIED ON-PAGE presence only. Answer-level
# co-occurrence survives as descriptive evidence and is labelled as such; it
# never boosts a page score, because a competitor merely named in prose says
# nothing about the page that answer happened to cite.
EARNED_PAGE_USAGE_FACTOR_MAX: Final = 2.0
EARNED_PAGE_COMPETITOR_FACTOR_MAX: Final = 1.6
EARNED_PAGE_COMPETITOR_FACTOR_STEP: Final = 0.2

# =========================================================================
# Handoff shape
# =========================================================================
# The output type follows the PAGE, not the publisher. A comparison page needs
# comparison copy whoever runs it, and a generic article brief is what made
# every earned handoff interchangeable.
EARNED_PAGE_SKILL_BY_FORMAT: Final[dict[str, str]] = {
    PAGE_FORMAT_COMPARISON: "comparison",
    PAGE_FORMAT_LISTICLE: "listicle",
    PAGE_FORMAT_DIRECTORY: "about_us",
    PAGE_FORMAT_REVIEW: "case_study",
    PAGE_FORMAT_DISCUSSION: "reddit",
    PAGE_FORMAT_REFERENCE: "faq",
    PAGE_FORMAT_ARTICLE: "article",
    PAGE_FORMAT_VIDEO: "youtube",
}
EARNED_PAGE_ROLE_BY_FORMAT: Final[dict[str, str]] = {
    PAGE_FORMAT_COMPARISON: "Marketing",
    PAGE_FORMAT_LISTICLE: "PR",
    PAGE_FORMAT_DIRECTORY: "Marketing",
    PAGE_FORMAT_REVIEW: "PR",
    PAGE_FORMAT_DISCUSSION: "Founder",
    PAGE_FORMAT_REFERENCE: "Marketing",
    PAGE_FORMAT_ARTICLE: "PR",
    PAGE_FORMAT_VIDEO: "Marketing",
}
EARNED_PAGE_DEFAULT_SKILL: Final = "article"
EARNED_PAGE_DEFAULT_ROLE: Final = "PR"
# Bounds on what one page hit carries into its brief.
EARNED_PAGE_MAX_PASSAGES: Final = 4
EARNED_PAGE_MAX_COMPETITORS: Final = 12
EARNED_PAGE_MAX_PROMPTS: Final = 12
# Bounded recompute read: the most-recurrent cited pages of one audit.
EARNED_PAGE_DETECTOR_MAX_PAGES: Final = 500
