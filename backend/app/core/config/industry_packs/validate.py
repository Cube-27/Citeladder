"""Offline integrity and safety validation for the canonical industry catalog."""

from __future__ import annotations

import argparse
import json
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .catalog import (
    CATALOG_ROOT,
    CatalogError,
    canonical_content_hash,
    load_pack,
    pack_manifest,
)
from .reference import classify_page, compile_pack

EXPECTED_PACK_IDS = frozenset(
    {
        "automotive",
        "commerce",
        "education",
        "financial_services",
        "general_business",
        "healthcare",
        "hospitality",
        "local_services",
        "manufacturing",
        "media_publishing",
        "nonprofit",
        "professional_services",
        "real_estate",
        "recruiting_staffing",
        "restaurants",
        "saas",
    }
)
VALIDATED_CANDIDATE_PACK_IDS = frozenset({"commerce", "education"})
FOUNDATION_PACK_IDS = EXPECTED_PACK_IDS - VALIDATED_CANDIDATE_PACK_IDS

REQUIRED_CANONICAL_FILES = (
    "README.md",
    "PAGE_ANALYSIS_AUDIT.md",
    "PERFORMANCE_CONTRACT.md",
    "EXTENSION_CONTRACT.md",
    "EVALUATION_CONTRACT.md",
    "__init__.py",
    "benchmark.py",
    "capabilities.json",
    "catalog-summary.json",
    "catalog.py",
    "core.json",
    "reference.py",
    "registry.json",
    "schema-terms.json",
    "schema/industry-pack.schema.json",
    "sources.json",
    "taxonomy.json",
    "validate.py",
)

_SAFE_FAQ_EXPECTATIONS = {
    "unknown": "request_or_omit",
    "historical": "do_not_present_as_current",
    "conflicting": "block_authoritative_generation",
    "unsupported": "reject_or_request",
}


class CatalogValidationError(ValueError):
    """The canonical catalog failed one or more acceptance checks."""


@dataclass(frozen=True, slots=True)
class ValidationReport:
    catalog_version: str
    pack_count: int
    validated_candidate_pack_count: int
    foundation_pack_count: int
    role_fixture_case_count: int
    faq_fixture_case_count: int
    special_fixture_count: int
    counts: Mapping[str, int]
    hygiene_checked: bool


def _read_json(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"missing JSON file: {path}")
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"invalid JSON file {path}: {exc}")
    return None


