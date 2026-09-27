"""JEV calibration: verdicts compared with user accept/reject outcomes."""

from __future__ import annotations

from app.core.config.jev import JEV_NOUL_QUESTIONS, JEV_QUESTION_SCHEMA_VERSION
from app.domain.prompts.quality_calibration import ReviewedDecision, calibration_report


def _row(
    disposition: str,
    *,
    natural: float = 0.9,
    category: str = "footwear",
    schema: str = JEV_QUESTION_SCHEMA_VERSION,
) -> ReviewedDecision:
    answers = {key: 0.9 for key in JEV_NOUL_QUESTIONS}
    answers["natural"] = natural
    return ReviewedDecision(
        decision={"answers": answers, "question_schema_version": schema},
        disposition=disposition,
        category=category,
    )


def test_report_compares_current_verdicts_with_review_outcomes() -> None:
    report = calibration_report(
        [
            _row("accepted"),
            _row("accepted", natural=0.1),  # would be failed: a false reject
            _row("rejected", natural=0.1, category="legal"),
            _row("rejected", category="legal"),  # passed: a false accept
            _row("gate_rejected", natural=0.05),  # no user outcome
            _row("accepted", schema="older-questions"),
        ]
    )

    assert report["accepted"] == 2
    assert report["rejected"] == 2
    assert report["gate_rejected"] == 1
    assert report["other_schema_decisions"] == 1
    assert report["false_reject_rate"] == 0.5
    assert report["false_accept_rate"] == 0.5
    assert report["verdict_by_outcome"] == {
        "fail/accepted": 1,
        "fail/rejected": 1,
        "pass/accepted": 1,
        "pass/rejected": 1,
    }
    natural = report["questions"]["natural"]
    assert natural["false_reject_rate"] == 0.5
    assert natural["fail_precision"] == 0.5
    assert report["questions"]["sensible"]["rejected_caught_by_fail"] == 0.0
    assert report["by_category"] == {
        "footwear": {"reviewed": 2, "agreement": 0.5},
        "legal": {"reviewed": 2, "agreement": 0.5},
    }
    sweep = {p["fail_below"]: p for p in report["fail_below_sweep"]}
    assert sweep[0.05]["false_reject_rate"] == 0.0
    assert sweep[0.15]["rejected_caught"] == 0.5


def test_no_reviewed_decisions_reports_unknown_rates_not_zero() -> None:
    report = calibration_report([])

    assert report["false_reject_rate"] is None
    assert report["questions"]["natural"]["fail_precision"] is None
