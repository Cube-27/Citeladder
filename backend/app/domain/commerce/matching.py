"""Deterministic, explainable catalog identity matching (no LLM)."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

from app.core.config.commerce import (
    COMMERCE_BRAND_KEY,
    COMMERCE_FAMILY_KEYS,
    COMMERCE_GTIN_KEYS,
    COMMERCE_MATCH_BRAND_MODEL,
    COMMERCE_MATCH_FAMILY_VARIANT,
    COMMERCE_MATCH_GTIN,
    COMMERCE_MATCH_SIMILARITY,
    COMMERCE_MODEL_KEYS,
    COMMERCE_SIMILARITY_ATTRIBUTE_KEYS,
    COMMERCE_VARIANT_KEYS,
    commerce_intelligence_settings,
)

_WORD = re.compile(r"[^a-z0-9]+")


def normalized(value: object) -> str:
    return " ".join(_WORD.sub(" ", str(value or "").casefold()).split())


def _attribute(entry: Mapping[str, Any], keys: Iterable[str]) -> str:
    attributes = entry.get("attributes") or {}
    for key in keys:
        value = attributes.get(key)
        if value not in (None, ""):
            return normalized(value)
    return ""


def _variant(entry: Mapping[str, Any]) -> str:
    direct = _attribute(entry, COMMERCE_VARIANT_KEYS)
    if direct:
        return direct
    variants = entry.get("variants") or []
    return normalized(
        " ".join(
            str(item.get("name", "")) for item in variants if isinstance(item, Mapping)
        )
    )


@dataclass(frozen=True)
class MatchResult:
    target_id: object | None
    confidence: float
    reasons: tuple[str, ...]
    review_required: bool


def _score(
    candidate: Mapping[str, Any], target: Mapping[str, Any]
) -> tuple[float, tuple[str, ...]]:
    exact = _exact_identifier_score(candidate, target)
    if exact is not None:
        return exact
    family = _family_variant_score(candidate, target)
    if family is not None:
        return family
    return _similarity_score(candidate, target)


def _exact_identifier_score(
    candidate: Mapping[str, Any], target: Mapping[str, Any]
) -> tuple[float, tuple[str, ...]] | None:
    candidate_gtin = _attribute(candidate, COMMERCE_GTIN_KEYS)
    target_gtin = _attribute(target, COMMERCE_GTIN_KEYS)
    if candidate_gtin and candidate_gtin == target_gtin:
        return 1.0, (COMMERCE_MATCH_GTIN,)

    candidate_brand = _attribute(candidate, (COMMERCE_BRAND_KEY,))
    target_brand = _attribute(target, (COMMERCE_BRAND_KEY,))
    candidate_model = _attribute(candidate, COMMERCE_MODEL_KEYS)
    target_model = _attribute(target, COMMERCE_MODEL_KEYS)
    if (
        candidate_brand
        and candidate_brand == target_brand
        and candidate_model
        and candidate_model == target_model
    ):
        return 0.96, (COMMERCE_MATCH_BRAND_MODEL,)
    return None


def _family_variant_score(
    candidate: Mapping[str, Any], target: Mapping[str, Any]
) -> tuple[float, tuple[str, ...]] | None:
    candidate_family = _attribute(candidate, COMMERCE_FAMILY_KEYS) or normalized(
        candidate.get("name")
    )
    target_family = _attribute(target, COMMERCE_FAMILY_KEYS) or normalized(
        target.get("name")
    )
    candidate_variant = _variant(candidate)
    target_variant = _variant(target)
    if (
        candidate_family
        and candidate_family == target_family
        and candidate_variant
        and candidate_variant == target_variant
    ):
        return 0.90, (COMMERCE_MATCH_FAMILY_VARIANT,)
    return None


def _similarity_score(
    candidate: Mapping[str, Any], target: Mapping[str, Any]
) -> tuple[float, tuple[str, ...]]:
    title_ratio = SequenceMatcher(
        None, normalized(candidate.get("name")), normalized(target.get("name"))
    ).ratio()
    overlaps = [
        _attribute(candidate, (key,)) == _attribute(target, (key,))
        for key in COMMERCE_SIMILARITY_ATTRIBUTE_KEYS
        if _attribute(candidate, (key,)) and _attribute(target, (key,))
    ]
    attribute_ratio = sum(overlaps) / len(overlaps) if overlaps else 0.0
    score = round((title_ratio + attribute_ratio) / (2 if overlaps else 1), 4)
    return score, (COMMERCE_MATCH_SIMILARITY,)


def match_candidate(
    candidate: Mapping[str, Any], targets: Iterable[Mapping[str, Any]]
) -> list[MatchResult]:
    """Return ordered candidates; ambiguous leading scores require review."""
    scored = [(_score(candidate, target), target) for target in targets]
    scored = [
        item
        for item in scored
        if item[0][0]
        >= commerce_intelligence_settings.title_attribute_similarity_threshold
        or item[0][1][0] != COMMERCE_MATCH_SIMILARITY
    ]
    scored.sort(key=lambda item: (-item[0][0], str(item[1].get("id", ""))))
    leading = scored[0][0][0] if scored else None
    ambiguous = bool(
        leading is not None
        and len(scored) > 1
        and leading - scored[1][0][0]
        <= commerce_intelligence_settings.match_ambiguity_margin
    )
    return [
        MatchResult(
            target_id=target.get("id"),
            confidence=score,
            reasons=reasons,
            review_required=ambiguous and score == leading,
        )
        for (score, reasons), target in scored
    ]
