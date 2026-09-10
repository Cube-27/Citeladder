"""Code-owned topic/count/cohort slots and structural output resolution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config.http import PROMPT_TEXT_MAX_CHARS, PROMPT_TEXT_MIN_WORDS
from app.core.config.prompts import (
    PROMPT_COHORT_BRAND_DIAGNOSTIC,
    PROMPT_COHORT_COMPARISON,
    PROMPT_COHORT_CORE,
)
from app.core.config.visibility_prompts import (
    BUYER_STAGES,
    LOCAL_PROMPT_INTENTS,
    PROMPT_INTENT_COMPARE,
    PROMPT_INTENT_LEGACY,
)
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.prompts.portfolio import contains_tracked_name
from app.domain.prompts.style import words


@dataclass(frozen=True, slots=True)
class PromptSlot:
    slot_id: str
    topic_id: str | None
    topic_name: str
    topic_description: str
    cohort: str
    allowed_prompt_intents: tuple[str, ...]
    brand_name: str = ""
    competitor_names: tuple[str, ...] = ()

    def as_model_input(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "slot_id": self.slot_id,
            "topic": self.topic_name,
            "topic_description": self.topic_description,
            "cohort": self.cohort,
            "allowed_prompt_intents": list(self.allowed_prompt_intents),
        }
        if self.cohort != PROMPT_COHORT_CORE:
            payload["brand"] = self.brand_name
            payload["competitors"] = list(self.competitor_names)
        return payload


@dataclass(frozen=True, slots=True)
class PlannedPrompt:
    slot_id: str
    topic_id: str | None
    text: str
    intent: str
    buyer_stage: str
    prompt_intent: str
    cohort: str


def _topic_fields(topic: Any) -> tuple[str, str, str]:
    if isinstance(topic, dict):
        return (
            str(topic.get("id") or topic.get("topic_id") or ""),
            str(topic.get("name") or ""),
            str(topic.get("description") or ""),
        )
    return (
        str(getattr(topic, "id", None) or getattr(topic, "topic_id", "")),
        str(getattr(topic, "name", "")),
        str(getattr(topic, "description", "") or ""),
    )


def _allowed_intents(cohort: str, intents: tuple[str, ...]) -> tuple[str, ...]:
    """The labels a slot may carry: the cohort decides, then the caller filters.

    A named cohort's labels come from what it MEASURES, not from what the
    caller asked for -- a comparison run is comparison-shaped whatever intent
    filter accompanies it. Intersecting the two instead let a well-formed
    request (`cohort=comparison`, `intents=["purchase"]`) resolve to no labels
    at all, so every slot was rejected and the request 502'd before a single
    provider call. Only the core cohort spans enough labels for a filter to
    mean anything.
    """
    if cohort == PROMPT_COHORT_COMPARISON:
        return (PROMPT_INTENT_COMPARE,)
    if cohort != PROMPT_COHORT_CORE:
        return tuple(PROMPT_INTENT_LEGACY)
    return tuple(
        label
        for label, legacy in PROMPT_INTENT_LEGACY.items()
        if not intents
        or legacy in intents
        or ("local" in intents and label in LOCAL_PROMPT_INTENTS)
    )


def build_prompt_slots(
    *,
    topics: list[Any],
    count: int,
    cohort: str,
    intents: tuple[str, ...] = (),
    brand_name: str = "",
    competitor_names: tuple[str, ...] = (),
    unbound_brand_diagnostic: bool = False,
) -> list[PromptSlot]:
    """Cover topics round-robin; labels restrict choices without allocating them."""
    allowed = _allowed_intents(cohort, intents)
    if count <= 0 or not topics or not allowed:
        return []
    topic_rows = [_topic_fields(topic) for topic in topics]
    slots: list[PromptSlot] = []
    for index in range(count):
        topic_id, name, description = topic_rows[index % len(topic_rows)]
        slots.append(
            PromptSlot(
                slot_id=f"q{index + 1}",
                topic_id=(
                    None
                    if cohort == PROMPT_COHORT_BRAND_DIAGNOSTIC
                    and unbound_brand_diagnostic
                    else topic_id
                ),
                topic_name=name,
                topic_description=description,
                cohort=cohort,
                allowed_prompt_intents=allowed,
                brand_name=brand_name,
                competitor_names=competitor_names,
            )
        )
    return slots


def _identity_is_valid(text: str, slot: PromptSlot) -> bool:
    if slot.cohort == PROMPT_COHORT_CORE:
        # Alias/short-name expansion belongs to the shared portfolio validator.
        return True
    if not contains_tracked_name(text, [slot.brand_name]):
        return False
    return slot.cohort != PROMPT_COHORT_COMPARISON or contains_tracked_name(
        text, slot.competitor_names
    )


def resolve_planned_prompts(
    rows: list[tuple[str, str, str, str]], slots: list[PromptSlot]
) -> tuple[list[PlannedPrompt], int]:
    """Resolve exact slots and descriptive labels, never infer quality from words."""
    slots_by_id = {slot.slot_id: slot for slot in slots}
    accepted: list[PlannedPrompt] = []
    seen_slots: set[str] = set()
    seen_text: set[str] = set()
    dropped = 0
    for slot_id, raw_text, buyer_stage, prompt_intent in rows:
        slot = slots_by_id.get(slot_id)
        text = " ".join(raw_text.split())
        text_key = prompt_text_hash(text)
        if (
            slot is None
            or slot_id in seen_slots
            or text_key in seen_text
            or not text
            or len(text) > PROMPT_TEXT_MAX_CHARS
            or len(words(text)) < PROMPT_TEXT_MIN_WORDS
            or buyer_stage not in BUYER_STAGES
            or prompt_intent not in slot.allowed_prompt_intents
            or not _identity_is_valid(text, slot)
        ):
            dropped += 1
            continue
        seen_slots.add(slot_id)
        seen_text.add(text_key)
        accepted.append(
            PlannedPrompt(
                slot_id=slot_id,
                topic_id=slot.topic_id,
                text=text,
                intent=PROMPT_INTENT_LEGACY[prompt_intent],
                buyer_stage=buyer_stage,
                prompt_intent=prompt_intent,
                cohort=slot.cohort,
            )
        )
    return accepted, dropped
