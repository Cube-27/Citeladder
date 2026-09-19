"""Pure deterministic comparison of two explicitly comparable crawl inputs."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.core.config.site_change_intel import (
    CHANGE_CLASS_CRITICAL,
    CHANGE_CLASS_IMPROVEMENT,
    CHANGE_CLASS_NEUTRAL,
    CHANGE_CLASS_REGRESSION,
    CHANGE_FIELDS,
    CONTENT_CHANGE_FIELD,
    CONTENT_COSMETIC_DELTA_CEILING,
    CONTENT_SUBSTANTIAL_DELTA_RATIO,
    CONTENT_SUBSTANTIAL_SECTION_CHANGES,
)
from app.core.config.site_health_contracts import (
    RULE_FAILING_OUTCOMES,
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_SATISFIED,
)


@dataclass(frozen=True)
class RuleState:
    outcome: str
    severity: str
    evaluation_id: uuid.UUID


@dataclass(frozen=True)
class ChangePage:
    site_url_id: uuid.UUID
    normalized_url: str
    analysis_id: uuid.UUID
    artifact_id: uuid.UUID
    fields: dict[str, Any]
    rules: dict[str, RuleState]
    intended_indexable: bool | None = None


@dataclass(frozen=True)
class ExpectedChange:
    implementation_event_id: uuid.UUID
    expected_value: Any


@dataclass(frozen=True)
class ChangeObservation:
    site_url_id: uuid.UUID
    normalized_url: str
    field: str
    change_class: str
    before_value: Any
    after_value: Any
    source_analysis_a_id: uuid.UUID | None
    source_analysis_b_id: uuid.UUID | None
    source_artifact_a_id: uuid.UUID | None
    source_artifact_b_id: uuid.UUID | None
    source_evaluation_a_id: uuid.UUID | None
    source_evaluation_b_id: uuid.UUID | None
    expected: bool
    implementation_event_id: uuid.UUID | None


def _rule_class(before: RuleState | None, after: RuleState | None) -> str | None:
    if before is None or after is None or before.outcome == after.outcome:
        return None
    if (
        before.outcome in RULE_FAILING_OUTCOMES
        and after.outcome == RULE_OUTCOME_SATISFIED
    ):
        return CHANGE_CLASS_IMPROVEMENT
    if (
        before.outcome == RULE_OUTCOME_SATISFIED
        and after.outcome in RULE_FAILING_OUTCOMES
    ):
        return (
            CHANGE_CLASS_CRITICAL
            if after.severity == "critical"
            else CHANGE_CLASS_REGRESSION
        )
    return None


def _http_class(before: Any, after: Any) -> str:
    before_ok = isinstance(before, int) and 200 <= before < 300
    after_ok = isinstance(after, int) and 200 <= after < 300
    after_error = isinstance(after, int) and 400 <= after < 600
    before_error = isinstance(before, int) and 400 <= before < 600
    if before_ok and after_error:
        return CHANGE_CLASS_CRITICAL
    if before_error and after_ok:
        return CHANGE_CLASS_IMPROVEMENT
    return CHANGE_CLASS_NEUTRAL


def _change_class(field: str, before: ChangePage, after: ChangePage) -> str:
    rule_class = _rule_class(before.rules.get(field), after.rules.get(field))
    if rule_class:
        return rule_class
    if field == "http_status":
        return _http_class(before.fields.get(field), after.fields.get(field))
    if (
        field == "robots_noindex"
        and before.intended_indexable is True
        and before.fields.get(field) is False
        and after.fields.get(field) is True
    ):
        return CHANGE_CLASS_CRITICAL
    return CHANGE_CLASS_NEUTRAL


def _expected_link(
    expected: dict[tuple[uuid.UUID, str], ExpectedChange],
    *,
    site_url_id: uuid.UUID,
    field: str,
    after_value: Any,
    after_rule: RuleState | None,
) -> tuple[bool, uuid.UUID | None]:
    item = expected.get((site_url_id, field))
    if item is None:
        return False, None
    expected_value = item.expected_value
    if expected_value == "pass":
        expected_value = RULE_OUTCOME_SATISFIED
    elif expected_value == "fail":
        expected_value = RULE_OUTCOME_MISSING
    matches_value = expected_value == after_value
    matches_rule = after_rule is not None and expected_value == after_rule.outcome
    if not matches_value and not matches_rule:
        return False, None
    return True, item.implementation_event_id


def _parsed_date(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _content_delta(
    before: dict[str, Any], after: dict[str, Any]
) -> tuple[float, int, int]:
    before_shingles = set(before.get("shingles") or [])
    after_shingles = set(after.get("shingles") or [])
    union = before_shingles | after_shingles
    delta = 1.0 - (len(before_shingles & after_shingles) / len(union)) if union else 0.0
    before_sections = {
        json.dumps(item, sort_keys=True, default=str)
        for item in before.get("heading_outline") or []
    }
    after_sections = {
        json.dumps(item, sort_keys=True, default=str)
        for item in after.get("heading_outline") or []
    }
    return (
        delta,
        len(after_sections - before_sections),
        len(before_sections - after_sections),
    )


def _content_coverage(
    before: dict[str, Any], after: dict[str, Any]
) -> tuple[str, str | None]:
    if before.get("extractor_version") != after.get("extractor_version"):
        return "unknown", "extractor_incompatible"
    if "partial" in {before.get("coverage"), after.get("coverage")}:
        return "partial", "truncation_established"
    if before.get("coverage") == after.get("coverage") == "complete":
        return "complete", None
    return "unknown", "completeness_unproven"


def _content_classification(
    *, delta: float, sections_added: int, sections_removed: int, coverage: str
) -> str:
    if coverage != "complete":
        return "insufficient_evidence"
    if (
        delta >= CONTENT_SUBSTANTIAL_DELTA_RATIO
        or sections_added + sections_removed >= CONTENT_SUBSTANTIAL_SECTION_CHANGES
    ):
        return "substantial_change"
    if delta > CONTENT_COSMETIC_DELTA_CEILING or sections_added or sections_removed:
        return "minor_change"
    return "unchanged"


def _metadata_consistency(
    before_modified: Any, after_modified: Any, *, coverage: str, classification: str
) -> str:
    before_date = _parsed_date(before_modified)
    after_date = _parsed_date(after_modified)
    if coverage != "complete" or before_date is None or after_date is None:
        return "unknown"
    date_moved = before_date != after_date
    content_moved = classification in {"substantial_change", "minor_change"}
    return "consistent" if date_moved == content_moved else "inconsistent"


def _content_result(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    delta, sections_added, sections_removed = _content_delta(before, after)
    coverage, reason = _content_coverage(before, after)
    classification = _content_classification(
        delta=delta,
        sections_added=sections_added,
        sections_removed=sections_removed,
        coverage=coverage,
    )
    before_modified = before.get("modified")
    after_modified = after.get("modified")
    return {
        "content_change_classification": classification,
        "metadata_consistency": _metadata_consistency(
            before_modified,
            after_modified,
            coverage=coverage,
            classification=classification,
        ),
        "content_delta_ratio": round(delta, 6),
        "content_delta_measure": "measured_text_divergence_over_compared_portion",
        "sections_added": sections_added,
        "sections_removed": sections_removed,
        "comparison_coverage": coverage,
        "coverage_reason": reason,
        "modified_before": before_modified,
        "modified_after": after_modified,
    }


def _field_observation(
    before: ChangePage,
    after: ChangePage,
    field: str,
    expected: dict[tuple[uuid.UUID, str], ExpectedChange],
) -> ChangeObservation | None:
    before_value = before.fields.get(field)
    after_value = after.fields.get(field)
    before_rule = before.rules.get(field)
    after_rule = after.rules.get(field)
    rule_changed = bool(
        before_rule
        and after_rule
        and (
            before_rule.outcome != after_rule.outcome
            or before_rule.severity != after_rule.severity
        )
    )
    if before_value == after_value and not rule_changed:
        return None
    is_expected, event_id = _expected_link(
        expected,
        site_url_id=after.site_url_id,
        field=field,
        after_value=after_value,
        after_rule=after_rule,
    )
    return ChangeObservation(
        site_url_id=after.site_url_id,
        normalized_url=after.normalized_url,
        field=field,
        change_class=_change_class(field, before, after),
        before_value=before_value,
        after_value=after_value,
        source_analysis_a_id=before.analysis_id,
        source_analysis_b_id=after.analysis_id,
        source_artifact_a_id=before.artifact_id,
        source_artifact_b_id=after.artifact_id,
        source_evaluation_a_id=before_rule.evaluation_id if before_rule else None,
        source_evaluation_b_id=after_rule.evaluation_id if after_rule else None,
        expected=is_expected,
        implementation_event_id=event_id,
    )


def _content_observation(
    before: ChangePage, after: ChangePage
) -> ChangeObservation | None:
    before_content = before.fields.get(CONTENT_CHANGE_FIELD)
    after_content = after.fields.get(CONTENT_CHANGE_FIELD)
    if not isinstance(before_content, dict) or not isinstance(after_content, dict):
        return None
    result = _content_result(before_content, after_content)
    if (
        before_content == after_content
        and result["coverage_reason"] != "extractor_incompatible"
    ):
        return None
    return ChangeObservation(
        site_url_id=after.site_url_id,
        normalized_url=after.normalized_url,
        field=CONTENT_CHANGE_FIELD,
        change_class=CHANGE_CLASS_NEUTRAL,
        before_value=before_content,
        after_value={**after_content, **result},
        source_analysis_a_id=before.analysis_id,
        source_analysis_b_id=after.analysis_id,
        source_artifact_a_id=before.artifact_id,
        source_artifact_b_id=after.artifact_id,
        source_evaluation_a_id=None,
        source_evaluation_b_id=None,
        expected=False,
        implementation_event_id=None,
    )


def _paired_observations(
    before: ChangePage,
    after: ChangePage,
    expected: dict[tuple[uuid.UUID, str], ExpectedChange],
) -> list[ChangeObservation]:
    observations: list[ChangeObservation] = []
    for field in CHANGE_FIELDS:
        observation = _field_observation(before, after, field, expected)
        if observation is not None:
            observations.append(observation)
    content = _content_observation(before, after)
    if content is not None:
        observations.append(content)
    return observations


def compare_crawls(
    crawl_a: list[ChangePage],
    crawl_b: list[ChangePage],
    *,
    complete_pair: bool,
    expected: dict[tuple[uuid.UUID, str], ExpectedChange] | None = None,
) -> tuple[ChangeObservation, ...]:
    """Compare selected evidence without partial-pair URL presence claims."""
    expected = expected or {}
    pages_a = {page.site_url_id: page for page in crawl_a}
    pages_b = {page.site_url_id: page for page in crawl_b}
    observations: list[ChangeObservation] = []
    for site_url_id in sorted(pages_a.keys() & pages_b.keys(), key=str):
        observations.extend(
            _paired_observations(pages_a[site_url_id], pages_b[site_url_id], expected)
        )
    if complete_pair:
        for site_url_id in sorted(pages_b.keys() - pages_a.keys(), key=str):
            page = pages_b[site_url_id]
            observations.append(
                ChangeObservation(
                    site_url_id=site_url_id,
                    normalized_url=page.normalized_url,
                    field="url_presence",
                    change_class=CHANGE_CLASS_IMPROVEMENT,
                    before_value=False,
                    after_value=True,
                    source_analysis_a_id=None,
                    source_analysis_b_id=page.analysis_id,
                    source_artifact_a_id=None,
                    source_artifact_b_id=page.artifact_id,
                    source_evaluation_a_id=None,
                    source_evaluation_b_id=None,
                    expected=False,
                    implementation_event_id=None,
                )
            )
        for site_url_id in sorted(pages_a.keys() - pages_b.keys(), key=str):
            page = pages_a[site_url_id]
            observations.append(
                ChangeObservation(
                    site_url_id=site_url_id,
                    normalized_url=page.normalized_url,
                    field="url_presence",
                    change_class=CHANGE_CLASS_REGRESSION,
                    before_value=True,
                    after_value=False,
                    source_analysis_a_id=page.analysis_id,
                    source_analysis_b_id=None,
                    source_artifact_a_id=page.artifact_id,
                    source_artifact_b_id=None,
                    source_evaluation_a_id=None,
                    source_evaluation_b_id=None,
                    expected=False,
                    implementation_event_id=None,
                )
            )
    return tuple(observations)


__all__ = [
    "ChangeObservation",
    "ChangePage",
    "ExpectedChange",
    "RuleState",
    "compare_crawls",
]
