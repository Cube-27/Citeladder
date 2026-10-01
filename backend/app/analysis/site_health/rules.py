"""The persisted rule-evaluation value and catalog lookups finalization uses.

Per-page rule evaluation is owned by the TypeScript analyzer; Python keeps the
crawl-finalize rules (``finalize.py``) and re-scoring over persisted rows until
finalization moves.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.config.site_health_contracts import RULE_FAILING_OUTCOMES
from app.core.config.site_health_rule_types import (
    FINDING_CLASS_DIAGNOSTIC,
    RULE_SCOPE_PAGE,
    SiteHealthRule,
)
from app.core.config.site_health_rules import SITE_HEALTH_RULES_BY_ID


@dataclass(frozen=True)
class RuleEvaluation:
    """Immutable, bounded result the worker persists for one rule."""

    rule_id: str
    rule_version: str
    dimension: str
    category: str
    severity: str
    finding_class: str
    weight: float
    outcome: str
    evidence: dict[str, Any] = field(default_factory=dict)
    description: str = ""
    remediation: str = ""
    display_applicability: bool = True
    score_applicability: bool = False
    reason_code: str = ""
    score_roles: tuple[str, ...] = ()
    readiness_dimension: str = ""
    readiness_weight: float = 0.0
    scope: str = RULE_SCOPE_PAGE


def creates_issue(evaluation: RuleEvaluation) -> bool:
    """Admit evidence-backed findings independently of score membership."""
    return (
        evaluation.outcome in RULE_FAILING_OUTCOMES
        and evaluation.finding_class != FINDING_CLASS_DIAGNOSTIC
        and evaluation.display_applicability
    )


def rule_for(rule_id: str) -> SiteHealthRule | None:
    """Convenience lookup of a catalog rule by id (or None)."""
    return SITE_HEALTH_RULES_BY_ID.get(rule_id)
