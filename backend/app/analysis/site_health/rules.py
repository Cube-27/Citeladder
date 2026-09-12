# Pure deterministic evaluation of the config-owned Site Health rule catalog.
# Finalize-scoped rules are evaluated and persisted only by ``finalize.py``.
from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from itertools import islice
from typing import Any

from app.analysis.site_health.delivery_rules import DELIVERY_CHECKS
from app.analysis.site_health.identity_rules import (
    check_organization_identity,
    check_trust_path_present,
)
from app.analysis.site_health.indexing import (
    evaluate_indexability,
)
from app.analysis.site_health.product_rules import (
    check_listing_answer_set,
    check_listing_item_facts,
    check_offer_freshness_signal,
    check_product_answer_facts,
    check_product_brand_identity,
    check_product_evidence_facts,
)
from app.analysis.site_health.question_rules import (
    check_question_answers,
    check_question_associations,
)
from app.analysis.site_health.rule_scope import (
    applicability,
    profile_for,
)
from app.analysis.site_health.schema_rules import (
    check_schema_matches_content,
    check_schema_recommended_present,
    check_schema_required_valid,
    primary_schema_present,
)
from app.analysis.site_health.web_fundamentals import WEB_FUNDAMENTALS_CHECKS
from app.core.config.site_health_contracts import (
    RULE_FAILING_OUTCOMES,
    RULE_OUTCOME_ERROR,
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_NOT_APPLICABLE,
    RULE_OUTCOME_PARTIAL,
    RULE_OUTCOME_SATISFIED,
    RULE_OUTCOME_UNKNOWN,
)
from app.core.config.site_health_measurement import (
    STRUCTURAL_NA_REASONS,
    UNAVAILABLE_REASONS,
    UNKNOWN_REASONS,
    public_check_membership,
)
from app.core.config.site_health_rule_types import (
    FINDING_CLASS_DIAGNOSTIC,
    RULE_SCOPE_PAGE,
    SiteHealthRule,
)
from app.core.config.site_health_rules import (
    SITE_HEALTH_RULES,
    SITE_HEALTH_RULES_BY_ID,
)


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


def _pass_fail(condition: bool) -> str:
    return RULE_OUTCOME_SATISFIED if condition else RULE_OUTCOME_MISSING


def _check_present_field(
    facts: dict, *, field: str, length_key: str | None = None
) -> tuple[str, dict]:
    value = (facts.get(field) or "").strip()
    evidence: dict[str, Any] = {"present": bool(value)}
    if length_key:
        evidence[length_key] = len(value)
    else:
        evidence[field] = value
    return _pass_fail(bool(value)), evidence


def _check_indexable(facts: dict) -> tuple[str, dict]:
    return evaluate_indexability(facts)


def _check_structured_data_present(facts: dict) -> tuple[str, dict]:
    sd = facts.get("structured_data") or {}
    count = int(sd.get("count", 0) or 0)
    return _pass_fail(count > 0), {
        "block_count": count,
        "has_json_ld": bool(sd.get("has_json_ld")),
        "has_microdata": bool(sd.get("has_microdata")),
        "types": list(sd.get("types") or []),
    }


def _check_open_graph_present(facts: dict) -> tuple[str, dict]:
    og = facts.get("open_graph") or {}
    has_title = bool((og.get("og:title") or "").strip())
    has_desc = bool((og.get("og:description") or "").strip())
    present = has_title and has_desc
    return _pass_fail(present), {
        "has_og_title": has_title,
        "has_og_description": has_desc,
        "property_count": len(og),
    }


def _check_visible_attribution(facts: dict) -> tuple[str, dict]:
    authorship = facts.get("authorship") or {}
    visible = str(authorship.get("visible_byline") or "").strip()
    profile_url = str(authorship.get("visible_profile_url") or "").strip()
    declared = str(authorship.get("declared_author") or "").strip()
    declared_source = str(authorship.get("declared_author_source") or "").strip()
    evidence = {
        "visible_name": visible[:256],
        "visible_profile_url": profile_url[:512],
        "declared_name": declared[:256],
        "declared_source": declared_source,
    }
    if visible:
        return RULE_OUTCOME_SATISFIED, evidence
    if declared:
        evidence["reason"] = "declared_attribution_only"
        return RULE_OUTCOME_PARTIAL, evidence
    evidence["reason"] = "visible_attribution_absent"
    return RULE_OUTCOME_MISSING, evidence


