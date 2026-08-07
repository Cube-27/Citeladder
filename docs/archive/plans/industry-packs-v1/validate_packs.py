"""Validate CiteLadder industry-pack YAML files against schema and references.

Planning/implementation helper. The production loader should implement the same
checks with typed contracts under backend/app/core/config/industry_packs.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import jsonschema
import yaml


DEFAULT_SCHEMA = Path(__file__).with_name("industry-pack.schema.json")
DEFAULT_PACKS = (
    Path(__file__).with_name("education-v1.yaml"),
    Path(__file__).with_name("commerce-v1.yaml"),
)


def _ids(items: list[dict[str, Any]]) -> set[str]:
    values = [str(item["id"]) for item in items]
    if len(values) != len(set(values)):
        raise ValueError("duplicate IDs in one pack registry")
    return set(values)


def _require(values: list[str], registry: set[str], owner: str) -> None:
    missing = sorted(set(values) - registry)
    if missing:
        raise ValueError(f"{owner} references undefined IDs: {', '.join(missing)}")


def validate_pack(path: Path, schema: dict[str, Any]) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    jsonschema.validate(data, schema)

    roles = _ids(data["page_roles"])
    entities = _ids(data["entity_types"])
    relations = _ids(data["relation_types"])
    predicates = _ids(data["assertion_predicates"])
    questions = _ids(data["question_archetypes"])
    rules = _ids(data["analysis_rules"])
    reports = _ids(data["report_modules"])
    briefs = _ids(data["brief_templates"])
    prompts = _ids(data["prompt_archetypes"])
    fixtures = _ids(data["acceptance_fixtures"])

    stages = _ids(
        [stage for journey in data["journey_templates"] for stage in journey["stages"]]
    )
    outcomes = _ids(
        [outcome for journey in data["journey_templates"] for outcome in journey["outcomes"]]
    )

    # Keep variables live so duplicate checking applies to every registry even
    # before cross-registry references are added for all of them.
    _ = relations, predicates, rules, reports, briefs, prompts, fixtures

    for role in data["page_roles"]:
        _require(role.get("expected_entity_types", []), entities, role["id"])
        _require(role["journey_stages"], stages, role["id"])

    for relation in data["relation_types"]:
        _require(relation["source_types"], entities, relation["id"])
        _require(relation["target_types"], entities, relation["id"])

    for predicate in data["assertion_predicates"]:
        _require(predicate["subject_types"], entities, predicate["id"])

    for journey in data["journey_templates"]:
        _require(journey["audience_types"], entities, journey["id"])
        for stage in journey["stages"]:
            _require(stage["required_role_ids"], roles, stage["id"])
            _require(stage["required_question_ids"], questions, stage["id"])
            _require(stage["outcome_ids"], outcomes, stage["id"])

    for question in data["question_archetypes"]:
        _require(question["journey_stages"], stages, question["id"])
        _require(question["required_entity_types"], entities, question["id"])

    for expectation in data["schema_expectations"]:
        _require(expectation["role_ids"], roles, "schema_expectation")

    for brief in data["brief_templates"]:
        _require(brief["role_ids"], roles, brief["id"])

    for prompt in data["prompt_archetypes"]:
        _require(prompt["journey_stages"], stages, prompt["id"])

    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("packs", nargs="*", type=Path, default=list(DEFAULT_PACKS))
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    args = parser.parse_args()

    schema = json.loads(args.schema.read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator.check_schema(schema)

    for pack in args.packs:
        data = validate_pack(pack, schema)
        print(f"{pack}: {data['pack_id']}@{data['version']} valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
