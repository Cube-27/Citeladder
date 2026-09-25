"""Action policy: grouping, convergence, priority and the diagnosis tree.

An Action is the unit of work over the Opportunity store: the live Opportunity
rows that share one target, plus any agent work on that target. Everything a
deterministic grouping, priority or diagnosis decision reads lives here, so
the analysis and domain owners never embed alternate policy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.core.config.earned_actions import (
    RULE_EARNED_PAGE_ACQUIRE,
    RULE_EARNED_PAGE_CORRECT,
    RULE_EARNED_PAGE_DEFEND,
    RULE_EARNED_PAGE_RESEARCH,
)
from app.core.config.opportunities import OPPORTUNITY_RULES_BY_ID

# Stamped on every Action projection (invariant 5).
ACTION_GROUPING_VERSION: Final = "action-grouping-1"
ACTION_DIAGNOSIS_VERSION: Final = "action-diagnosis-1"
ACTION_PRIORITY_VERSION: Final = "action-priority-1"

# --- Target kinds --------------------------------------------------------
TARGET_PAGE: Final = "page"
TARGET_EARNED_PAGE: Final = "earned_page"
TARGET_PRODUCT: Final = "product"
TARGET_CATEGORY: Final = "category"
TARGET_QUERY: Final = "query"
TARGET_PROMPT: Final = "prompt"
TARGET_PLANNED_PAGE: Final = "planned_page"
ACTION_TARGET_KINDS: Final[tuple[str, ...]] = (
    TARGET_PAGE,
    TARGET_EARNED_PAGE,
    TARGET_PRODUCT,
    TARGET_CATEGORY,
    TARGET_QUERY,
    TARGET_PROMPT,
    TARGET_PLANNED_PAGE,
)
# Targets agent work may create an Action for. Every other kind is reached
# through an Action its evidence already created, which the chat attaches to.
AGENT_TARGET_KINDS: Final[frozenset[str]] = frozenset(
    {TARGET_PAGE, TARGET_PLANNED_PAGE}
)
PLANNED_PAGE_TOPIC_MAX_CHARS: Final = 120

ACTION_ORIGIN_EVIDENCE: Final = "evidence"
ACTION_ORIGIN_AGENT: Final = "agent"

# --- Workflow status -----------------------------------------------------
# open → in progress → implemented (declared) → measuring → done | dismissed.
# Only ``open`` and ``dismissed`` are stored by a user. ``in_progress`` is
# derived at read time from a linked chat having an output; the declaration
# and measurement loop own the remaining states. The Agent sets none of them.
ACTION_STATUS_OPEN: Final = "open"
ACTION_STATUS_IN_PROGRESS: Final = "in_progress"
ACTION_STATUS_IMPLEMENTED: Final = "implemented"
ACTION_STATUS_MEASURING: Final = "measuring"
ACTION_STATUS_DONE: Final = "done"
ACTION_STATUS_DISMISSED: Final = "dismissed"
ACTION_STATUSES: Final[tuple[str, ...]] = (
    ACTION_STATUS_OPEN,
    ACTION_STATUS_IN_PROGRESS,
    ACTION_STATUS_IMPLEMENTED,
    ACTION_STATUS_MEASURING,
    ACTION_STATUS_DONE,
    ACTION_STATUS_DISMISSED,
)
ACTION_USER_STATUSES: Final[frozenset[str]] = frozenset(
    {ACTION_STATUS_OPEN, ACTION_STATUS_DISMISSED}
)
# The default work queue: what still needs someone's attention.
ACTION_ACTIVE_STATUSES: Final[frozenset[str]] = frozenset(
    {ACTION_STATUS_OPEN, ACTION_STATUS_IN_PROGRESS}
)

# --- Evidence families (convergence) -------------------------------------
FAMILY_AI_VISIBILITY: Final = "ai_visibility"
FAMILY_SOURCES: Final = "sources"
FAMILY_SEARCH_CONSOLE: Final = "search_console"
FAMILY_SITE_HEALTH: Final = "site_health"
FAMILY_LINK_GRAPH: Final = "link_graph"
FAMILY_SITE_CHANGES: Final = "site_changes"
FAMILY_COMMERCE: Final = "commerce"
EVIDENCE_FAMILIES: Final[tuple[str, ...]] = (
    FAMILY_AI_VISIBILITY,
    FAMILY_SOURCES,
    FAMILY_SEARCH_CONSOLE,
    FAMILY_SITE_HEALTH,
    FAMILY_LINK_GRAPH,
    FAMILY_SITE_CHANGES,
    FAMILY_COMMERCE,
)

# Which independent evidence system each Opportunity rule speaks for. It must
# be total over the rule catalog; the check below fails at import otherwise.
RULE_EVIDENCE_FAMILY: Final[dict[str, str]] = {
    "brand_absent_high_value_prompt": FAMILY_AI_VISIBILITY,
    "owned_page_not_cited": FAMILY_AI_VISIBILITY,
    "confirmed_prompt_decline": FAMILY_AI_VISIBILITY,
    "earned_source_recurs_beside_gap": FAMILY_SOURCES,
    RULE_EARNED_PAGE_ACQUIRE: FAMILY_SOURCES,
    RULE_EARNED_PAGE_CORRECT: FAMILY_SOURCES,
    RULE_EARNED_PAGE_DEFEND: FAMILY_SOURCES,
    RULE_EARNED_PAGE_RESEARCH: FAMILY_SOURCES,
    "missing_structured_data": FAMILY_SITE_HEALTH,
    "thin_content": FAMILY_SITE_HEALTH,
    "schema_type_mismatch": FAMILY_SITE_HEALTH,
    "schema_properties_incomplete": FAMILY_SITE_HEALTH,
    "schema_visible_content_conflict": FAMILY_SITE_HEALTH,
    "content_structure_incomplete": FAMILY_SITE_HEALTH,
    "citability_trust_incomplete": FAMILY_SITE_HEALTH,
    "site_link_near_orphan": FAMILY_LINK_GRAPH,
    "site_link_weak_authority": FAMILY_LINK_GRAPH,
    "site_change_potential_regression": FAMILY_SITE_CHANGES,
    "site_change_critical_regression": FAMILY_SITE_CHANGES,
    "site_change_metadata_inconsistency": FAMILY_SITE_CHANGES,
    "site_change_cosmetic_refresh": FAMILY_SITE_CHANGES,
    "search_demand_content_gap": FAMILY_SEARCH_CONSOLE,
    "striking_distance_query": FAMILY_SEARCH_CONSOLE,
    "query_cannibalization": FAMILY_SEARCH_CONSOLE,
    "property_relative_ctr_gap": FAMILY_SEARCH_CONSOLE,
    "emerging_query": FAMILY_SEARCH_CONSOLE,
    "declining_query": FAMILY_SEARCH_CONSOLE,
    "low_share_of_voice_theme": FAMILY_AI_VISIBILITY,
    "high_traffic_low_visibility": FAMILY_SEARCH_CONSOLE,
    "product_not_mentioned": FAMILY_COMMERCE,
    "cited_alternatives_without_uploaded_presence": FAMILY_COMMERCE,
    "catalog_fields_missing": FAMILY_COMMERCE,
}
_UNMAPPED_RULES = set(OPPORTUNITY_RULES_BY_ID) - set(RULE_EVIDENCE_FAMILY)
if _UNMAPPED_RULES:
    raise ValueError(f"rules without an evidence family: {sorted(_UNMAPPED_RULES)}")

# --- Priority ------------------------------------------------------------
# priority = strongest member priority * (1 + bonus * (families - 1)),
# with the multiplier capped. An unavailable family contributes nothing and is
# never counted as a zero; only observed families converge.
CONVERGENCE_BONUS_PER_FAMILY: Final = 0.15
CONVERGENCE_MULTIPLIER_CAP: Final = 1.6
ACTION_PRIORITY_ROUNDING_DECIMALS: Final = 1

# --- Diagnosis approach tree ---------------------------------------------
APPROACH_FIX_TECHNICAL: Final = "fix_technical"
APPROACH_CONSOLIDATE: Final = "consolidate"
APPROACH_EARNED_PLACEMENT: Final = "earned_placement"
APPROACH_RESEARCH: Final = "research"
APPROACH_IMPROVE_LINKS: Final = "improve_links"
APPROACH_CREATE_NEW: Final = "create_new"
APPROACH_IMPROVE_EXISTING: Final = "improve_existing"


@dataclass(frozen=True)
class ApproachRule:
    """One branch of the approach tree, evaluated in declaration order.

    ``target_kinds`` narrows a branch to targets where it applies (empty means
    any). The first branch whose rule set intersects the Action's members wins;
    the default branch applies when none does.
    """

    approach: str
    rule_ids: frozenset[str]
    skill_id: str
    donts: tuple[str, ...]
    target_kinds: frozenset[str] = frozenset()


APPROACH_TREE: Final[tuple[ApproachRule, ...]] = (
    ApproachRule(
        approach=APPROACH_RESEARCH,
        rule_ids=frozenset({RULE_EARNED_PAGE_RESEARCH}),
        skill_id="ai_visibility",
        donts=("Do not pitch the publisher before the page has been reviewed.",),
    ),
    ApproachRule(
        approach=APPROACH_EARNED_PLACEMENT,
        rule_ids=frozenset(
            {
                RULE_EARNED_PAGE_ACQUIRE,
                RULE_EARNED_PAGE_CORRECT,
                RULE_EARNED_PAGE_DEFEND,
            }
        ),
        skill_id="earned_authority",
        donts=(
            "Do not change an owned page to fix a third-party listing.",
            "Do not send outreach from CiteLadder; drafts only.",
        ),
    ),
    ApproachRule(
        approach=APPROACH_FIX_TECHNICAL,
        rule_ids=frozenset(
            {
                "site_change_critical_regression",
                "site_change_potential_regression",
                "missing_structured_data",
                "schema_type_mismatch",
                "schema_properties_incomplete",
                "schema_visible_content_conflict",
            }
        ),
        skill_id="technical_health",
        donts=(
            "Do not rewrite the page copy to work around a technical defect.",
            "Do not add markup that states facts the visible page does not.",
        ),
    ),
    ApproachRule(
        approach=APPROACH_CONSOLIDATE,
        rule_ids=frozenset({"query_cannibalization"}),
        skill_id="gsc_optimize",
        donts=("Do not create another URL for this demand.",),
    ),
    ApproachRule(
        approach=APPROACH_CREATE_NEW,
        rule_ids=frozenset({"brand_absent_high_value_prompt"}),
        skill_id="content_create",
        donts=(
            "Do not create a new URL if an existing page already answers this "
            "question; improve that page instead.",
        ),
        target_kinds=frozenset({TARGET_PROMPT}),
    ),
    ApproachRule(
        approach=APPROACH_IMPROVE_LINKS,
        rule_ids=frozenset({"site_link_near_orphan", "site_link_weak_authority"}),
        skill_id="internal_links",
        donts=("Do not add links from unrelated pages to hit a link count.",),
    ),
    ApproachRule(
        approach=APPROACH_IMPROVE_EXISTING,
        rule_ids=frozenset(
            {
                "search_demand_content_gap",
                "striking_distance_query",
                "property_relative_ctr_gap",
                "emerging_query",
                "declining_query",
            }
        ),
        skill_id="gsc_optimize",
        donts=(
            "Do not create another URL: an indexable page already maps to this demand.",
        ),
    ),
)
DEFAULT_APPROACH: Final = ApproachRule(
    approach=APPROACH_IMPROVE_EXISTING,
    rule_ids=frozenset(),
    skill_id="content_create",
    donts=("Do not create another URL for a target that already has a page.",),
)
# The skill for an Action created by agent work with no evidence members yet.
AGENT_ORIGIN_DEFAULT_SKILL: Final = "content_create"

# --- Measurement legs ----------------------------------------------------
LEG_VISIBILITY_RUN: Final = "next_visibility_run"
LEG_SEARCH_CONSOLE_WINDOW: Final = "next_search_console_window"
LEG_CRAWL: Final = "next_crawl"
LEG_PLACEMENT_RECHECK: Final = "placement_recheck"
LEG_COMMERCE_AUDIT: Final = "next_commerce_audit"
FAMILY_MEASUREMENT_LEG: Final[dict[str, str]] = {
    FAMILY_AI_VISIBILITY: LEG_VISIBILITY_RUN,
    FAMILY_SOURCES: LEG_PLACEMENT_RECHECK,
    FAMILY_SEARCH_CONSOLE: LEG_SEARCH_CONSOLE_WINDOW,
    FAMILY_SITE_HEALTH: LEG_CRAWL,
    FAMILY_LINK_GRAPH: LEG_CRAWL,
    FAMILY_SITE_CHANGES: LEG_CRAWL,
    FAMILY_COMMERCE: LEG_COMMERCE_AUDIT,
}

# Family evidence states in a diagnosis (invariant 7): a family with a member
# finding is observed; one whose source exists but found nothing on this
# target is no_finding; one whose source is absent is unavailable.
FAMILY_STATE_OBSERVED: Final = "observed"
FAMILY_STATE_NO_FINDING: Final = "no_finding"
FAMILY_STATE_UNAVAILABLE: Final = "unavailable"

# --- Reads ---------------------------------------------------------------
ACTION_LIST_DEFAULT_LIMIT: Final = 50
ACTION_LIST_MAX_LIMIT: Final = 200
ACTION_LABEL_MAX_CHARS: Final = 255
