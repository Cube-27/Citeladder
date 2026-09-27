# Action target keys and the approach tree the Agent's attach reads (pure).
#
# Grouping, convergence, priority and diagnosis moved with the Opportunity
# refresh to TypeScript (migration PR 7a,
# ``frontend/services/api/src/analysis/opportunities/actions.ts``), frozen as
# golden masters. What remains is what an Agent-created Action needs so it
# lands on the same key and branch the refresh would give it. Every table
# comes from ``core/config/actions.py``.
from __future__ import annotations

from app.analysis.site_health.indexing import normalized_url_for_compare
from app.core.config.actions import APPROACH_TREE, DEFAULT_APPROACH, ApproachRule


def page_group_key(url: str) -> str:
    """The grouping key for an owned page, shared with agent-created Actions."""
    return f"page:{normalized_url_for_compare(url)}"


def select_approach(*, rule_ids: set[str], target_kind: str) -> ApproachRule:
    """The first approach-tree branch that matches the member rule set."""
    for branch in APPROACH_TREE:
        if branch.target_kinds and target_kind not in branch.target_kinds:
            continue
        if branch.rule_ids & rule_ids:
            return branch
    return DEFAULT_APPROACH
