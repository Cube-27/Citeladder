"""The visibility expectation is a movement, not an absolute floor.

The previous contract asked whether ``visibility_score >= 1``, so a project
that already sat above 1.0 was reported as ``verified`` without anything having
changed. These cases pin the replacement: a frozen baseline, a required delta,
and an honest refusal when either is unavailable.
"""

from __future__ import annotations

import uuid

import pytest

from app.domain.opportunities.verification import (
    _evaluate_visibility_metric,
    _Evaluation,
    _observation_kind,
)
from app.domain.opportunities.visibility_checks import metric_value, prompt_mention_rate
from app.models.analysis import MetricSnapshot


def _snapshot(*, score: float = 0.0, metrics: dict | None = None) -> MetricSnapshot:
    return MetricSnapshot(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        audit_id=uuid.uuid4(),
        analyzer_version="a",
        scoring_rule_version="r",
        visibility_score=score,
        metrics=metrics,
    )


def _check(**overrides: object) -> dict:
    check = {
        "kind": "visibility_metric",
        "metric": "visibility_score",
        "direction": "increase",
        "min_delta": 1.0,
        "tolerance": 0,
        "baseline_value": 40.0,
        "target_prompt_id": None,
    }
    check.update(overrides)
    return check


def _evaluate(snapshot: MetricSnapshot, check: dict, prompt_index=None) -> _Evaluation:
    result = _Evaluation()
    _evaluate_visibility_metric(
        snapshot=snapshot, check=check, prompt_index=prompt_index, result=result
    )
    return result


def test_a_healthy_project_that_did_not_move_is_not_verified() -> None:
    """The regression: 40.0 clears the old floor of 1.0 but is no movement."""
    result = _evaluate(_snapshot(score=40.0), _check())

    assert result.observed == 1
    assert result.matched == 0
    assert result.contradicted is True
    assert _observation_kind(result, 1) == "contradicted"


def test_a_real_gain_against_the_frozen_baseline_verifies() -> None:
    result = _evaluate(_snapshot(score=41.5), _check())

    assert (result.matched, result.contradicted) == (1, False)
    assert _observation_kind(result, 1) == "verified"


def test_a_decline_is_contradicted_rather_than_ignored() -> None:
    result = _evaluate(_snapshot(score=12.0), _check())

    assert result.contradicted is True


@pytest.mark.parametrize(
    ("check", "expected_limitation"),
    [
        (
            _check(baseline_value=None),
            "visibility_metric: visibility_score has no frozen baseline",
        ),
        (
            _check(metric="prompt_mention_rate"),
            "visibility_metric: prompt_mention_rate unavailable",
        ),
    ],
)
def test_an_unobservable_expectation_verifies_nothing(
    check: dict, expected_limitation: str
) -> None:
    """No baseline, or no value, must not degrade into a free pass."""
    result = _evaluate(_snapshot(score=90.0), check)

    assert (result.observed, result.matched, result.contradicted) == (0, 0, False)
    assert result.limitations == [expected_limitation]
    assert _observation_kind(result, 1) is None


def test_a_prompt_keyed_expectation_reads_only_its_own_prompt() -> None:
    """A gain on another prompt must not verify this one."""
    metrics = {
        "per_prompt": [
            {"prompt_index": 0, "mention_stability": 0.10},
            {"prompt_index": 1, "mention_stability": 0.90},
        ]
    }
    check = _check(metric="prompt_mention_rate", baseline_value=10.0)

    flat = _evaluate(_snapshot(metrics=metrics), check, prompt_index=0)
    moved = _evaluate(_snapshot(metrics=metrics), check, prompt_index=1)

    assert flat.contradicted is True
    assert moved.matched == 1


def test_prompt_rate_is_scaled_onto_the_project_score_scale() -> None:
    """One delta serves both scopes only if both are 0-100."""
    metrics = {"per_prompt": [{"prompt_index": 3, "mention_stability": 0.25}]}

    assert prompt_mention_rate(metrics, 3) == 25.0
    assert prompt_mention_rate(metrics, 4) is None
    assert prompt_mention_rate(metrics, None) is None
    assert (
        metric_value(_snapshot(score=7.5), metric="visibility_score", prompt_index=None)
        == 7.5
    )