def _check_content_date_present(facts: dict) -> tuple[str, dict]:
    dates = facts.get("dates") or {}
    published = bool((dates.get("published") or "").strip())
    modified = bool((dates.get("modified") or "").strip())
    evidence: dict[str, object] = {
        "has_published": published,
        "has_modified": modified,
    }
    if not (published or modified):
        evidence["reason"] = "freshness_signal_missing"
    return _pass_fail(published or modified), evidence


def _check_source_support_present(facts: dict) -> tuple[str, dict]:
    support = facts.get("source_support") or {}
    available = bool(support.get("primary_content_available"))
    sources = list(support.get("attached_sources") or ())
    ambiguous = int(support.get("ambiguous_source_count") or 0)
    invalid = int(support.get("invalid_source_count") or 0)
    evidence = {
        "attached_sources": list(islice(sources, 24)),
        "attached_source_count": len(sources),
        "ambiguous_source_count": ambiguous,
        "invalid_source_count": invalid,
        "context_reasons": list(islice(support.get("context_reasons") or (), 8)),
    }
    if not available:
        evidence["reason"] = "primary_content_unavailable"
        return RULE_OUTCOME_UNKNOWN, evidence
    if sources:
        return RULE_OUTCOME_SATISFIED, evidence
    if invalid:
        evidence["reason"] = "invalid_source_relationship"
        return RULE_OUTCOME_MISSING, evidence
    if ambiguous:
        evidence["reason"] = "ambiguous_source_attachment"
        return RULE_OUTCOME_UNKNOWN, evidence
    evidence["reason"] = "source_support_absent"
    return RULE_OUTCOME_MISSING, evidence


def _check_answer_first(facts: dict) -> tuple[str, dict]:
    return check_question_answers(facts)


def _composite_contract(rule_id: str):
    rule = SITE_HEALTH_RULES_BY_ID.get(rule_id)
    if rule is None or rule.composite_contract is None:
        raise RuntimeError(f"Composite contract missing for {rule_id}")
    return rule.composite_contract


def _check_product_answer_facts(facts: dict) -> tuple[str, dict]:
    return check_product_answer_facts(
        facts, contract=_composite_contract("aeo.product_answer_facts")
    )


def _check_listing_answer_set(facts: dict) -> tuple[str, dict]:
    return check_listing_answer_set(
        facts, contract=_composite_contract("aeo.listing_answer_set")
    )


def _check_primary_heading_hierarchy(facts: dict) -> tuple[str, dict]:
    outline = list(facts.get("primary_heading_outline") or ())
    sections = [
        {
            "level": int(item.get("level") or 0),
            "text": str(item.get("text") or "")[:256],
        }
        for item in outline
        if isinstance(item, dict) and str(item.get("text") or "").strip()
    ]
    return _pass_fail(bool(sections)), {
        "scope": "primary_content",
        "section_count": len(sections),
        "sections": sections[:24],
        "reason": "section_context_missing" if not sections else "",
    }


