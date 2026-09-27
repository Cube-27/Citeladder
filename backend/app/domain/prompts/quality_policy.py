"""Flags and gate verdicts for JEV prompt-quality decisions.

A decision's answers are probabilities for the bounded questions asked
(``quality_judge``); this module turns them into review flags and a verdict
under the configured, versioned thresholds:

- ``fail``: any yes/no answer below ``fail_below``, or a duplicate choice at
  or above ``duplicate_fail_at``. In gate mode the candidate never reaches
  review (it is kept only as an outcome record for calibration).
- ``uncertain``: anything flagged, or a decision missing an answer. Shown for
  review with its flags.
- ``pass``: every answer present and nothing flagged.

The probabilities are signals about the question asked, never a business
score. A stored decision is never re-judged; applying the policy returns a new
record for the candidate being staged.
"""

from __future__ import annotations

import math
from typing import Any

from app.core.config.jev import (
    JEV_DUPLICATE_NONE,
    JEV_FLAG_INCOMPLETE,
    JEV_MODE_GATE,
    JEV_NOUL_QUESTIONS,
    JEV_POLICY_VERSION,
    JEV_VERDICT_FAIL,
    JEV_VERDICT_PASS,
    JEV_VERDICT_UNCERTAIN,
    jev_settings,
)


def _number(value: object) -> float | None:
    """A finite probability in [0, 1]; anything else is unavailable (None)."""
    if isinstance(value, bool) or not isinstance(value, float | int):
        return None
    number = float(value)
    return number if math.isfinite(number) and 0.0 <= number <= 1.0 else None


def _duplicate(duplicate: object) -> tuple[float | None, bool]:
    """(probability of the chosen duplicate, answer unavailable).

    No duplicate question, or a ``none`` choice, is (None, False). A choice
    that is missing or lacks a valid probability is unavailable, never "none".
    """
    if not isinstance(duplicate, dict):
        return None, False
    choice = duplicate.get("choice")
    if choice == JEV_DUPLICATE_NONE:
        return None, False
    if not isinstance(choice, str):
        return None, True
    probability = _number((duplicate.get("probabilities") or {}).get(choice))
    return probability, probability is None


def _flags(
    answers: dict[str, Any], duplicate_p: float | None, duplicate_missing: bool
) -> list[str]:
    values = {key: _number(answers.get(key)) for key in JEV_NOUL_QUESTIONS}
    flags = [
        key
        for key, value in values.items()
        if value is not None and value < jev_settings.flag_below
    ]
    if duplicate_p is not None and duplicate_p >= jev_settings.duplicate_flag_at:
        flags.append("duplicate_of")
    if duplicate_missing or any(value is None for value in values.values()):
        flags.append(JEV_FLAG_INCOMPLETE)
    return flags


def _verdict(
    answers: dict[str, Any], duplicate_p: float | None, flags: list[str]
) -> str:
    values = [_number(answers.get(key)) for key in JEV_NOUL_QUESTIONS]
    if any(v is not None and v < jev_settings.fail_below for v in values) or (
        duplicate_p is not None and duplicate_p >= jev_settings.duplicate_fail_at
    ):
        return JEV_VERDICT_FAIL
    return JEV_VERDICT_UNCERTAIN if flags else JEV_VERDICT_PASS


def apply_policy(record: dict[str, Any]) -> dict[str, Any]:
    """``record`` with mode, policy version, thresholds, flags and verdict."""
    answers = record.get("answers") or {}
    duplicate_p, duplicate_missing = _duplicate(record.get("duplicate_of"))
    flags = _flags(answers, duplicate_p, duplicate_missing)
    return {
        **record,
        "mode": jev_settings.mode,
        "policy_version": JEV_POLICY_VERSION,
        "thresholds": jev_settings.thresholds(),
        "flags": flags,
        "verdict": _verdict(answers, duplicate_p, flags),
    }


def gated_out(decision: dict[str, Any] | None) -> bool:
    """True when a gate-mode decision failed: the candidate skips review."""
    return bool(
        decision
        and decision.get("mode") == JEV_MODE_GATE
        and decision.get("verdict") == JEV_VERDICT_FAIL
    )
