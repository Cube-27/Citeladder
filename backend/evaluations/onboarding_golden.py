"""Scoring for the onboarding golden corpus.

The corpus in :mod:`evaluations.onboarding_corpus` states what good looks
like; this module measures produced business context and competitor
suggestions against it.  It is a quality gate for a generated review payload,
not a source of production facts: the live onboarding flow must still derive
its recommendation from the supplied official site and require user review
before creating a project.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

from app.analysis.normalization import normalize_alias
from evaluations.onboarding_cases import CASES_BY_SLUG, GOLDEN_ONBOARDING_CASES
from evaluations.onboarding_corpus import GoldenOnboardingCase

__all__ = [
    "CASES_BY_SLUG",
    "GOLDEN_ONBOARDING_CASES",
    "GoldenOnboardingCase",
    "evaluate_competitors",
    "evaluate_context",
]

# A produced category counts as correct when it shares most of its content words
# with an accepted alias.  Substring matching is too weak: it would let the bare
# word "software" satisfy "feed management software".
_CATEGORY_MATCH_THRESHOLD = 0.5
_WORD_PATTERN = re.compile(r"[a-z0-9']+")
_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "best",
        "but",
        "by",
        "can",
        "do",
        "does",
        "for",
        "from",
        "how",
        "i",
        "in",
        "is",
        "it",
        "me",
        "my",
        "of",
        "on",
        "or",
        "should",
        "that",
        "the",
        "to",
        "we",
        "what",
        "when",
        "where",
        "which",
        "who",
        "why",
        "with",
        "you",
        "your",
    }
)


@dataclass(frozen=True, slots=True)
class CompetitorEvaluation:
    precision: float
    recall: float
    missing: tuple[str, ...]
    unexpected: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ContextEvaluation:
    category_match: bool
    facet_accuracy: float
    jtbd_coverage: float
    mismatches: tuple[str, ...]


def evaluate_competitors(
    case: GoldenOnboardingCase, proposed: Iterable[str]
) -> CompetitorEvaluation:
    """Score expected-set overlap without making competitor truth production data.

    Names are matched on identity, not on string equality. Exact matching scored
    Puma's competitor set at 0.0 for returning "Nike" and "Adidas" where the
    corpus says "Nike India" and "Adidas India" -- the same companies, correctly
    found. It likewise missed "JustDial Home Services" against "Justdial". A
    brand keeps its identity when a market or descriptive suffix is added, so
    the comparison drops those before deciding.
    """
    expected = {_normalized(name): name for name in case.expected_competitors}
    actual = {_normalized(name): name for name in proposed if name.strip()}
    matched_expected: set[str] = set()
    matched_actual: set[str] = set()
    for expected_key in expected:
        for actual_key in actual:
            if actual_key in matched_actual:
                continue
            if _same_company(expected_key, actual_key):
                matched_expected.add(expected_key)
                matched_actual.add(actual_key)
                break
    return CompetitorEvaluation(
        precision=len(matched_actual) / len(actual) if actual else 0.0,
        recall=len(matched_expected) / len(expected) if expected else 1.0,
        missing=tuple(
            expected[key] for key in sorted(expected.keys() - matched_expected)
        ),
        unexpected=tuple(actual[key] for key in sorted(actual.keys() - matched_actual)),
    )


# Words that never distinguish one company from another, so a name that differs
# only by these is the same company wearing a market or category label.
_NON_DISTINCTIVE = frozenset(
    {
        "india",
        "indian",
        "australia",
        "australian",
        "usa",
        "us",
        "uk",
        "global",
        "group",
        "inc",
        "ltd",
        "limited",
        "services",
        "service",
        "home",
        "online",
        "store",
        "stores",
        "shop",
        "company",
        "co",
    }
)


def _same_company(left: str, right: str) -> bool:
    """Same company if one name is the other plus only non-distinctive words.

    The test is on the *difference*, not the overlap. Requiring merely that the
    shorter name be a subset let a bare "Gold" satisfy "Fat Gold" -- two
    unrelated olive oil brands -- because the overlap looked brand-like. Asking
    what the longer name adds is the question that actually separates
    "Nike" / "Nike India" from "Gold" / "Fat Gold".
    """
    if left == right:
        return True
    left_words, right_words = set(left.split()), set(right.split())
    shorter, longer = sorted((left_words, right_words), key=len)
    if not shorter or not shorter <= longer:
        return False
    if not shorter - _NON_DISTINCTIVE:
        return False
    return not (longer - shorter) - _NON_DISTINCTIVE


def evaluate_context(
    case: GoldenOnboardingCase, produced: dict[str, object]
) -> ContextEvaluation:
    """Score the resolved business context against the expected facets."""
    category = str(produced.get("category") or "")
    category_match = _category_matches(case, category)
    hits, mismatches = _facet_hits(case, produced)
    if not category_match:
        mismatches.append(f"category: expected ~{case.category!r}, got {category!r}")

    jtbd_blob = _normalized(f"{_produced_terms(produced)} {category}")
    covered = sum(1 for job in case.jobs_to_be_done if _shares_content(job, jtbd_blob))
    return ContextEvaluation(
        category_match=category_match,
        facet_accuracy=hits / len(_SCORED_FACETS),
        jtbd_coverage=covered / len(case.jobs_to_be_done),
        mismatches=tuple(mismatches),
    )


_SCORED_FACETS = ("business_model", "market_scope", "buyer_type")


def _category_matches(case: GoldenOnboardingCase, category: str) -> bool:
    """Does the produced category cover a recognised alias?

    Containment, not symmetric similarity. Jaccard punished the right answer for
    being richer: "premium mattress and sleep products brand" scored below
    threshold against the alias "mattress brand" purely because it said more.
    What matters is whether an accepted alias is substantially *present*, so the
    denominator is the alias, and extra specificity costs nothing.
    """
    produced = _content_words(category)
    if not produced:
        return False
    aliases = [*case.category_aliases, case.category]
    return any(
        len(alias_words & produced) / len(alias_words) >= _CATEGORY_MATCH_THRESHOLD
        for alias in aliases
        if (alias_words := _content_words(alias))
    )


def _facet_hits(
    case: GoldenOnboardingCase, produced: dict[str, object]
) -> tuple[int, list[str]]:
    hits = 0
    mismatches: list[str] = []
    for facet in _SCORED_FACETS:
        expected = getattr(case, facet)
        actual = str(produced.get(facet) or "")
        candidates = {actual}
        if facet == "business_model":
            # A composite business satisfies the expectation from either slot:
            # calling Urban Company a marketplace is not wrong, it is partial.
            secondary = produced.get("secondary_business_models")
            if isinstance(secondary, list | tuple):
                candidates |= {str(item) for item in secondary}
        if expected in candidates:
            hits += 1
        else:
            mismatches.append(f"{facet}: expected {expected!r}, got {actual!r}")
    return hits, mismatches


def _produced_terms(produced: dict[str, object]) -> str:
    terms = produced.get("category_terms")
    if not isinstance(terms, list | tuple):
        return ""
    return " ".join(str(term) for term in terms)


_DISCRIMINATION_SYSTEM = (
    "You are shown search prompts for one business. Some were written by real "
    "buyers; others were produced by software. For each id say which. Judge only "
    "whether the wording sounds like a person actually typing a query - not "
    "whether it is well formed. Stilted, over-complete, uniformly structured "
    "questions are machine-written. Return JSON only: "
    '{"labels": [{"id": <int>, "source": "human"|"machine"}]}'
)


def _normalized(value: str) -> str:
    return normalize_alias(value).strip()


def _content_words(value: str) -> frozenset[str]:
    words = _WORD_PATTERN.findall(_normalized(value))
    return frozenset(word for word in words if word not in _STOPWORDS)


def _shares_content(phrase: str, blob: str) -> bool:
    words = _content_words(phrase)
    if not words:
        return False
    blob_words = _content_words(blob)
    return bool(words & blob_words)