# Unmapped rules become ERROR; finalize-scoped rules belong to ``finalize.py``.
_CHECKS: dict[str, Callable[[dict], tuple[str, dict]]] = {
    "technical.title_present": lambda facts: _check_present_field(
        facts, field="title", length_key="title_length"
    ),
    "technical.meta_description_present": lambda facts: _check_present_field(
        facts, field="meta_description", length_key="description_length"
    ),
    "technical.canonical_present": lambda facts: _check_present_field(
        facts, field="canonical_url"
    ),
    "technical.indexable": _check_indexable,
    **DELIVERY_CHECKS,
    **WEB_FUNDAMENTALS_CHECKS,
    "aeo.structured_data_present": _check_structured_data_present,
    "aeo.open_graph_present": _check_open_graph_present,
    "aeo.schema_required_valid": check_schema_required_valid,
    "aeo.schema_recommended_present": check_schema_recommended_present,
    "aeo.schema_matches_content": check_schema_matches_content,
    "aeo.visible_attribution": _check_visible_attribution,
    "aeo.content_date_present": _check_content_date_present,
    "aeo.source_support_present": _check_source_support_present,
    "aeo.organization_identity": check_organization_identity,
    "aeo.trust_path_present": check_trust_path_present,
    "aeo.answer_first": _check_answer_first,
    "aeo.question_headings": check_question_associations,
    "aeo.heading_hierarchy": _check_primary_heading_hierarchy,
    "aeo.product_answer_facts": _check_product_answer_facts,
    "aeo.product_evidence_facts": check_product_evidence_facts,
    "aeo.product_brand_identity": check_product_brand_identity,
    "aeo.offer_freshness_signal": check_offer_freshness_signal,
    "aeo.listing_answer_set": _check_listing_answer_set,
    "aeo.listing_item_facts": check_listing_item_facts,
}


def _weight_for(rule: SiteHealthRule, facts: dict) -> float:
    """Resolve config-owned per-page-kind weight overrides."""
    profile = profile_for(facts)
    if profile is not None:
        override = profile.rule_weight_overrides.get(rule.rule_id)
        if override is not None:
            return float(override)
    return float(rule.weight)


def _normalized_outcome(
    rule: SiteHealthRule, outcome: str, evidence: dict
) -> tuple[str, str]:
    if (
        rule.rule_id == "technical.indexable"
        and outcome == RULE_OUTCOME_MISSING
        and evidence.get("indexing_intent") == "unknown"
    ):
        evidence["reason"] = "insufficient_evidence"
        return RULE_OUTCOME_UNKNOWN, "insufficient_evidence"
    reason = str(evidence.get("reason") or "")
    if outcome != RULE_OUTCOME_NOT_APPLICABLE:
        return outcome, reason
    if reason in UNAVAILABLE_REASONS:
        return RULE_OUTCOME_UNKNOWN, reason
    if reason in UNKNOWN_REASONS:
        return RULE_OUTCOME_UNKNOWN, reason
    if reason in STRUCTURAL_NA_REASONS:
        return outcome, reason
    bounded_reason = reason or "insufficient_evidence"
    evidence["reason"] = bounded_reason
    return RULE_OUTCOME_UNKNOWN, bounded_reason


def measurement_context(facts: dict) -> dict[str, object]:
    source_support = facts.get("source_support") or {}
    freshness = facts.get("freshness_context") or {}
    page_kind = str(facts.get("page_kind") or "other")
    return {
        "is_site_root": facts.get("site") is not None,
        "research_sensitive": bool(source_support.get("research_sensitive")),
        "freshness_sensitive": bool(freshness.get("required"))
        or page_kind in {"product", "category", "pricing"},
        "primary_schema_present": primary_schema_present(facts),
    }


def _measurement_metadata(rule: SiteHealthRule, facts: dict) -> dict[str, Any]:
    page_kind = str(facts.get("page_kind") or "other")
    score_roles, pillar = public_check_membership(rule.rule_id, page_kind)
    return {
        "score_applicability": bool(score_roles),
        "score_roles": score_roles,
        "readiness_dimension": pillar,
        "readiness_weight": 1.0 if pillar else 0.0,
    }


def _evaluation_base(rule: SiteHealthRule, facts: dict) -> dict[str, Any]:
    return dict(
        rule_id=rule.rule_id,
        rule_version=rule.rule_version,
        dimension=rule.dimension,
        category=rule.category,
        severity=rule.severity,
        finding_class=rule.finding_class,
        scope=rule.scope,
        weight=_weight_for(rule, facts),
        description=rule.description,
        remediation=rule.remediation,
    )