def _error(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def _schema_type_matches(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    return True


def _validate_schema_subset(
    value: Any,
    schema: Mapping[str, Any],
    path: str,
    errors: list[str],
) -> None:
    expected_type = schema.get("type")
    if isinstance(expected_type, str) and not _schema_type_matches(
        value,
        expected_type,
    ):
        errors.append(f"{path}: expected {expected_type}, got {type(value).__name__}")
        return

    enum = schema.get("enum")
    if isinstance(enum, list) and value not in enum:
        errors.append(f"{path}: value {value!r} is not in enum {enum!r}")

    if isinstance(value, str):
        minimum_length = schema.get("minLength")
        if isinstance(minimum_length, int) and len(value) < minimum_length:
            errors.append(f"{path}: string is shorter than {minimum_length}")
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and re.fullmatch(pattern, value) is None:
            errors.append(f"{path}: value {value!r} does not match {pattern!r}")

    if isinstance(value, list):
        minimum_items = schema.get("minItems")
        if isinstance(minimum_items, int) and len(value) < minimum_items:
            errors.append(f"{path}: array has fewer than {minimum_items} items")
        if schema.get("uniqueItems") is True:
            serialized = [
                json.dumps(item, sort_keys=True, ensure_ascii=False) for item in value
            ]
            if len(serialized) != len(set(serialized)):
                errors.append(f"{path}: array items are not unique")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                _validate_schema_subset(
                    item,
                    item_schema,
                    f"{path}[{index}]",
                    errors,
                )

    if isinstance(value, dict):
        required = schema.get("required", ())
        if isinstance(required, list):
            for key in required:
                if key not in value:
                    errors.append(f"{path}: missing required property {key!r}")
        properties = schema.get("properties", {})
        if isinstance(properties, dict):
            for key, child_schema in properties.items():
                if key in value and isinstance(child_schema, dict):
                    _validate_schema_subset(
                        value[key],
                        child_schema,
                        f"{path}.{key}",
                        errors,
                    )
            if schema.get("additionalProperties") is False:
                extras = sorted(set(value) - set(properties))
                if extras:
                    errors.append(f"{path}: unexpected properties {extras!r}")


def _require_namespaced_ids(
    items: Sequence[Mapping[str, Any]],
    id_key: str,
    pack_id: str,
    label: str,
    errors: list[str],
) -> set[str]:
    values: list[str] = []
    prefix = f"{pack_id}."
    for index, item in enumerate(items):
        raw = item.get(id_key)
        if not isinstance(raw, str) or not raw:
            errors.append(f"{pack_id}.{label}[{index}] has no non-empty {id_key}")
            continue
        if not raw.startswith(prefix):
            errors.append(f"{raw}: {id_key} must be namespaced by {pack_id}")
        values.append(raw)
    if len(values) != len(set(values)):
        errors.append(f"{pack_id}: duplicate {id_key} values in {label}")
    return set(values)


def _require_refs(
    refs: Iterable[Any],
    allowed: set[str],
    context: str,
    errors: list[str],
) -> None:
    for ref in refs:
        if not isinstance(ref, str) or ref not in allowed:
            errors.append(f"{context}: unknown reference {ref!r}")


def _validate_signal(
    signal: Mapping[str, Any],
    *,
    pack_id: str,
    role_id: str,
    expected_polarity: str,
    fields: set[str],
    operators: set[str],
    seen_ids: set[str],
    errors: list[str],
) -> None:
    signal_id = signal.get("signal_id")
    if not isinstance(signal_id, str) or not signal_id.startswith(f"{pack_id}."):
        errors.append(f"{role_id}: invalid namespaced signal_id {signal_id!r}")
    elif signal_id in seen_ids:
        errors.append(f"{pack_id}: duplicate signal_id {signal_id}")
    else:
        seen_ids.add(signal_id)
    if signal.get("field") not in fields:
        errors.append(f"{signal_id}: unknown signal field {signal.get('field')!r}")
    if signal.get("operator") not in operators:
        errors.append(
            f"{signal_id}: unknown signal operator {signal.get('operator')!r}"
        )
    if signal.get("polarity") != expected_polarity:
        errors.append(
            f"{signal_id}: expected polarity {expected_polarity!r}, "
            f"got {signal.get('polarity')!r}"
        )
    weight = signal.get("weight")
    if not isinstance(weight, (int, float)) or isinstance(weight, bool):
        errors.append(f"{signal_id}: weight must be numeric")
    elif expected_polarity == "positive" and weight <= 0:
        errors.append(f"{signal_id}: positive weight must be greater than zero")
    elif expected_polarity == "negative" and weight >= 0:
        errors.append(f"{signal_id}: negative weight must be less than zero")
    if signal.get("operator") == "regex":
        pattern = signal.get("pattern")
        if not isinstance(pattern, str) or not pattern:
            errors.append(f"{signal_id}: regex signal requires a pattern")
        else:
            try:
                re.compile(pattern)
            except re.error as exc:
                errors.append(f"{signal_id}: invalid regex: {exc}")
    else:
        values = signal.get("values")
        if not isinstance(values, list) or not values:
            errors.append(f"{signal_id}: non-regex signal requires values")


def _validate_pack(
    pack: Mapping[str, Any],
    *,
    core: Mapping[str, Any],
    schema_types: set[str],
    capability_ids: set[str],
    errors: list[str],
) -> dict[str, int]:
    pack_id = str(pack.get("pack_id", ""))
    roles = tuple(pack.get("page_roles", ()))
    entities = tuple(pack.get("entity_types", ()))
    predicates = tuple(pack.get("assertion_predicates", ()))
    relations = tuple(pack.get("relation_types", ()))
    journeys = tuple(pack.get("journeys", ()))
    questions = tuple(pack.get("question_contracts", ()))
    rules = tuple(pack.get("analysis_rules", ()))
    briefs = tuple(pack.get("brief_templates", ()))
    prompts = tuple(pack.get("prompt_archetypes", ()))

    role_ids = _require_namespaced_ids(
        roles,
        "role_id",
        pack_id,
        "page_roles",
        errors,
    )
    entity_ids = _require_namespaced_ids(
        entities,
        "entity_type_id",
        pack_id,
        "entity_types",
        errors,
    )
    predicate_ids = _require_namespaced_ids(
        predicates,
        "predicate_id",
        pack_id,
        "assertion_predicates",
        errors,
    )
    relation_ids = _require_namespaced_ids(
        relations,
        "relation_type_id",
        pack_id,
        "relation_types",
        errors,
    )
    journey_ids = _require_namespaced_ids(
        journeys,
        "journey_id",
        pack_id,
        "journeys",
        errors,
    )
    question_ids = _require_namespaced_ids(
        questions,
        "question_id",
        pack_id,
        "question_contracts",
        errors,
    )
    rule_ids = _require_namespaced_ids(
        rules,
        "rule_id",
        pack_id,
        "analysis_rules",
        errors,
    )
    brief_ids = _require_namespaced_ids(
        briefs,
        "brief_id",
        pack_id,
        "brief_templates",
        errors,
    )
    prompt_ids = _require_namespaced_ids(
        prompts,
        "prompt_id",
        pack_id,
        "prompt_archetypes",
        errors,
    )
    del relation_ids, journey_ids, rule_ids, brief_ids, prompt_ids

    stage_items = [stage for journey in journeys for stage in journey.get("stages", ())]
    outcome_items = [
        outcome for journey in journeys for outcome in journey.get("outcomes", ())
    ]
    stage_ids = _require_namespaced_ids(
        stage_items,
        "stage_id",
        pack_id,
        "journey_stages",
        errors,
    )
    outcome_ids = _require_namespaced_ids(
        outcome_items,
        "outcome_id",
        pack_id,
        "outcomes",
        errors,
    )

    _require_refs(
        pack.get("capability_ids", ()),
        capability_ids,
        f"{pack_id}.capability_ids",
        errors,
    )
    policy = pack.get("classification_policy", {})
    if not isinstance(policy, dict):
        errors.append(f"{pack_id}.classification_policy must be an object")
        policy = {}
    if policy.get("classifier_version") != core.get("classifier_version"):
        errors.append(f"{pack_id}: classifier version does not match core")
    for key in (
        "minimum_score",
        "minimum_margin",
        "high_confidence_score",
        "maximum_secondary_roles",
        "maximum_evidence_records",
        "maximum_alternatives",
        "maximum_conflicts",
    ):
        if not isinstance(policy.get(key), (int, float)):
            errors.append(f"{pack_id}.classification_policy.{key} must be numeric")
    if policy.get("schema_only_may_classify") is not False:
        errors.append(f"{pack_id}: schema-only classification must remain disabled")
    if policy.get("abstain_on_tie") is not True:
        errors.append(f"{pack_id}: tie abstention must remain enabled")

    fields = set(core.get("classifier_signal_fields", ()))
    operators = set(core.get("classifier_operators", ()))
    page_kinds = set(core.get("generic_page_kinds", ()))
    signal_ids: set[str] = set()
    for role in roles:
        role_id = str(role.get("role_id"))
        _require_refs(
            role.get("page_kinds", ()),
            page_kinds,
            f"{role_id}.page_kinds",
            errors,
        )
        _require_refs(
            role.get("required_question_ids", ()),
            question_ids,
            f"{role_id}.required_question_ids",
            errors,
        )
        _require_refs(
            role.get("entity_type_ids", ()),
            entity_ids,
            f"{role_id}.entity_type_ids",
            errors,
        )
        schema_expectations = role.get("schema_expectations", {})
        _require_refs(
            schema_expectations.get("recommended_types", ()),
            schema_types,
            f"{role_id}.schema_expectations.recommended_types",
            errors,
        )
        if schema_expectations.get("rich_result_guaranteed") is not False:
            errors.append(f"{role_id}: rich-result guarantees are forbidden")
        for signal in role.get("signals", ()):
            _validate_signal(
                signal,
                pack_id=pack_id,
                role_id=role_id,
                expected_polarity="positive",
                fields=fields,
                operators=operators,
                seen_ids=signal_ids,
                errors=errors,
            )
        for signal in role.get("negative_signals", ()):
            _validate_signal(
                signal,
                pack_id=pack_id,
                role_id=role_id,
                expected_polarity="negative",
                fields=fields,
                operators=operators,
                seen_ids=signal_ids,
                errors=errors,
            )

    for entity in entities:
        entity_id = str(entity.get("entity_type_id"))
        attributes = entity.get("attributes", ())
        attribute_names = {
            item.get("name") for item in attributes if isinstance(item, dict)
        }
        _require_refs(
            entity.get("identity_fields", ()),
            {str(value) for value in attribute_names if isinstance(value, str)},
            f"{entity_id}.identity_fields",
            errors,
        )

    for predicate in predicates:
        predicate_id = str(predicate.get("predicate_id"))
        _require_refs(
            predicate.get("subject_entity_type_ids", ()),
            entity_ids,
            f"{predicate_id}.subject_entity_type_ids",
            errors,
        )

    for relation in relations:
        relation_id = str(relation.get("relation_type_id"))
        _require_refs(
            relation.get("source_entity_type_ids", ()),
            entity_ids,
            f"{relation_id}.source_entity_type_ids",
            errors,
        )
        _require_refs(
            relation.get("target_entity_type_ids", ()),
            entity_ids,
            f"{relation_id}.target_entity_type_ids",
            errors,
        )

    for journey in journeys:
        journey_id = str(journey.get("journey_id"))
        _require_refs(
            journey.get("audience_entity_type_ids", ()),
            entity_ids,
            f"{journey_id}.audience_entity_type_ids",
            errors,
        )
        for stage in journey.get("stages", ()):
            stage_id = str(stage.get("stage_id"))
            _require_refs(
                stage.get("required_role_ids", ()),
                role_ids,
                f"{stage_id}.required_role_ids",
                errors,
            )
            _require_refs(
                stage.get("required_question_ids", ()),
                question_ids,
                f"{stage_id}.required_question_ids",
                errors,
            )
            _require_refs(
                stage.get("outcome_ids", ()),
                outcome_ids,
                f"{stage_id}.outcome_ids",
                errors,
            )

    for question in questions:
        question_id = str(question.get("question_id"))
        _require_refs(
            question.get("applicable_role_ids", ()),
            role_ids,
            f"{question_id}.applicable_role_ids",
            errors,
        )
        _require_refs(
            (question.get("journey_stage_id"),),
            stage_ids,
            f"{question_id}.journey_stage_id",
            errors,
        )
        _require_refs(
            question.get("required_predicate_ids", ()),
            predicate_ids,
            f"{question_id}.required_predicate_ids",
            errors,
        )
        _require_refs(
            question.get("required_entity_type_ids", ()),
            entity_ids,
            f"{question_id}.required_entity_type_ids",
            errors,
        )

    for brief in briefs:
        brief_id = str(brief.get("brief_id"))
        _require_refs(
            brief.get("role_ids", ()),
            role_ids,
            f"{brief_id}.role_ids",
            errors,
        )
        if brief.get("human_review_required") is not True:
            errors.append(f"{brief_id}: human review must remain required")

    for prompt in prompts:
        prompt_id = str(prompt.get("prompt_id"))
        _require_refs(
            prompt.get("journey_stage_ids", ()),
            stage_ids,
            f"{prompt_id}.journey_stage_ids",
            errors,
        )

    generation = pack.get("generation_policy", {})
    expected_generation = {
        "unknown_fact_behavior": "request_or_omit",
        "conflict_behavior": "block_authoritative_generation",
        "historical_fact_behavior": "never_present_as_current",
        "numeric_claims_require_direct_evidence": True,
        "faqpage_requires_visible_content_parity": True,
        "faq_rich_result_guaranteed": False,
    }
    for key, expected in expected_generation.items():
        if generation.get(key) != expected:
            errors.append(
                f"{pack_id}.generation_policy.{key}: expected {expected!r}, "
                f"got {generation.get(key)!r}"
            )
    review = pack.get("review_requirements", {})
    if review.get("project_facts_may_mutate_pack") is not False:
        errors.append(f"{pack_id}: project facts must not mutate shared packs")
    if review.get("authoritative_findings_enabled") is not False:
        errors.append(f"{pack_id}: authoritative findings must remain disabled")

    return {
        "page_roles": len(roles),
        "entity_types": len(entities),
        "assertion_predicates": len(predicates),
        "relation_types": len(relations),
        "journeys": len(journeys),
        "journey_stages": len(stage_items),
        "outcomes": len(outcome_items),
        "question_contracts": len(questions),
        "analysis_rules": len(rules),
        "brief_templates": len(briefs),
        "prompt_archetypes": len(prompts),
    }


def _validate_role_fixture(
    pack: Mapping[str, Any],
    compiled: Any,
    fixture: Mapping[str, Any],
    errors: list[str],
) -> int:
    pack_id = str(pack["pack_id"])
    if fixture.get("pack_id") != pack_id:
        errors.append(f"{pack_id}: role fixture pack_id mismatch")
    cases = fixture.get("cases", ())
    if not isinstance(cases, list):
        errors.append(f"{pack_id}: role fixture cases must be an array")
        return 0
    case_ids: set[str] = set()
    case_classes: set[str] = set()
    for index, case in enumerate(cases):
        case_id = case.get("case_id")
        if not isinstance(case_id, str) or not case_id:
            errors.append(f"{pack_id}: role fixture case {index} has no case_id")
            continue
        if case_id in case_ids:
            errors.append(f"{pack_id}: duplicate role fixture case_id {case_id}")
        case_ids.add(case_id)
        case_classes.add(str(case.get("case_class")))
        result = classify_page(compiled, case.get("facts", {}))
        if "expected_role_id" in case:
            expected = case.get("expected_role_id")
            if result["primary_role_id"] != expected:
                errors.append(
                    f"{case_id}: expected role {expected!r}, "
                    f"got {result['primary_role_id']!r} "
                    f"({result['abstention_reason']!r})"
                )
        if "expected_abstention_reason" in case:
            expected = case.get("expected_abstention_reason")
            if result["abstention_reason"] != expected:
                errors.append(
                    f"{case_id}: expected abstention {expected!r}, "
                    f"got {result['abstention_reason']!r}"
                )
        if case.get("expected_conflict_disclosure") and not result["conflicts"]:
            errors.append(f"{case_id}: expected conflict disclosure")
        if "expected_temporal_state" in case:
            expected = case.get("expected_temporal_state")
            if result["temporal_state"] != expected:
                errors.append(
                    f"{case_id}: expected temporal state {expected!r}, "
                    f"got {result['temporal_state']!r}"
                )
        if len(result["evidence"]) > compiled.maximum_evidence_records:
            errors.append(f"{case_id}: evidence output exceeds configured bound")
        if len(result["alternatives"]) > compiled.maximum_alternatives:
            errors.append(f"{case_id}: alternatives output exceeds configured bound")
        if len(result["conflicts"]) > compiled.maximum_conflicts:
            errors.append(f"{case_id}: conflicts output exceeds configured bound")
    required_classes = set(pack.get("evaluation", {}).get("required_case_classes", ()))
    missing_classes = sorted(required_classes - case_classes)
    if missing_classes:
        errors.append(
            f"{pack_id}: role fixture misses required classes {missing_classes!r}"
        )
    return len(cases)


def _validate_faq_fixture(
    pack: Mapping[str, Any],
    fixture: Mapping[str, Any],
    errors: list[str],
) -> int:
    pack_id = str(pack["pack_id"])
    question_ids = {item["question_id"] for item in pack["question_contracts"]}
    if fixture.get("pack_id") != pack_id:
        errors.append(f"{pack_id}: FAQ fixture pack_id mismatch")
    cases = fixture.get("cases", ())
    if not isinstance(cases, list):
        errors.append(f"{pack_id}: FAQ fixture cases must be an array")
        return 0
    seen_ids: set[str] = set()
    seen_classes: set[str] = set()
    for index, case in enumerate(cases):
        case_id = case.get("case_id")
        if not isinstance(case_id, str) or not case_id:
            errors.append(f"{pack_id}: FAQ fixture case {index} has no case_id")
            continue
        if case_id in seen_ids:
            errors.append(f"{pack_id}: duplicate FAQ fixture case_id {case_id}")
        seen_ids.add(case_id)
        case_class = str(case.get("case_class"))
        seen_classes.add(case_class)
        if case.get("question_id") not in question_ids:
            errors.append(f"{case_id}: unknown question_id {case.get('question_id')!r}")
        expected_safe = _SAFE_FAQ_EXPECTATIONS.get(case_class)
        if expected_safe and case.get("expected") != expected_safe:
            errors.append(
                f"{case_id}: unsafe expectation {case.get('expected')!r}; "
                f"expected {expected_safe!r}"
            )
        if case_class == "schema_parity":
            visible = case.get("visible_answer")
            schema_answer = case.get("schema_answer")
            expected = "pass" if visible and visible == schema_answer else "reject"
            if case.get("expected") != expected:
                errors.append(f"{case_id}: invalid visible/schema parity expectation")
    required = {
        "supported",
        "unknown",
        "historical",
        "conflicting",
        "unsupported",
        "schema_parity",
    }
    missing = sorted(required - seen_classes)
    if missing:
        errors.append(f"{pack_id}: FAQ fixture misses classes {missing!r}")
    return len(cases)


def _validate_special_fixtures(
    packs: Mapping[str, Mapping[str, Any]],
    errors: list[str],
) -> int:
    count = 0
    commerce_path = CATALOG_ROOT / "fixtures/commerce/catalog-scenarios.json"
    commerce = _read_json(commerce_path, errors)
    if isinstance(commerce, dict):
        scenarios = commerce.get("scenarios", ())
        commerce_roles = {item["role_id"] for item in packs["commerce"]["page_roles"]}
        scenario_ids = set()
        for scenario in scenarios:
            scenario_id = scenario.get("scenario_id")
            if not isinstance(scenario_id, str) or not scenario_id:
                errors.append("commerce catalog scenario has no scenario_id")
                continue
            if scenario_id in scenario_ids:
                errors.append(f"duplicate commerce scenario_id {scenario_id}")
            scenario_ids.add(scenario_id)
            _require_refs(
                scenario.get("roles", ()),
                commerce_roles,
                f"commerce scenario {scenario_id}",
                errors,
            )
            if not scenario.get("expected"):
                errors.append(f"commerce scenario {scenario_id} has no expectations")
        required_scenarios = {
            "category_with_filters",
            "discontinued_product",
            "pdp_current_offer",
            "policy_scope",
            "variant_family",
            "visible_schema_price_conflict",
        }
        missing = sorted(required_scenarios - scenario_ids)
        if missing:
            errors.append(f"commerce scenarios missing {missing!r}")
        count += len(scenarios)

    education_path = (
        CATALOG_ROOT / "fixtures/education/asian-school-public-labels.json"
    )
    education = _read_json(education_path, errors)
    if isinstance(education, dict):
        if education.get("pack_id") != "education":
            errors.append("education public-label fixture pack_id mismatch")
        boundary = education.get("source_boundary", {})
        if boundary.get("customer_facts_are_not_shared_pack_knowledge") is not True:
            errors.append("education public-label fixture lacks customer-fact boundary")
        education_roles = {
            item["role_id"] for item in packs["education"]["page_roles"]
        }
        _require_refs(
            education.get("required_role_families", ()),
            education_roles,
            "education public-label required_role_families",
            errors,
        )
        if not education.get("required_semantic_labels"):
            errors.append("education public-label fixture has no semantic labels")
        count += 1
    return count


def _computed_counts(
    packs: Mapping[str, Mapping[str, Any]],
    taxonomy_data: Mapping[str, Any],
    capabilities_data: Mapping[str, Any],
    schema_terms: Mapping[str, Any],
    per_pack_counts: Mapping[str, Mapping[str, int]],
) -> dict[str, int]:
    keys = (
        "page_roles",
        "entity_types",
        "assertion_predicates",
        "relation_types",
        "journeys",
        "journey_stages",
        "outcomes",
        "question_contracts",
        "analysis_rules",
        "brief_templates",
        "prompt_archetypes",
    )
    result = {key: sum(item[key] for item in per_pack_counts.values()) for key in keys}
    result.update(
        {
            "packs": len(packs),
            "validated_candidate_packs": sum(
                pack["maturity"] == "validated_candidate" for pack in packs.values()
            ),
            "foundation_packs": sum(
                pack["maturity"] == "foundation" for pack in packs.values()
            ),
            "taxonomy_nodes": len(taxonomy_data.get("nodes", ())),
            "capabilities": len(capabilities_data.get("capabilities", ())),
            "schema_types": len(schema_terms.get("types", ())),
            "schema_properties": len(schema_terms.get("properties", ())),
        }
    )
    return result


def _validate_hygiene(errors: list[str]) -> None:
    backend_root = CATALOG_ROOT.parents[3]
    repo_root = CATALOG_ROOT.parents[4]
    forbidden_exact = (
        repo_root / ".industry_kb_transfer",
        repo_root / ".registry_bundle.b64",
        repo_root / ".runtime/build_industry_catalog.py",
        backend_root / "app/core/config/industry_registry",
        backend_root / "app/core/config/industry_registry.json",
        backend_root / "app/core/config/industry_registry.schema.json",
        backend_root / "calibrate_industry_fixtures.py",
        backend_root / "inspect_industry_conflicts.py",
        backend_root / "replay_industry_catalog.py",
    )
    for path in forbidden_exact:
        if path.exists():
            errors.append(f"forbidden duplicate or transient asset exists: {path}")

    runtime = repo_root / ".runtime"
    if runtime.exists():
        for pattern in ("industry_catalog*", "industry-catalog*"):
            for path in runtime.glob(pattern):
                errors.append(f"forbidden transient asset exists: {path}")
    for path in backend_root.glob("tmp_*"):
        errors.append(f"forbidden backend temporary asset exists: {path}")

    old_pack_docs = repo_root / "docs/plans/industry-packs"
    if old_pack_docs.exists():
        extras = sorted(
            path
            for path in old_pack_docs.rglob("*")
            if path.is_file() and path.name != "README.md"
        )
        for path in extras:
            errors.append(f"duplicate industry-pack definition remains: {path}")


def validate_catalog(*, check_hygiene: bool = True) -> ValidationReport:
    """Validate the complete catalog or raise one aggregated error."""

    errors: list[str] = []
    for relative in REQUIRED_CANONICAL_FILES:
        _error(
            errors,
            (CATALOG_ROOT / relative).is_file(),
            f"missing canonical file: {relative}",
        )

    for path in sorted(CATALOG_ROOT.rglob("*.json")):
        _read_json(path, errors)

    registry_data = _read_json(CATALOG_ROOT / "registry.json", errors)
    core = _read_json(CATALOG_ROOT / "core.json", errors)
    capabilities_data = _read_json(CATALOG_ROOT / "capabilities.json", errors)
    taxonomy_data = _read_json(CATALOG_ROOT / "taxonomy.json", errors)
    schema_terms = _read_json(CATALOG_ROOT / "schema-terms.json", errors)
    summary = _read_json(CATALOG_ROOT / "catalog-summary.json", errors)
    pack_schema = _read_json(
        CATALOG_ROOT / "schema/industry-pack.schema.json",
        errors,
    )
    if not all(
        isinstance(item, dict)
        for item in (
            registry_data,
            core,
            capabilities_data,
            taxonomy_data,
            schema_terms,
            summary,
            pack_schema,
        )
    ):
        raise CatalogValidationError("\n".join(errors))

    registry_entries = registry_data.get("packs", ())
    registry_ids = {entry.get("pack_id") for entry in registry_entries}
    if registry_ids != EXPECTED_PACK_IDS:
        errors.append(
            "registry pack IDs differ from required catalog: "
            f"expected {sorted(EXPECTED_PACK_IDS)!r}, got {sorted(registry_ids)!r}"
        )
    pack_paths = sorted((CATALOG_ROOT / "packs").glob("*.json"))
    file_ids = {path.stem for path in pack_paths}
    if file_ids != EXPECTED_PACK_IDS:
        errors.append(
            "pack filenames differ from required catalog: "
            f"expected {sorted(EXPECTED_PACK_IDS)!r}, got {sorted(file_ids)!r}"
        )
    if registry_data.get("general_fallback_pack_id") != "general_business":
        errors.append("registry general fallback must be general_business")

    capability_items = capabilities_data.get("capabilities", ())
    capability_ids = {
        item.get("capability_id") for item in capability_items if isinstance(item, dict)
    }
    if len(capability_ids) != len(capability_items):
        errors.append("capability IDs must be unique and non-empty")
    schema_type_items = schema_terms.get("types", ())
    schema_property_items = schema_terms.get("properties", ())
    schema_types = {
        item.get("name") for item in schema_type_items if isinstance(item, dict)
    }
    schema_properties = {
        item.get("name") for item in schema_property_items if isinstance(item, dict)
    }
    if len(schema_types) != len(schema_type_items):
        errors.append("Schema.org type snapshot contains duplicates or invalid names")
    if len(schema_properties) != len(schema_property_items):
        errors.append(
            "Schema.org property snapshot contains duplicates or invalid names"
        )

    packs: dict[str, Mapping[str, Any]] = {}
    per_pack_counts: dict[str, dict[str, int]] = {}
    role_fixture_count = 0
    faq_fixture_count = 0
    for entry in registry_entries:
        if not isinstance(entry, dict):
            errors.append("registry pack entry must be an object")
            continue
        pack_id = entry.get("pack_id")
        version = entry.get("version")
        if not isinstance(pack_id, str) or not isinstance(version, str):
            errors.append(f"invalid registry pack entry: {entry!r}")
            continue
        if entry.get("authoritative_findings_enabled") is not False:
            errors.append(f"{pack_id}: registry authoritative findings must be false")
        try:
            frozen_pack = load_pack(pack_id, version)
            manifest = pack_manifest(pack_id, version)
        except CatalogError as exc:
            errors.append(str(exc))
            continue
        # Reload the canonical JSON after the exact loader has verified it.
        pack_path = CATALOG_ROOT / str(entry.get("file"))
        raw_pack = _read_json(pack_path, errors)
        if not isinstance(raw_pack, dict):
            continue
        pack = raw_pack
        if canonical_content_hash(pack) != entry.get("content_hash"):
            errors.append(f"{pack_id}: direct registry content hash mismatch")
        if manifest["pack_content_hash"] != entry.get("content_hash"):
            errors.append(f"{pack_id}: manifest content hash mismatch")
        if pack.get("maturity") != entry.get("maturity"):
            errors.append(f"{pack_id}: registry maturity differs from pack")
        expected_maturity = (
            "validated_candidate"
            if pack_id in VALIDATED_CANDIDATE_PACK_IDS
            else "foundation"
        )
        if pack.get("maturity") != expected_maturity:
            errors.append(
                f"{pack_id}: expected maturity {expected_maturity}, "
                f"got {pack.get('maturity')!r}"
            )
        _validate_schema_subset(pack, pack_schema, pack_id, errors)
        packs[pack_id] = pack
        per_pack_counts[pack_id] = _validate_pack(
            pack,
            core=core,
            schema_types={str(item) for item in schema_types if item},
            capability_ids={str(item) for item in capability_ids if item},
            errors=errors,
        )
        compiled = compile_pack(frozen_pack, manifest=manifest)
        evaluation = pack.get("evaluation", {})
        role_fixture_path = CATALOG_ROOT / str(evaluation.get("role_fixture", ""))
        faq_fixture_path = CATALOG_ROOT / str(evaluation.get("faq_fixture", ""))
        role_fixture = _read_json(role_fixture_path, errors)
        faq_fixture = _read_json(faq_fixture_path, errors)
        if isinstance(role_fixture, dict):
            role_fixture_count += _validate_role_fixture(
                pack,
                compiled,
                role_fixture,
                errors,
            )
        if isinstance(faq_fixture, dict):
            faq_fixture_count += _validate_faq_fixture(pack, faq_fixture, errors)

    for capability in capability_items:
        capability_id = str(capability.get("capability_id"))
        compatible = set(capability.get("compatible_pack_ids", ()))
        _require_refs(
            compatible,
            set(packs),
            f"capability {capability_id}.compatible_pack_ids",
            errors,
        )
        expected = {
            pack_id
            for pack_id, pack in packs.items()
            if capability_id in pack.get("capability_ids", ())
        }
        if compatible != expected:
            errors.append(
                f"capability {capability_id}: compatibility differs from pack use; "
                f"expected {sorted(expected)!r}, got {sorted(compatible)!r}"
            )
        if capability.get("may_weaken_shared_controls") is not False:
            errors.append(f"capability {capability_id}: controls may not be weakened")

    taxonomy_ids: set[str] = set()
    for node in taxonomy_data.get("nodes", ()):
        taxonomy_id = node.get("taxonomy_id")
        if not isinstance(taxonomy_id, str) or not taxonomy_id:
            errors.append("taxonomy node has no taxonomy_id")
            continue
        if taxonomy_id in taxonomy_ids:
            errors.append(f"duplicate taxonomy_id {taxonomy_id}")
        taxonomy_ids.add(taxonomy_id)
        primary_pack_id = node.get("primary_pack_id")
        _require_refs(
            (primary_pack_id,),
            set(packs),
            f"taxonomy {taxonomy_id}.primary_pack_id",
            errors,
        )
        _require_refs(
            node.get("recommended_capability_ids", ()),
            {str(item) for item in capability_ids if item},
            f"taxonomy {taxonomy_id}.recommended_capability_ids",
            errors,
        )
        if primary_pack_id in packs:
            extra = set(node.get("recommended_capability_ids", ())) - set(
                packs[primary_pack_id].get("capability_ids", ())
            )
            if extra:
                errors.append(
                    f"taxonomy {taxonomy_id}: capabilities not in primary pack "
                    f"{extra!r}"
                )
    for pack_id in packs:
        if f"{pack_id}.general" not in taxonomy_ids:
            errors.append(f"taxonomy has no general node for {pack_id}")

    shared_paths = [
        CATALOG_ROOT / "core.json",
        CATALOG_ROOT / "registry.json",
        CATALOG_ROOT / "capabilities.json",
        CATALOG_ROOT / "taxonomy.json",
        CATALOG_ROOT / "schema-terms.json",
        *pack_paths,
    ]
    customer_markers = ("the asian school", "theasianschool.net")
    for path in shared_paths:
        text = path.read_text(encoding="utf-8").casefold()
        for marker in customer_markers:
            if marker in text:
                errors.append(f"customer fact marker {marker!r} leaked into {path}")

    special_fixture_count = _validate_special_fixtures(packs, errors)
    computed = _computed_counts(
        packs,
        taxonomy_data,
        capabilities_data,
        schema_terms,
        per_pack_counts,
    )
    if summary.get("catalog_version") != registry_data.get("catalog_version"):
        errors.append("catalog summary version differs from registry")
    if summary.get("counts") != computed:
        errors.append(
            "catalog-summary counts differ from computed counts: "
            f"expected {computed!r}, got {summary.get('counts')!r}"
        )

    sources = _read_json(CATALOG_ROOT / "sources.json", errors)
    if isinstance(sources, dict):
        source_items = sources.get("sources", ())
        source_ids = [item.get("source_id") for item in source_items]
        if len(source_ids) != len(set(source_ids)):
            errors.append("source IDs must be unique")
        for item in source_items:
            url = item.get("url")
            if not isinstance(url, str) or not url.startswith("https://"):
                errors.append(f"source URL must be HTTPS: {url!r}")

    if check_hygiene:
        _validate_hygiene(errors)
    if errors:
        numbered = "\n".join(
            f"{index + 1}. {message}" for index, message in enumerate(errors)
        )
        raise CatalogValidationError(
            f"industry catalog validation failed ({len(errors)} errors):\n{numbered}"
        )

    return ValidationReport(
        catalog_version=str(registry_data["catalog_version"]),
        pack_count=len(packs),
        validated_candidate_pack_count=len(VALIDATED_CANDIDATE_PACK_IDS),
        foundation_pack_count=len(FOUNDATION_PACK_IDS),
        role_fixture_case_count=role_fixture_count,
        faq_fixture_case_count=faq_fixture_count,
        special_fixture_count=special_fixture_count,
        counts=computed,
        hygiene_checked=check_hygiene,
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-hygiene",
        action="store_true",
        help="Skip repository duplicate and transient checks while developing.",
    )
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    try:
        report = validate_catalog(check_hygiene=not args.skip_hygiene)
    except CatalogValidationError as exc:
        print(str(exc))
        return 1
    print(json.dumps(asdict(report), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
