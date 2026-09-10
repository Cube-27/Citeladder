"""Deterministic structured responses for generation orchestration tests."""

from __future__ import annotations

import json


def slot_text(slot: dict[str, object], index: object) -> str:
    """Unique fixture text; semantic quality is assessed outside fake providers."""
    topic = str(slot.get("topic") or "footwear")
    brand = str(slot.get("brand") or "")
    competitors = list(slot.get("competitors") or [])
    if slot["cohort"] == "comparison":
        return f"{brand} versus {competitors[0]} for {topic} use case {index}"
    if slot["cohort"] == "brand_diagnostic":
        return f"Is {brand} suitable for {topic} use case {index}?"
    return f"Best {topic} for use case {index}"


def satisfies_slot(slot: dict[str, object], text: str) -> bool:
    """Keep supplied fixture text unless it omits a required named identity."""
    if not text:
        return False
    if slot["cohort"] == "core":
        return True
    if str(slot.get("brand") or "").casefold() not in text.casefold():
        return False
    return slot["cohort"] != "comparison" or any(
        str(name).casefold() in text.casefold()
        for name in slot.get("competitors") or []
    )


def labelled_row(slot: dict[str, object], text: str) -> dict[str, str]:
    allowed = list(slot["allowed_prompt_intents"])
    intent = "recommend" if "recommend" in allowed else str(allowed[0])
    return {
        "slot_id": str(slot["slot_id"]),
        "text": text,
        "buyer_stage": "consideration",
        "prompt_intent": intent,
    }


SLOT_MARKER = "Buyer-query slots (return one row per slot): "


def slots_from_user_message(user: str) -> list[dict]:
    line = next(line for line in user.splitlines() if line.startswith(SLOT_MARKER))
    return json.loads(line.removeprefix(SLOT_MARKER))


def response_for(user: str) -> str:
    return json.dumps(
        {
            "prompts": [
                labelled_row(slot, slot_text(slot, index))
                for index, slot in enumerate(slots_from_user_message(user))
            ]
        }
    )
