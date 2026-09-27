"""Calibrate the JEV gate against user accept/reject outcomes.

Every judged candidate a user reviewed leaves an outcome: ``accepted`` (a
tracked prompt) or ``rejected`` (a text-free outcome record). This report
re-judges each stored decision's answers under the CURRENT thresholds (or a
swept threshold) and compares the verdict with what the user did:

- per question: how often an accepted candidate would have been flagged or
  failed on it (false flags, false rejects) and how often a rejected one was
  caught;
- overall: the verdict x outcome matrix, false-reject and false-accept
  rates, and a sweep of the fail threshold;
- by business category: agreement between "pass" and "accepted".

``gate_rejected`` candidates never reached a user, so they carry no outcome
and are only counted. Only decisions asked under the current question schema
are compared. The report is aggregate: it never reads or prints prompt text.
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.jev import (
    JEV_NOUL_QUESTIONS,
    JEV_QUESTION_SCHEMA_VERSION,
    JEV_VERDICT_FAIL,
    JEV_VERDICT_PASS,
    jev_settings,
)
from app.core.config.prompts import (
    CANDIDATE_DISPOSITION_ACCEPTED,
    CANDIDATE_DISPOSITION_GATE_REJECTED,
    CANDIDATE_DISPOSITION_REJECTED,
    CANDIDATE_OUTCOME_DISPOSITIONS,
)
from app.domain.prompts.quality_policy import apply_policy
from app.models.brand import BrandProfile
from app.models.prompt_candidate import PromptCandidate, PromptGenerationRun

SWEEP_FAIL_BELOW = (0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5)
_UNKNOWN_CATEGORY = "(no category)"


@dataclass(frozen=True)
class ReviewedDecision:
    decision: dict[str, Any]
    disposition: str
    category: str
    # Source candidate, for tracing a figure back to its exact row.
    candidate_id: uuid.UUID | None = None


async def load_reviewed_decisions(
    session: AsyncSession, *, since: datetime | None = None
) -> list[ReviewedDecision]:
    """Judged candidates with a review outcome, across all workspaces.

    Operator calibration only: selects decisions, dispositions and the
    project's business category -- never prompt text -- and the report built
    from them is aggregate.
    """
    statement = (
        select(
            PromptCandidate.id,
            PromptCandidate.jev_decision,
            PromptCandidate.disposition,
            BrandProfile.business_context["category"].astext,
        )
        .join(PromptGenerationRun, PromptGenerationRun.id == PromptCandidate.run_id)
        .outerjoin(
            BrandProfile,
            (BrandProfile.project_id == PromptGenerationRun.project_id)
            & (BrandProfile.workspace_id == PromptGenerationRun.workspace_id),
        )
        .where(
            PromptCandidate.jev_decision.is_not(None),
            PromptCandidate.disposition.in_(
                {CANDIDATE_DISPOSITION_ACCEPTED, *CANDIDATE_OUTCOME_DISPOSITIONS}
            ),
        )
    )
    if since is not None:
        cutoff = since if since.tzinfo else since.replace(tzinfo=UTC)
        statement = statement.where(PromptCandidate.created_at >= cutoff)
    rows = (await session.execute(statement)).all()
    return [
        ReviewedDecision(
            decision=decision,
            disposition=disposition,
            category=category or "",
            candidate_id=candidate_id,
        )
        for candidate_id, decision, disposition, category in rows
        if isinstance(decision, dict)
    ]


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _answer(decision: dict[str, Any], question: str) -> float | None:
    value = (decision.get("answers") or {}).get(question)
    return float(value) if isinstance(value, float | int) else None


def _question_report(rows: list[ReviewedDecision], question: str) -> dict[str, Any]:
    accepted = [
        a
        for r in rows
        if r.disposition == CANDIDATE_DISPOSITION_ACCEPTED
        and (a := _answer(r.decision, question)) is not None
    ]
    rejected = [
        a
        for r in rows
        if r.disposition == CANDIDATE_DISPOSITION_REJECTED
        and (a := _answer(r.decision, question)) is not None
    ]
    flag, fail = jev_settings.flag_below, jev_settings.fail_below
    flagged_rejected = sum(a < flag for a in rejected)
    failed_rejected = sum(a < fail for a in rejected)
    failed_total = failed_rejected + sum(a < fail for a in accepted)
    return {
        "answered_accepted": len(accepted),
        "answered_rejected": len(rejected),
        "false_flag_rate": _rate(sum(a < flag for a in accepted), len(accepted)),
        "false_reject_rate": _rate(sum(a < fail for a in accepted), len(accepted)),
        "rejected_caught_by_flag": _rate(flagged_rejected, len(rejected)),
        "rejected_caught_by_fail": _rate(failed_rejected, len(rejected)),
        "fail_precision": _rate(failed_rejected, failed_total),
    }


def _verdict(decision: dict[str, Any]) -> str:
    return str(apply_policy(decision)["verdict"])


def _sweep(rows: list[ReviewedDecision]) -> list[dict[str, Any]]:
    """False-reject and catch rates if the fail threshold were ``t``."""
    points = []
    for threshold in SWEEP_FAIL_BELOW:

        def fails(row: ReviewedDecision, t: float = threshold) -> bool:
            answers = [_answer(row.decision, q) for q in JEV_NOUL_QUESTIONS]
            return any(a is not None and a < t for a in answers)

        accepted = [r for r in rows if r.disposition == CANDIDATE_DISPOSITION_ACCEPTED]
        rejected = [r for r in rows if r.disposition == CANDIDATE_DISPOSITION_REJECTED]
        points.append(
            {
                "fail_below": threshold,
                "false_reject_rate": _rate(sum(map(fails, accepted)), len(accepted)),
                "rejected_caught": _rate(sum(map(fails, rejected)), len(rejected)),
            }
        )
    return points


def _by_category(rows: list[ReviewedDecision]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[ReviewedDecision]] = defaultdict(list)
    for row in rows:
        grouped[row.category or _UNKNOWN_CATEGORY].append(row)
    report = {}
    for category, members in sorted(grouped.items()):
        agree = sum(
            (_verdict(r.decision) == JEV_VERDICT_PASS)
            == (r.disposition == CANDIDATE_DISPOSITION_ACCEPTED)
            for r in members
        )
        report[category] = {
            "reviewed": len(members),
            "agreement": _rate(agree, len(members)),
        }
    return report


def _with(rows: list[ReviewedDecision], disposition: str) -> list[ReviewedDecision]:
    return [row for row in rows if row.disposition == disposition]


def calibration_report(decisions: list[ReviewedDecision]) -> dict[str, Any]:
    """Aggregate comparison of JEV verdicts with user review outcomes."""
    current = [
        d
        for d in decisions
        if d.decision.get("question_schema_version") == JEV_QUESTION_SCHEMA_VERSION
    ]
    accepted = _with(current, CANDIDATE_DISPOSITION_ACCEPTED)
    rejected = _with(current, CANDIDATE_DISPOSITION_REJECTED)
    reviewed = accepted + rejected
    matrix = Counter(f"{_verdict(r.decision)}/{r.disposition}" for r in reviewed)
    return {
        "question_schema_version": JEV_QUESTION_SCHEMA_VERSION,
        "thresholds": jev_settings.thresholds(),
        "other_schema_decisions": len(decisions) - len(current),
        # The policy each decision was recorded under; the figures below
        # re-judge every decision under ``thresholds`` to evaluate them.
        "recorded_policy_versions": dict(
            Counter(str(d.decision.get("policy_version")) for d in current)
        ),
        "gate_rejected": len(_with(current, CANDIDATE_DISPOSITION_GATE_REJECTED)),
        "accepted": len(accepted),
        "rejected": len(rejected),
        "verdict_by_outcome": dict(sorted(matrix.items())),
        "false_reject_rate": _rate(
            sum(_verdict(r.decision) == JEV_VERDICT_FAIL for r in accepted),
            len(accepted),
        ),
        "false_accept_rate": _rate(
            sum(_verdict(r.decision) == JEV_VERDICT_PASS for r in rejected),
            len(rejected),
        ),
        "questions": {q: _question_report(reviewed, q) for q in JEV_NOUL_QUESTIONS},
        "fail_below_sweep": _sweep(reviewed),
        "by_category": _by_category(reviewed),
    }
