"""Strict topic-ID prompt generation contract."""

from __future__ import annotations

import json
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.connectors.web_evidence.brand_evidence import evidence_block_lines
from app.core.config.prompts import prompt_generation_settings
from app.core.config.visibility_prompts import BUYER_STAGES, PROMPT_INTENT_VOCABULARY
from app.domain.projects.knowledge_base import serialize_brand_knowledge_context
from app.domain.prompts.query_patterns import (
    PlannedPrompt,
    PromptSlot,
    resolve_planned_prompts,
)


class GenerationOutputError(RuntimeError):
    """The generation provider returned no usable suggestions."""


class SuggestedPrompt(BaseModel):
    text: str = Field(min_length=1)
    intent: str = ""
    buyer_stage: str = ""
    prompt_intent: str = ""
    slot_id: str = ""


class SuggestedTopic(BaseModel):
    topic_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    prompts: list[SuggestedPrompt] = Field(default_factory=list)


class GeneratedPrompt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Bounds a model can violate belong to the ROW, not to the schema. Pydantic
    # rejects the whole response on the first over-long `text`, so one runaway
    # row took its valid siblings down with it and surfaced as a 502 for the
    # entire batch -- the opposite of the per-row dropping the rest of this
    # module exists to do (see `resolve_planned_prompts`, which already applies
    # both limits and counts the drop). Only presence is structural here.
    slot_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    buyer_stage: str = Field(json_schema_extra={"enum": list(BUYER_STAGES)})
    prompt_intent: str = Field(
        json_schema_extra={"enum": list(PROMPT_INTENT_VOCABULARY)}
    )


class GenerationOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompts: list[GeneratedPrompt] = Field(default_factory=list)


def generation_model_call_budget(count: int) -> int:
    """Return the maximum provider calls one bounded generation may make."""
    batch_size = min(prompt_generation_settings.model_batch_size, count)
    return (count + batch_size - 1) // batch_size + 1


def parse_generation_output(
    raw: str,
    *,
    slots: list[PromptSlot],
) -> tuple[list[SuggestedTopic], int]:
    topics = {
        str(slot.topic_id): slot.topic_name
        for slot in slots
        if slot.topic_id is not None
    }
    try:
        payload = json.loads(raw)
        output = GenerationOutput.model_validate(payload)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise GenerationOutputError(f"Unparseable agent output: {exc}") from exc

    grouped: dict[str, list[SuggestedPrompt]] = {}
    planned, dropped = resolve_planned_prompts(
        [
            (prompt.slot_id, prompt.text, prompt.buyer_stage, prompt.prompt_intent)
            for prompt in output.prompts
        ],
        slots,
    )
    for prompt in planned:
        topic_id = str(prompt.topic_id)
        if topic_id not in topics:
            dropped += 1
            continue
        grouped.setdefault(topic_id, []).append(
            SuggestedPrompt(
                text=prompt.text,
                intent=prompt.intent,
                buyer_stage=prompt.buyer_stage,
                prompt_intent=prompt.prompt_intent,
                slot_id=prompt.slot_id,
            )
        )
    suggestions = [
        SuggestedTopic(
            topic_id=uuid.UUID(topic_id), name=topics[topic_id], prompts=prompts
        )
        for topic_id, prompts in grouped.items()
    ]
    if not suggestions:
        raise GenerationOutputError("Agent output contained no usable prompts")
    return suggestions, dropped


def parse_planned_output(
    raw: str, *, slots: list[PromptSlot]
) -> tuple[list[PlannedPrompt], int]:
    """Parse the shared slot contract for onboarding's portfolio validator."""
    try:
        output = GenerationOutput.model_validate_json(raw)
    except ValidationError as exc:
        raise GenerationOutputError(f"Unparseable agent output: {exc}") from exc
    planned, dropped = resolve_planned_prompts(
        [
            (prompt.slot_id, prompt.text, prompt.buyer_stage, prompt.prompt_intent)
            for prompt in output.prompts
        ],
        slots,
    )
    if not planned:
        raise GenerationOutputError("Agent output contained no usable prompts")
    return planned, dropped


def _append_json_context(lines: list[str], label: str, payload: object) -> None:
    if payload:
        lines.append(
            label + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        )


def _append_retry_context(
    lines: list[str], rejected_reasons: tuple[str, ...], existing_prompts: list[str]
) -> None:
    if rejected_reasons:
        lines.append(
            "A previous attempt was rejected for these reasons. Do not repeat "
            "them: " + ", ".join(rejected_reasons)
        )
    if existing_prompts:
        lines.append(
            "Existing prompts (do NOT duplicate any of these):\n- "
            + "\n- ".join(existing_prompts)
        )


def build_generation_user_message(
    *,
    brand_context: dict[str, Any],
    slots: list[PromptSlot],
    existing_prompts: list[str],
    rejected_reasons: tuple[str, ...] = (),
) -> str:
    """The one user message both generation paths send.

    Onboarding built a much thinner payload of its own -- brand name, market,
    business model, register -- so the initial portfolio was written without the
    knowledge base, confirmed business context or competitor list that the
    "Generate prompts" button had been sending all along. Same planner, same
    instruction, same context.
    """
    competitors = [item["name"] for item in brand_context.get("competitors", [])]
    lines = [
        serialize_brand_knowledge_context(dict(brand_context.get("knowledge_base", {})))
    ]
    lines += evidence_block_lines(
        brand_context.get("website_evidence", ""),
        "Use the website evidence only to ground prompt wording. The canonical "
        "topics below are the complete allowed taxonomy.",
    )
    _append_json_context(
        lines,
        "Confirmed business context: ",
        brand_context.get("business_context") or {},
    )
    _append_json_context(
        lines,
        "Available demand evidence (reference observations, not mandatory wording): ",
        list(brand_context.get("demand_signals") or []),
    )
    lines += [
        f"Brand: {brand_context.get('brand_name', '')}",
        f"Brand aliases: {', '.join(brand_context.get('brand_aliases', [])) or 'none'}",
        f"Competitors: {', '.join(competitors) or 'none'}",
        f"Market country: {brand_context.get('country_code') or 'unspecified'}",
        f"Language: {brand_context.get('language_code') or 'unspecified'}",
        f"buyer_stage labels: {', '.join(BUYER_STAGES)}",
        f"prompt_intent labels: {', '.join(PROMPT_INTENT_VOCABULARY)}",
        "Buyer-query slots (return one row per slot): "
        + json.dumps(
            [slot.as_model_input() for slot in slots],
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    ]
    _append_json_context(
        lines,
        "Uploaded catalog products (use only products whose category matches the "
        "target topic): ",
        list(brand_context.get("commerce_products") or []),
    )
    lines.append(f"Return exactly {len(slots)} prompts in total.")
    _append_retry_context(lines, rejected_reasons, existing_prompts)
    return "\n".join(lines)
