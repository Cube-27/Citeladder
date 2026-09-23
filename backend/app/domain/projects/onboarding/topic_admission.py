"""Deterministic admission for model-selected visibility topics.

Structural checks plus one semantic check that is pure string comparison. This
module never rewrites a topic: a name that fails is dropped, never repaired.
Repair was tried before and it is how prompt text ended up inventing topics
that no evidence supported.
"""

from __future__ import annotations

import re
import uuid

from app.core.config.visibility_prompts import (
    CONFIRMED_OFFERING_SOURCE_REF,
    PROVIDER_DESCRIPTION_PHRASES,
    TOPIC_BUNDLE_CONNECTORS,
    VISIBILITY_TOPIC_MAX,
    VISIBILITY_TOPIC_NAME_MAX_WORDS,
)
from app.domain.projects.discovery_schemas import DiscoveryTopic

_TOKEN = re.compile(r"[a-z0-9]+")


def _normalize(value: str) -> str:
    return " ".join(_TOKEN.findall(value.casefold().replace("&amp;", " and ")))


def _key(value: str) -> frozenset[str]:
    """Singular-normalized token set -- the identity of a topic name.

    Character similarity is the wrong measure here and quietly merged real
    topics: "womens footwear" and "mens footwear" differ by three characters
    and score 0.93, so a threshold high enough to catch "Air Conditioner" /
    "Air Conditioners" also collapsed two distinct departments into one.
    Comparing token sets separates those exactly, still catches the
    singular/plural case a model does emit, and needs no threshold to tune.
    """
    return frozenset(
        token[:-1] if len(token) > 3 and token.endswith("s") else token
        for token in _TOKEN.findall(value.casefold())
    )


# Every token that appears anywhere in the provider vocabulary.
_PROVIDER_TOKENS: frozenset[str] = frozenset(
    token for phrase in PROVIDER_DESCRIPTION_PHRASES for token in _key(phrase)
)


def _is_provider_description(name: str) -> bool:
    """Whether a name says only what KIND OF PROVIDER this is.

    A customer wants a knee replacement, never a hospital; payment links, never
    a platform; shoes, never an online store.

    The test is that EVERY token is provider vocabulary. Substring containment
    was tried first and was far too greedy: "school" is a provider word, so
    "School Uniforms" -- a real department on a real retailer -- was rejected,
    as was "Bank Holidays". Requiring every token keeps the five names that
    made this rule necessary ("Consumer Goods Online Store", "Online General
    Merchandise", "Ecommerce Marketplace", "Online Retail", "Online Department
    Store") while leaving any topic that adds a real noun alone.
    """
    tokens = _key(name)
    return bool(tokens) and tokens <= _PROVIDER_TOKENS


def _is_unsplit_bundle(name: str) -> bool:
    """Whether the name still joins two offerings the model was told to split.

    Dropped rather than repaired, like every other failure here: splitting
    "Womenswear including plus size" correctly means knowing that plus size
    clothing is its own department, which is the model's judgement to make from
    the evidence, not a string operation.
    """
    normalized = f" {_normalize(name)} "
    return any(f" {connector} " in normalized for connector in TOPIC_BUNDLE_CONNECTORS)


def _structural_failure(
    *,
    name: str,
    source_refs: list[str],
    known_refs: set[str],
    forbidden_terms: list[str],
) -> bool:
    if not name or len(name.split()) > VISIBILITY_TOPIC_NAME_MAX_WORDS:
        return True
    if _is_unsplit_bundle(name):
        return True
    if not source_refs or any(ref not in known_refs for ref in source_refs):
        return True
    normalized = _normalize(name)
    return any(
        term and f" {term} " in f" {normalized} "
        for term in (_normalize(item) for item in forbidden_terms)
    )


def _admissible_candidate(
    candidate: dict,
    *,
    known_refs: set[str],
    forbidden_terms: list[str],
) -> tuple[str, str, list[str]] | None:
    name = " ".join(str(candidate.get("name") or "").split())
    refs = list(dict.fromkeys(str(ref) for ref in candidate.get("source_refs") or []))
    if _structural_failure(
        name=name,
        source_refs=refs,
        known_refs=known_refs,
        forbidden_terms=forbidden_terms,
    ) or _is_provider_description(name):
        return None
    return (
        name,
        " ".join(str(candidate.get("description") or "").split()),
        refs,
    )


def _distinct_topics(
    rows: list[tuple[str, str, list[str]]],
) -> list[DiscoveryTopic]:
    admitted: list[DiscoveryTopic] = []
    seen: set[frozenset[str]] = set()
    for name, description, refs in rows:
        key = _key(name)
        if not key or key in seen:
            continue
        seen.add(key)
        admitted.append(
            DiscoveryTopic(
                topic_id=uuid.uuid4(),
                name=name,
                description=description,
                source_refs=refs,
            )
        )
    return admitted


def admit_topics(
    candidates: list[dict],
    *,
    known_refs: set[str],
    forbidden_terms: list[str],
) -> list[DiscoveryTopic]:
    """Admit distinct, evidence-backed topics that name what customers want.

    ``forbidden_terms`` are the brand, its aliases and confirmed competitors.
    An exact category match can still be a distinct buyer need: a mattress
    business selling pillows should retain Mattresses as well as Pillows.
    """
    structural = [
        row
        for candidate in candidates
        if (
            row := _admissible_candidate(
                candidate,
                known_refs=known_refs,
                forbidden_terms=forbidden_terms,
            )
        )
        is not None
    ]

    return _distinct_topics(structural)


def confirmed_offering_topics(offerings: list[str]) -> list[DiscoveryTopic]:
    """Create starting topics from the offerings a person confirmed.

    Subsequent Generate prompts uses this when an existing project has no
    topics. It preserves the user's wording and stamps explicit provenance.
    """
    topics: list[DiscoveryTopic] = []
    seen: set[str] = set()
    for offering in offerings:
        name = " ".join(offering.split())[:255].rstrip()
        key = name.casefold()
        if not name or key in seen:
            continue
        seen.add(key)
        topics.append(
            DiscoveryTopic(
                topic_id=uuid.uuid4(),
                name=name,
                description="",
                source_refs=[CONFIRMED_OFFERING_SOURCE_REF],
            )
        )
        if len(topics) == VISIBILITY_TOPIC_MAX:
            break

    return topics
