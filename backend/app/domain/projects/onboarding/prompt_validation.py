"""Small deterministic admission gate for the initial visibility portfolio."""

from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher

from app.analysis.normalization import normalize_alias
from app.core.config.brand_discovery import (
    DISCOVERY_BRAND_CONTEXT_PROMPT_COUNT,
    DISCOVERY_ORGANIC_PROMPT_COUNT,
    DISCOVERY_PROMPT_MAX_WORDS,
    DISCOVERY_PROMPT_MIN_WORDS,
)
from app.core.config.projects import PROMPT_INTENTS
from app.domain.prompts.portfolio import contains_tracked_name

ORGANIC = "organic"
BRAND_CONTEXT = "brand_context"
CORE = "core"
BRAND_DIAGNOSTIC = "brand_diagnostic"


@dataclass(frozen=True, slots=True)
class PromptQualityResult:
    accepted: tuple[dict, ...]
    errors: tuple[str, ...]


def _near_duplicate(text: str, accepted: list[str]) -> bool:
    normalized = normalize_alias(text)
    return any(
        normalized == prior or SequenceMatcher(None, normalized, prior).ratio() >= 0.88
        for prior in accepted
    )


def _candidate_shape_error(
    prompt: dict,
    *,
    index: int,
    topic_ids: set[str],
    accepted_text: list[str],
) -> str:
    topic_id = str(prompt.get("topic_id") or "")
    text = " ".join(str(prompt.get("text") or "").split())
    cohort = str(prompt.get("cohort") or "")
    intent = str(prompt.get("intent") or "")
    if topic_id not in topic_ids:
        return f"prompt[{index}].topic_id"
    if cohort not in {ORGANIC, BRAND_CONTEXT}:
        return f"prompt[{index}].cohort"
    if intent not in PROMPT_INTENTS:
        return f"prompt[{index}].intent"
    if (
        not DISCOVERY_PROMPT_MIN_WORDS
        <= len(text.split())
        <= DISCOVERY_PROMPT_MAX_WORDS
    ):
        return f"prompt[{index}].length"
    if _near_duplicate(text, accepted_text):
        return f"prompt[{index}].duplicate"
    return ""


def _candidate_name_error(
    prompt: dict,
    *,
    index: int,
    brand_terms: list[str],
    competitor_terms: list[str],
) -> str:
    text = " ".join(str(prompt.get("text") or "").split())
    cohort = str(prompt.get("cohort") or "")
    intent = str(prompt.get("intent") or "")
    if cohort == ORGANIC and contains_tracked_name(
        text, [*brand_terms, *competitor_terms]
    ):
        return f"prompt[{index}].tracked_name"
    if cohort == BRAND_CONTEXT and not contains_tracked_name(text, brand_terms):
        return f"prompt[{index}].missing_brand_name"
    if (
        cohort == BRAND_CONTEXT
        and intent == "comparison"
        and competitor_terms
        and not contains_tracked_name(text, competitor_terms)
    ):
        return f"prompt[{index}].missing_competitor_name"
    return ""


def _candidate_error(
    prompt: dict,
    *,
    index: int,
    topic_ids: set[str],
    brand_terms: list[str],
    competitor_terms: list[str],
    accepted_text: list[str],
) -> str:
    return _candidate_shape_error(
        prompt,
        index=index,
        topic_ids=topic_ids,
        accepted_text=accepted_text,
    ) or _candidate_name_error(
        prompt,
        index=index,
        brand_terms=brand_terms,
        competitor_terms=competitor_terms,
    )


def _first_for_each_topic(prompts: list[dict], topic_ids: list[str]) -> list[dict]:
    selected: list[dict] = []
    for topic_id in topic_ids:
        match = next(
            (prompt for prompt in prompts if prompt["topic_id"] == topic_id), None
        )
        if match is not None:
            selected.append(match)
    return selected


def _fill_in_order(selected: list[dict], candidates: list[dict], limit: int) -> None:
    selected_indexes = {prompt["_index"] for prompt in selected}
    for prompt in candidates:
        if len(selected) >= limit:
            break
        if prompt["_index"] not in selected_indexes:
            selected.append(prompt)
            selected_indexes.add(prompt["_index"])


def _validated_candidates(
    prompts: list[dict],
    *,
    topic_ids: set[str],
    brand_terms: list[str],
    competitor_terms: list[str],
) -> tuple[list[dict], list[str]]:
    accepted_text: list[str] = []
    valid: list[dict] = []
    errors: list[str] = []
    for index, prompt in enumerate(prompts):
        error = _candidate_error(
            prompt,
            index=index,
            topic_ids=topic_ids,
            brand_terms=brand_terms,
            competitor_terms=competitor_terms,
            accepted_text=accepted_text,
        )
        if error:
            errors.append(error)
            continue
        normalized = {
            "topic_id": str(prompt["topic_id"]),
            "text": " ".join(str(prompt["text"]).split()),
            "cohort": str(prompt["cohort"]),
            "intent": str(prompt["intent"]),
            "_index": index,
        }
        valid.append(normalized)
        accepted_text.append(normalize_alias(normalized["text"]))
    return valid, errors


def select_portfolio(
    prompts: list[dict],
    *,
    topic_ids: list[str],
    brand_terms: list[str],
    competitor_terms: list[str],
) -> PromptQualityResult:
    """Validate candidates and deterministically retain an 8/2 portfolio."""
    valid, errors = _validated_candidates(
        prompts,
        topic_ids=set(topic_ids),
        brand_terms=brand_terms,
        competitor_terms=competitor_terms,
    )

    organic = [prompt for prompt in valid if prompt["cohort"] == ORGANIC]
    branded = [prompt for prompt in valid if prompt["cohort"] == BRAND_CONTEXT]
    selected_organic = _first_for_each_topic(organic, topic_ids)
    portfolio_errors: list[str] = []
    if len(selected_organic) != len(topic_ids):
        portfolio_errors.append("portfolio.topic_coverage")
    _fill_in_order(selected_organic, organic, DISCOVERY_ORGANIC_PROMPT_COUNT)
    selected_branded = branded[:DISCOVERY_BRAND_CONTEXT_PROMPT_COUNT]
    if len(selected_organic) != DISCOVERY_ORGANIC_PROMPT_COUNT:
        portfolio_errors.append(f"portfolio.organic_count:{len(selected_organic)}")
    if len(selected_branded) != DISCOVERY_BRAND_CONTEXT_PROMPT_COUNT:
        portfolio_errors.append(
            f"portfolio.brand_context_count:{len(selected_branded)}"
        )
    if portfolio_errors:
        return PromptQualityResult(
            (), tuple(dict.fromkeys([*errors, *portfolio_errors]))
        )

    selected = sorted(
        [*selected_organic, *selected_branded], key=lambda prompt: prompt["_index"]
    )
    return PromptQualityResult(
        tuple(
            {
                "topic_id": prompt["topic_id"],
                "text": prompt["text"],
                "intent": prompt["intent"],
                "cohort": (CORE if prompt["cohort"] == ORGANIC else BRAND_DIAGNOSTIC),
            }
            for prompt in selected
        ),
        (),
    )
