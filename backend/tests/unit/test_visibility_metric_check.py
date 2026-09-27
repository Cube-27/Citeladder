"""The visibility expectation is a movement, not an absolute floor.

The previous contract asked whether ``visibility_score >= 1``, so a project
that already sat above 1.0 was reported as ``verified`` without anything having
changed. These cases pin the replacement: a frozen baseline, a required delta,
and an honest refusal when either is unavailable.
"""

from __future__ import annotations

import uuid

from app.domain.opportunities.visibility_checks import (
    metric_value,
    prompt_composite_score,
)
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


def test_both_scopes_read_the_same_quantity_at_two_levels() -> None:
    """``visibility_score`` is the mean of these, so no rescaling is needed."""
    metrics = {"per_prompt": [{"prompt_index": 3, "composite_score": 62.5}]}

    assert prompt_composite_score(metrics, 3) == 62.5
    assert prompt_composite_score(metrics, 4) is None
    assert metric_value(_snapshot(metrics=metrics), prompt_index=3) == 62.5
    assert metric_value(_snapshot(score=7.5), prompt_index=None) == 7.5


def test_repetition_agreement_is_never_mistaken_for_a_mention_rate() -> None:
    """``mention_stability`` reads 1.0 for "always" AND "never".

    Measuring a movement against it would score a genuine win as a
    contradiction, so the check must not read that field.
    """
    metrics = {"per_prompt": [{"prompt_index": 0, "mention_stability": 1.0}]}

    assert prompt_composite_score(metrics, 0) is None
