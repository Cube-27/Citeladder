"""JEV gate policy: strong fail, uncertain and strong pass verdicts."""

from __future__ import annotations

import pytest

from app.core.config.jev import JEV_NOUL_QUESTIONS, jev_settings
from app.domain.prompts.quality_policy import apply_policy, gated_out


def _record(low: float | None = None, duplicate: float | None = None) -> dict:
    answers = {key: 0.9 for key in JEV_NOUL_QUESTIONS}
    if low is not None:
        answers["buyer_relevant"] = low
    record: dict = {"answers": answers, "duplicate_of": None}
    if duplicate is not None:
        record["duplicate_of"] = {
            "choice": "p1",
            "probabilities": {"p1": duplicate, "none": 1 - duplicate},
        }
    return record


@pytest.mark.parametrize(
    ("low", "duplicate", "verdict", "flags"),
    [
        (None, None, "pass", []),
        (0.34, None, "uncertain", ["buyer_relevant"]),
        (0.35, None, "pass", []),
        (0.14, None, "fail", ["buyer_relevant"]),
        (None, 0.6, "uncertain", ["duplicate_of"]),
        (None, 0.85, "fail", ["duplicate_of"]),
    ],
)
def test_thresholds_split_fail_uncertain_and_pass(
    low: float | None, duplicate: float | None, verdict: str, flags: list[str]
) -> None:
    decided = apply_policy(_record(low, duplicate))

    assert decided["verdict"] == verdict
    assert decided["flags"] == flags
    assert decided["thresholds"] == jev_settings.thresholds()


def test_only_a_gate_mode_fail_skips_review(monkeypatch: pytest.MonkeyPatch) -> None:
    failed = apply_policy(_record(low=0.05))
    assert gated_out(failed)
    assert not gated_out(apply_policy(_record(low=0.3)))
    assert not gated_out(None)

    monkeypatch.setattr(jev_settings, "mode", "shadow")
    assert not gated_out(apply_policy(_record(low=0.05)))
