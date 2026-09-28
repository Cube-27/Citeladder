"""JEV judgments for selected prompt candidates.

Each selected candidate gets one ``decide`` call asking bounded questions:
fits_business, buyer_relevant, natural, standalone and sensible (yes/no),
intent and stage (labels recorded next to the model's, which stay on the
row), and a per-topic duplicate choice among tracked prompts and earlier
candidates of the same topic. The core state carries the confirmed business
facts, topic, buyer need and question -- never the brand or competitor names.

``quality_policy`` turns each decision into flags and a verdict; in gate mode
a strong fail never reaches review, in shadow mode nothing is dropped. A JEV
failure never fails generation; it reports ``quality_gate="unavailable"`` and
the unjudged candidate stays reviewable. Calls happen after the read
transaction has committed and before the write transaction opens (commit
before network I/O).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.jev import JevClient, JevDecision
from app.core.config.jev import (
    JEV_DUPLICATE_INSTRUCTIONS,
    JEV_DUPLICATE_NONE,
    JEV_DUPLICATE_NONE_DESCRIPTION,
    JEV_INTENT_DESCRIPTIONS,
    JEV_INTENT_INSTRUCTIONS,
    JEV_NOUL_QUESTIONS,
    JEV_QUESTION_SCHEMA_VERSION,
    JEV_STAGE_DESCRIPTIONS,
    JEV_STAGE_INSTRUCTIONS,
    QUALITY_GATE_OFF,
    QUALITY_GATE_UNAVAILABLE,
    jev_settings,
)
from app.core.config.visibility_prompts import BUYER_STAGES, PROMPT_INTENT_VOCABULARY
from app.domain.prompts.generation_contract import SuggestedTopic
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.prompts.quality_policy import apply_policy
from app.models.prompt import PromptSet
from app.models.prompt_candidate import PromptCandidate

logger = logging.getLogger(__name__)

# Business-context facts JEV may see. Description/positioning are left out:
# they routinely name the brand, and the core state never does.
_BUSINESS_FIELDS = (
    "category",
    "category_terms",
    "jobs_to_be_done",
    "products_services",
    "target_audience",
    "buyer_roles",
    "service_areas",
    "primary_market",
)
_CELL_META = {"kind", "id", "review_state", "target_buyer_stage", "evidence_type"}


@dataclass(frozen=True)
class JudgeResult:
    # Decision JSON keyed by the candidate's normalized text hash.
    decisions: dict[str, dict[str, Any]]
    quality_gate: str


@dataclass(frozen=True)
class _Request:
    key: str  # normalized text hash
    state: dict[str, Any]
    questions: dict[str, dict[str, Any]]
    options: dict[str, str]  # duplicate option id -> prompt text
    state_hash: str


def _business_state(brand_context: dict[str, Any]) -> dict[str, Any]:
    context = brand_context.get("business_context") or {}
    business = {field: context.get(field) for field in _BUSINESS_FIELDS}
    return {key: value for key, value in business.items() if value}


def _choice(instructions: str, descriptions: dict[str, str], labels: tuple[str, ...]):
    return {
        "type": "choice",
        "instructions": instructions,
        "criteria": {label: descriptions.get(label) for label in labels},
    }


def _questions(options: dict[str, str]) -> dict[str, dict[str, Any]]:
    questions: dict[str, dict[str, Any]] = {
        key: {"type": "noul", **definition}
        for key, definition in JEV_NOUL_QUESTIONS.items()
    }
    questions["intent"] = _choice(
        JEV_INTENT_INSTRUCTIONS, JEV_INTENT_DESCRIPTIONS, PROMPT_INTENT_VOCABULARY
    )
    questions["stage"] = _choice(
        JEV_STAGE_INSTRUCTIONS, JEV_STAGE_DESCRIPTIONS, BUYER_STAGES
    )
    if options:
        questions["duplicate_of"] = {
            "type": "choice",
            "instructions": JEV_DUPLICATE_INSTRUCTIONS,
            "criteria": {JEV_DUPLICATE_NONE: JEV_DUPLICATE_NONE_DESCRIPTION, **options},
        }
    return questions


def _state_hash(state: dict[str, Any], questions: dict[str, Any], model: str) -> str:
    canonical = json.dumps(
        {
            "state": state,
            "questions": questions,
            "model": model,
            "question_schema_version": JEV_QUESTION_SCHEMA_VERSION,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _tracked_by_topic(prompt_set: PromptSet) -> dict[uuid.UUID | None, list[str]]:
    tracked: dict[uuid.UUID | None, list[str]] = {}
    for prompt in prompt_set.prompts:
        tracked.setdefault(prompt.topic_id, []).append(prompt.text)
    return tracked


def build_requests(
    *,
    suggestions: list[SuggestedTopic],
    prompt_set: PromptSet,
    brand_context: dict[str, Any],
    model: str,
) -> list[_Request]:
    """One request per selected candidate, in selection order."""
    business = _business_state(brand_context)
    limit = jev_settings.duplicate_options_max
    earlier = _tracked_by_topic(prompt_set)
    requests: list[_Request] = []
    for topic in suggestions:
        prior = earlier.setdefault(topic.topic_id, [])
        for prompt in topic.prompts:
            cell = prompt.evidence_refs[0] if prompt.evidence_refs else {}
            state = {
                "business": business,
                "topic": topic.name,
                "buyer_need": {
                    k: v for k, v in cell.items() if k not in _CELL_META and v
                },
                "candidate": {"question": prompt.text},
            }
            options = {f"p{i + 1}": text for i, text in enumerate(prior[-limit:])}
            questions = _questions(options)
            requests.append(
                _Request(
                    key=prompt_text_hash(prompt.text),
                    state=state,
                    questions=questions,
                    options=options,
                    state_hash=_state_hash(state, questions, model),
                )
            )
            prior.append(prompt.text)
    return requests


def _probability(value: object) -> float | None:
    """A finite probability in [0, 1], else None (unavailable).

    JSON parsing accepts NaN/Infinity, which PostgreSQL JSONB rejects, so a
    non-finite or out-of-range value must never reach the stored decision.
    """
    if isinstance(value, bool) or not isinstance(value, float | int):
        return None
    number = float(value)
    return number if math.isfinite(number) and 0.0 <= number <= 1.0 else None


def _choice_answer(answer: object) -> dict[str, Any] | None:
    """A choice answer with malformed parts replaced by unavailable values."""
    if not isinstance(answer, dict):
        return None
    choice = answer.get("choice")
    probabilities = answer.get("probabilities")
    return {
        "choice": choice if isinstance(choice, str) else None,
        "probabilities": (
            {
                str(option): number
                for option, value in probabilities.items()
                if (number := _probability(value)) is not None
            }
            if isinstance(probabilities, dict)
            else {}
        ),
        "confidence": _probability(answer.get("confidence")),
    }


def decision_record(request: _Request, decision: JevDecision) -> dict[str, Any]:
    """The persisted decision for one candidate, under the current policy."""
    nouls = {
        key: _probability((decision.answers.get(key) or {}).get("noul"))
        for key in JEV_NOUL_QUESTIONS
    }
    duplicate = _choice_answer(decision.answers.get("duplicate_of"))
    if duplicate is not None:
        # A choice that was not offered is an unavailable answer, never a
        # duplicate the gate may act on.
        if duplicate["choice"] not in (JEV_DUPLICATE_NONE, *request.options):
            duplicate["choice"] = None
        duplicate["text"] = request.options.get(str(duplicate["choice"]))
    judged = [value for value in nouls.values() if isinstance(value, float | int)]
    return apply_policy(
        {
            "model": decision.model,
            "question_schema_version": JEV_QUESTION_SCHEMA_VERSION,
            "state_hash": request.state_hash,
            "answers": nouls,
            "intent": _choice_answer(decision.answers.get("intent")),
            "stage": _choice_answer(decision.answers.get("stage")),
            "duplicate_of": duplicate,
            # Ranking signal about the questions asked, never a business score.
            "rank_score": round(sum(judged) / len(judged), 4) if judged else None,
            "usage": decision.usage,
        }
    )


async def _recorded_decisions(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    state_hashes: list[str],
) -> dict[str, dict[str, Any]]:
    """Decisions already paid for in this set, by state hash (a read)."""
    if not state_hashes:
        return {}
    rows = await session.execute(
        select(PromptCandidate.jev_decision).where(
            PromptCandidate.workspace_id == workspace_id,
            PromptCandidate.prompt_set_id == prompt_set_id,
            PromptCandidate.jev_decision["state_hash"].astext.in_(state_hashes),
        )
    )
    decisions: Sequence[dict[str, Any] | None] = rows.scalars().all()
    return {
        decision["state_hash"]: decision
        for decision in decisions
        if isinstance(decision, dict)
    }


async def _decide_all(
    judge: JevClient, requests: list[_Request]
) -> tuple[dict[str, dict[str, Any]], bool]:
    """Decide every request within one overall deadline.

    Returns the decisions obtained and whether any request went without one
    (provider failure, malformed answer, or the deadline cancelling it).
    """
    if not requests:
        return {}, False
    semaphore = asyncio.Semaphore(jev_settings.concurrency)

    async def _one(request: _Request) -> tuple[str, dict[str, Any] | None]:
        async with semaphore:
            try:
                decision = await judge.decide(request.state, request.questions)
            except ProviderError as exc:
                logger.warning(
                    "jev decision unavailable", extra={"error_code": exc.error_code}
                )
                return request.key, None
        try:
            return request.key, decision_record(request, decision)
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            # A malformed answer is an unavailable judgment, never a failure.
            logger.warning(
                "jev decision malformed", extra={"error_type": type(exc).__name__}
            )
            return request.key, None

    tasks = [asyncio.create_task(_one(request)) for request in requests]
    done, pending = await asyncio.wait(
        tasks, timeout=jev_settings.generation_deadline_seconds
    )
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
        logger.warning("jev deadline reached", extra={"pending": len(pending)})
    decisions = {
        key: record
        for key, record in (task.result() for task in done)
        if record is not None
    }
    return decisions, len(decisions) < len(requests)


async def judge_candidates(
    session: AsyncSession,
    *,
    judge: JevClient | None,
    workspace_id: uuid.UUID,
    prompt_set: PromptSet,
    suggestions: list[SuggestedTopic],
    brand_context: dict[str, Any],
) -> JudgeResult:
    """Judge the admitted pool; the caller has committed its read transaction."""
    if judge is None:
        return JudgeResult(decisions={}, quality_gate=QUALITY_GATE_OFF)
    requests = build_requests(
        suggestions=suggestions,
        prompt_set=prompt_set,
        brand_context=brand_context,
        model=judge.model,
    )
    recorded = await _recorded_decisions(
        session,
        workspace_id=workspace_id,
        prompt_set_id=prompt_set.id,
        state_hashes=[request.state_hash for request in requests],
    )
    # End the read before any network I/O.
    await session.commit()
    # A reused judgment is re-flagged under the current policy for this new
    # candidate; the stored decision it came from is left as recorded.
    decisions = {
        r.key: apply_policy(recorded[r.state_hash])
        for r in requests
        if r.state_hash in recorded
    }
    # Only calls count against the cap; reused judgments are free.
    uncached = [r for r in requests if r.state_hash not in recorded]
    calls = uncached[: jev_settings.max_calls_per_generation]
    fresh, failed = await _decide_all(judge, calls)
    decisions.update(fresh)
    return JudgeResult(
        decisions=decisions,
        quality_gate=(
            QUALITY_GATE_UNAVAILABLE
            if failed or len(calls) < len(uncached)
            else jev_settings.mode
        ),
    )
