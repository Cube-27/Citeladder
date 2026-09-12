"""Evaluation of persisted question-and-answer relationship facts."""

from __future__ import annotations

from typing import Any

from app.analysis.site_health.fact_questions import is_answer_heading
from app.core.config.site_health_contracts import (
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_SATISFIED,
    RULE_OUTCOME_UNKNOWN,
)


def _observed_relationships(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [
        relationship
        for relationship in value
        if isinstance(relationship, dict)
        and is_answer_heading(str(relationship.get("question") or ""))
    ]


def _relationship_evidence(
    relationships: list[dict[str, Any]],
    answered: list[dict[str, Any]],
    unavailable: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "question_count": len(relationships),
        "answered_question_count": len(answered),
        "relationship_sources": sorted(
            {str(item.get("source") or "") for item in relationships}
        ),
        "unavailable_question_count": len(unavailable),
        "reasons": sorted(
            {
                str(item.get("reason") or "")
                for item in relationships
                if item.get("reason")
            }
        ),
    }


def check_question_answers(facts: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Require each observed FAQ question to have a server-rendered answer."""
    raw_relationships = facts.get("question_answer_relationships")
    if not isinstance(raw_relationships, list):
        return RULE_OUTCOME_UNKNOWN, {"reason": "question_relationships_unavailable"}
    relationships = _observed_relationships(raw_relationships)
    if not relationships:
        return RULE_OUTCOME_MISSING, {"reason": "no_question_answer_relationships"}
    answered = [
        item
        for item in relationships
        if item.get("answer_state") == "available"
        and str(item.get("answer") or "").strip()
    ]
    unavailable = [
        item for item in relationships if item.get("answer_state") == "unavailable"
    ]
    evidence = _relationship_evidence(relationships, answered, unavailable)
    if unavailable and len(answered) + len(unavailable) == len(relationships):
        evidence["reason"] = "question_answers_unavailable"
        return RULE_OUTCOME_UNKNOWN, evidence
    if len(answered) == len(relationships):
        return RULE_OUTCOME_SATISFIED, evidence
    evidence["reason"] = "question_answer_missing"
    return RULE_OUTCOME_MISSING, evidence


def check_question_associations(facts: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Require identifiable questions with a supported answer-region association."""
    raw_relationships = facts.get("question_answer_relationships")
    if not isinstance(raw_relationships, list):
        return RULE_OUTCOME_UNKNOWN, {"reason": "question_relationships_unavailable"}
    relationships = _observed_relationships(raw_relationships)
    if not relationships:
        return RULE_OUTCOME_MISSING, {"reason": "no_question_answer_relationships"}
    unavailable = [
        item for item in relationships if item.get("answer_state") == "unavailable"
    ]
    evidence = {
        "question_count": len(relationships),
        "associated_region_count": len(relationships) - len(unavailable),
        "relationship_sources": sorted(
            {str(item.get("source") or "") for item in relationships}
        ),
    }
    if unavailable:
        return RULE_OUTCOME_UNKNOWN, {
            **evidence,
            "reason": "answer_regions_unavailable",
        }
    return RULE_OUTCOME_SATISFIED, evidence
