"""Admission extras and diversified selection for overgenerated suggestions.

Generation plans ``count x overgenerate_factor`` cells. After the model writes
them and deterministic admission runs, this module drops texts that are
already tracked or pending review, drops exact copies of observed demand
queries (evidence grounds wording; it is never copied into a tracked prompt)
and then keeps at most ``count`` suggestions spread across topic, buyer stage,
audience and market. A shortfall is reported by the caller, never filled.
"""

from __future__ import annotations

import uuid
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass

from app.domain.prompts.generation_contract import SuggestedPrompt, SuggestedTopic
from app.domain.prompts.normalization import prompt_text_hash


@dataclass(frozen=True, slots=True)
class _Row:
    order: int
    topic: SuggestedTopic
    prompt: SuggestedPrompt

    def features(self) -> tuple[tuple[str, str], ...]:
        ref = self.prompt.evidence_refs[0] if self.prompt.evidence_refs else {}
        features = (
            ("topic", str(self.topic.topic_id)),
            ("buyer_stage", self.prompt.buyer_stage),
            ("audience", str(ref.get("audience") or "")),
            ("market", str(ref.get("market") or "")),
        )
        # An absent facet is not a value to spread across.
        return tuple(feature for feature in features if feature[1])

    def suggested(self) -> bool:
        """Any grounding that is not explicitly confirmed ranks after confirmed."""
        return any(
            ref.get("review_state") != "confirmed" for ref in self.prompt.evidence_refs
        )


def _rows(suggestions: list[SuggestedTopic]) -> list[_Row]:
    rows: list[_Row] = []
    for topic in suggestions:
        for prompt in topic.prompts:
            rows.append(_Row(order=len(rows), topic=topic, prompt=prompt))
    return rows


def _regroup(rows: Iterable[_Row]) -> list[SuggestedTopic]:
    grouped: dict[uuid.UUID, tuple[SuggestedTopic, list[SuggestedPrompt]]] = {}
    for row in rows:
        grouped.setdefault(row.topic.topic_id, (row.topic, []))[1].append(row.prompt)
    return [
        SuggestedTopic(topic_id=topic.topic_id, name=topic.name, prompts=prompts)
        for topic, prompts in grouped.values()
    ]


def drop_texts(
    suggestions: list[SuggestedTopic], hashes: set[str]
) -> tuple[list[SuggestedTopic], int]:
    """Remove suggestions whose normalized text hash is in ``hashes``."""
    rows = _rows(suggestions)
    kept = [row for row in rows if prompt_text_hash(row.prompt.text) not in hashes]
    return _regroup(kept), len(rows) - len(kept)


def observed_query_hashes(demand_signals: Iterable[dict[str, object]]) -> set[str]:
    """Hashes of observed demand queries, which must never be copied verbatim."""
    return {
        prompt_text_hash(str(query))
        for signal in demand_signals
        if (query := signal.get("observed_query"))
    }


def count_prompts(suggestions: list[SuggestedTopic]) -> int:
    return sum(len(topic.prompts) for topic in suggestions)


def select_diversified(
    suggestions: list[SuggestedTopic], count: int
) -> list[SuggestedTopic]:
    """Keep at most ``count``, least-used features first.

    Confirmed-map rows are preferred to rows grounded in unreviewed
    suggestions; ties keep model (cell) order, so the result is deterministic.
    """
    remaining = _rows(suggestions)
    usage: Counter[tuple[str, str]] = Counter()
    chosen: list[_Row] = []
    while remaining and len(chosen) < count:
        best = min(
            remaining,
            key=lambda row: (
                row.suggested(),
                sum(usage[feature] for feature in row.features()),
                row.order,
            ),
        )
        remaining.remove(best)
        chosen.append(best)
        usage.update(best.features())
    chosen.sort(key=lambda row: row.order)
    return _regroup(chosen)