def _not_applicable_evaluation(
    rule: SiteHealthRule, facts: dict, base: dict[str, Any], reason: str
) -> RuleEvaluation:
    evidence = {"reason": reason or "unknown_applicability"}
    outcome, reason_code = _normalized_outcome(
        rule, RULE_OUTCOME_NOT_APPLICABLE, evidence
    )
    metadata = (
        _measurement_metadata(rule, facts)
        if outcome != RULE_OUTCOME_NOT_APPLICABLE
        else {}
    )
    return RuleEvaluation(
        outcome=outcome,
        evidence=evidence,
        display_applicability=outcome != RULE_OUTCOME_NOT_APPLICABLE,
        reason_code=reason_code,
        **metadata,
        **base,
    )


def _needs_extraction(rule: SiteHealthRule) -> bool:
    return "html" in rule.applicability_key or "content" in rule.applicability_key


def _extraction_unavailable(
    rule: SiteHealthRule, facts: dict, base: dict[str, Any]
) -> RuleEvaluation | None:
    extraction = facts.get("extraction") or {}
    extraction_state = str(extraction.get("state") or "")
    if (
        not extraction_state
        or extraction_state == "available"
        or not _needs_extraction(rule)
    ):
        return None
    reason = str(extraction.get("reason") or "extraction_unavailable")
    return RuleEvaluation(
        outcome=RULE_OUTCOME_UNKNOWN,
        evidence={"reason": reason},
        display_applicability=True,
        reason_code=reason,
        **_measurement_metadata(rule, facts),
        **base,
    )


def _run_check(
    rule: SiteHealthRule, facts: dict, base: dict[str, Any]
) -> RuleEvaluation:
    extraction = facts.get("extraction") or {}
    check = _CHECKS.get(rule.rule_id)
    if check is None:
        reason = "no_check_mapped"
        return RuleEvaluation(
            outcome=RULE_OUTCOME_ERROR,
            evidence={"error": reason},
            reason_code=reason,
            **_measurement_metadata(rule, facts),
            **base,
        )
    try:
        outcome, evidence = check(facts)
    # Preserve unexpected check failures as evidence instead of aborting the page.
    except Exception as exc:  # noqa: BLE001
        reason = "check_error"
        return RuleEvaluation(
            outcome=RULE_OUTCOME_ERROR,
            evidence={"error": f"{type(exc).__name__}: {exc}"[:512]},
            reason_code=reason,
            **_measurement_metadata(rule, facts),
            **base,
        )
    if (
        outcome == RULE_OUTCOME_MISSING
        and extraction.get("truncated")
        and _needs_extraction(rule)
    ):
        outcome = RULE_OUTCOME_UNKNOWN
        evidence["reason"] = "extraction_truncated"
    outcome, reason = _normalized_outcome(rule, outcome, evidence)
    return RuleEvaluation(
        outcome=outcome,
        evidence=evidence,
        display_applicability=True,
        reason_code=reason,
        **_measurement_metadata(rule, facts),
        **base,
    )


def evaluate_rule(
    rule: SiteHealthRule,
    facts: dict,
) -> RuleEvaluation:
    """Evaluate one rule with direct, outcome-independent checklist membership."""
    base = _evaluation_base(rule, facts)
    applicable, skip_reason = applicability(rule, facts)
    if not applicable:
        return _not_applicable_evaluation(rule, facts, base, skip_reason)
    unavailable = _extraction_unavailable(rule, facts, base)
    return unavailable or _run_check(rule, facts, base)


def evaluate_all(facts: dict) -> list[RuleEvaluation]:
    """Evaluate every catalog rule against one frozen measurement profile."""
    return evaluate_rules(facts, SITE_HEALTH_RULES)


def evaluate_rules(
    facts: dict, rules: Iterable[SiteHealthRule]
) -> list[RuleEvaluation]:
    """Evaluate the supplied rules against one immutable measurement profile."""
    return [evaluate_rule(rule, facts) for rule in rules]


def rule_for(rule_id: str) -> SiteHealthRule | None:
    """Convenience lookup of a catalog rule by id (or None)."""
    return SITE_HEALTH_RULES_BY_ID.get(rule_id)
