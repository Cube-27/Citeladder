"""Pure deterministic lexical normalisation shared by content diagnostics."""

from __future__ import annotations

import re

_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")
STOP_WORDS: frozenset[str] = frozenset(
    {
        "a",
        "about",
        "an",
        "in",
        "is",
        "of",
        "on",
        "to",
        "and",
        "any",
        "are",
        "best",
        "but",
        "can",
        "content",
        "create",
        "for",
        "from",
        "get",
        "give",
        "guide",
        "has",
        "have",
        "how",
        "into",
        "its",
        "make",
        "more",
        "new",
        "not",
        "our",
        "out",
        "page",
        "post",
        "some",
        "that",
        "the",
        "their",
        "them",
        "then",
        "there",
        "these",
        "they",
        "this",
        "top",
        "use",
        "using",
        "want",
        "was",
        "were",
        "what",
        "when",
        "where",
        "which",
        "who",
        "why",
        "will",
        "with",
        "write",
        "writing",
        "you",
        "your",
    }
)


def lexical_token_sequence(value: object, *, min_length: int = 1) -> tuple[str, ...]:
    """Return normalized terms in source order, retaining term frequency."""
    return tuple(
        token
        for token in _TOKEN_SPLIT.split(str(value or "").lower())
        if len(token) >= min_length and token not in STOP_WORDS
    )


def lexical_tokens(value: object, *, min_length: int = 1) -> set[str]:
    """Return distinct lowercase ASCII terms after stop-word removal."""
    text = str(value or "").lower()
    return {
        token
        for token in _TOKEN_SPLIT.split(text)
        if len(token) >= min_length and token not in STOP_WORDS
    }


def normalized_coverage(terms: set[str], value: object) -> float | None:
    """Share of usable terms found in a field; unknown for an empty term set."""
    if not terms:
        return None
    return len(terms & lexical_tokens(value)) / len(terms)


__all__ = [
    "STOP_WORDS",
    "lexical_token_sequence",
    "lexical_tokens",
    "normalized_coverage",
]
