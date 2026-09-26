"""The missing-robots.txt advisory reports absence without claiming it blocks."""

from __future__ import annotations

import pytest

from app.analysis.site_health.rules import creates_issue, evaluate_rule, rule_for
from app.core.config.site_health_acquisition import (
    ROBOTS_FETCH_STATUS_FETCH_FAILED,
    ROBOTS_FETCH_STATUS_FETCHED,
    ROBOTS_FETCH_STATUS_NOT_FOUND,
)
from app.core.config.site_health_contracts import (
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_NOT_APPLICABLE,
    RULE_OUTCOME_SATISFIED,
    RULE_OUTCOME_UNKNOWN,
)


@pytest.mark.parametrize(
    "fetched,status,status_code,outcome",
    [
        (True, ROBOTS_FETCH_STATUS_FETCHED, 200, RULE_OUTCOME_SATISFIED),
        (False, ROBOTS_FETCH_STATUS_NOT_FOUND, 404, RULE_OUTCOME_MISSING),
        # Unreadable is not evidence of absence.
        (False, ROBOTS_FETCH_STATUS_FETCH_FAILED, 503, RULE_OUTCOME_UNKNOWN),
    ],
)
def test_robots_txt_advisory_distinguishes_missing_from_unreadable(
    fetched, status, status_code, outcome
) -> None:
    rule = rule_for("technical.robots_txt_present")
    assert rule is not None
    facts = {
        "site": {
            "robots": {
                "fetched": fetched,
                "status": status,
                "status_code": status_code,
                "url": "https://example.com/robots.txt",
            }
        }
    }

    evaluation = evaluate_rule(rule, facts)

    assert evaluation.outcome == outcome
    assert creates_issue(evaluation) is (outcome == RULE_OUTCOME_MISSING)


def test_robots_txt_advisory_is_not_evaluated_off_the_site_root() -> None:
    rule = rule_for("technical.robots_txt_present")
    assert rule is not None
    assert evaluate_rule(rule, {}).outcome == RULE_OUTCOME_NOT_APPLICABLE
