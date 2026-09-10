"""Shared structural and cohort admission for generated visibility prompts."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.config.http import PROMPT_TEXT_MAX_CHARS, PROMPT_TEXT_MIN_WORDS
from app.core.config.projects import PROMPT_INTENTS
from app.core.config.prompts import (
    BRAND_TOKEN_COMMON_WORDS,
    PROMPT_COHORT_BRAND_DIAGNOSTIC,
    PROMPT_COHORT_COMPARISON,
    PROMPT_COHORT_CORE,
    TOPICAL_BINDING_STOPWORDS,
)
from app.core.config.visibility_prompts import (
    PROVIDER_DESCRIPTION_PHRASES,
    VISIBILITY_MAX_ORGANIC_PROMPTS,
)
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.prompts.portfolio import contains_tracked_name
from app.domain.prompts.style import words

__all__ = [
    "PortfolioValidator",
    "brand_terms",
    "ordered_portfolio",
]


def brand_terms(
    brand_name: str,
    aliases: list[str],
    category_vocabulary: list[str] | None = None,
) -> list[str]:
    """The brand name, its aliases, and the short form people actually type.

    An organic prompt must never name the tracked brand, or the visibility
    score measures the brand answering about itself. Matching only the full
    name let every short form through: with "Apollo Hospitals" tracked, the
    generator produced "Best Apollo hospital for kidney stone treatment" as an
    ORGANIC prompt and nothing rejected it.

    Only distinctive tokens are added. A token naming the kind of provider
    ("Hospitals", "Company") or a common query word ("Best", "Top", "Shop") is
    not the brand, and banning it would reject legitimate prompts across the
    whole category. A brand built entirely from such words keeps only its full
    name, which is the safe direction to fail in.

    `category_vocabulary` is the same escape hatch driven by evidence rather
    than by a fixed word list. "Red Dress" sells dresses, so the static generic
    set never saw "dress" and banned it -- which rejected every organic dress
    query, emptied the core cohort, and left a portfolio of nothing but the two
    mandatory brand-diagnostic prompts. A token the business's own confirmed
    category uses is category language first and brand language second: it is
    dropped from the token bans. The full name and the aliases are always
    banned, so "Red Dress" itself still cannot appear in an organic prompt.

    `BRAND_TOKEN_COMMON_WORDS` closes the same hole from the other side, for a
    token that is ordinary English rather than category language and so never
    appears in a confirmed category either. "I Love Dooney" banned "love" and
    lost nearly every organic apparel query with it.

    The escape hatch reads only the HEAD of each vocabulary phrase -- see
    `_category_heads`. Any looser reading hands the brand back its own name.
    """
    generic = (
        {
            _singular(word)
            for phrase in PROVIDER_DESCRIPTION_PHRASES
            for word in phrase.split()
        }
        | TOPICAL_BINDING_STOPWORDS
        | BRAND_TOKEN_COMMON_WORDS
    )
    category = _category_heads(category_vocabulary)
    tokens = [
        token
        for token in words(brand_name)
        if len(token) >= 4
        and token not in generic
        and _singular(token) not in generic
        and _stem(token) not in category
    ]
    return list(dict.fromkeys([brand_name, *aliases, *tokens]))


#: Separators between the several things a category phrase lists. The ASCII
#: hyphen counts only when SPACED ("Dresses - accessories"): bare "-" is
#: word-internal in "Direct-to-consumer", and splitting there would mint
#: heads like "direct" that could un-ban a real brand token.
_CATEGORY_PHRASE_SPLIT = re.compile(r"(?:\s+-\s+|[(),;/–—|]+)")


def _category_heads(category_vocabulary: list[str] | None) -> set[str]:
    """The nouns a confirmed category names, as the THING being sold.

    Reading every token of the category vocabulary was too generous, because
    the vocabulary is written about the brand and routinely contains it. An
    outlet for one designer label confirmed a category of "Designer handbag &
    accessories outlet (Dooney & Bourke official clearance)" with terms like
    "dooney outlet" and "discounted dooney handbags" -- so "dooney" read as
    category language, dropped out of the brand bans, and every organic prompt
    was free to name the tracked brand. The portfolio came back measuring
    nothing but branded demand, which is the one thing an outlet does not need
    to find out.

    A phrase's HEAD is what it is; the rest modifies it. "Dooney" is never the
    head of "Dooney & Bourke handbags" (handbags is), nor of "dooney outlet"
    (outlet is), so it stays banned -- while "dress" IS the head of "Maxi
    dresses" and stays usable, which is the "Red Dress" case this hatch was
    built for.

    Separators split a phrase into the several things it lists, so
    "Small leather goods (wallets, wristlets)" yields goods, wallets AND
    wristlets. "&" deliberately does NOT split: it joins the halves of a name
    ("Dooney & Bourke"), and splitting there would make "Dooney" a head again.
    """
    heads: set[str] = set()
    for phrase in category_vocabulary or []:
        for segment in _CATEGORY_PHRASE_SPLIT.split(str(phrase)):
            tokens = words(segment)
            if tokens:
                heads.add(_stem(tokens[-1]))
    return heads


def _singular(token: str) -> str:
    return token[:-1] if len(token) > 3 and token.endswith("s") else token


def _stem(token: str) -> str:
    """Fold a word to a form that matches its own plural.

    `_singular` strips a single trailing "s", which is enough for the generic
    provider vocabulary but cannot match "dress" to "dresses" -- it produces
    "dres" and the comparison silently fails, which is exactly the bug this
    guards. "-es" is stripped only when what remains still ends in a sibilant,
    so "dresses" folds to "dress" while "shoes" folds to "shoe".
    """
    if (
        len(token) > 4
        and token.endswith("es")
        and (token[-3] in "sxz" or token[-4:-2] in {"ch", "sh"})
    ):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _candidate_field(candidate: dict, key: str) -> str:
    return str(candidate.get(key) or "")


@dataclass(slots=True)
class PortfolioValidator:
    """Accumulates exact duplicates across calls in one generation."""

    topic_ids: frozenset[str]
    brand_terms: list[str]
    competitor_terms: list[str]
    _accepted: list[dict] = field(default_factory=list, init=False)
    _normalized: set[str] = field(default_factory=set, init=False)

    @property
    def accepted(self) -> list[dict]:
        return list(self._accepted)

    def _shape_error(self, text: str, topic_id: str, intent: str, cohort: str) -> str:
        if cohort == PROMPT_COHORT_BRAND_DIAGNOSTIC:
            # A diagnostic prompt need not name a topic, but an id it does
            # carry has to be one of ours. Blanking an unknown id threw the
            # association away silently; rejecting feeds the reason back into
            # the retry and leaves every accepted id a canonical one.
            if topic_id and topic_id not in self.topic_ids:
                return "topic_id"
        elif topic_id not in self.topic_ids:
            return "topic_id"
        if intent not in PROMPT_INTENTS:
            return "intent"
        if not text or len(text) > PROMPT_TEXT_MAX_CHARS:
            return "length"
        # A floor as well as a ceiling. The old four-word window is gone on
        # purpose -- real queries are short -- but its removal left NO lower
        # bound, and onboarding's portfolio path has no topical-binding gate to
        # catch what slips through. A one-character row would persist into the
        # initial portfolio and then be measured against paid answer-engine
        # calls. Two tokens rejects nothing anyone would ask.
        if len(words(text)) < PROMPT_TEXT_MIN_WORDS:
            return "length"
        return ""

    def _name_error(self, text: str, cohort: str, intent: str) -> str:
        tracked = [*self.brand_terms, *self.competitor_terms]
        if cohort == PROMPT_COHORT_CORE and contains_tracked_name(text, tracked):
            return "tracked_name"
        if cohort != PROMPT_COHORT_CORE and not contains_tracked_name(
            text, self.brand_terms
        ):
            return "missing_brand_name"
        if cohort == PROMPT_COHORT_COMPARISON:
            if intent != "comparison":
                return "comparison_intent"
            if not contains_tracked_name(text, self.competitor_terms):
                return "missing_competitor_name"
        return ""

    def offer(self, candidate: dict, *, cohort: str) -> str:
        """Accept one candidate, or return the reason it was rejected."""
        text = " ".join(_candidate_field(candidate, "text").split())
        topic_id = _candidate_field(candidate, "topic_id")
        intent = _candidate_field(candidate, "intent").strip().casefold()
        error = (
            self._shape_error(text, topic_id, intent, cohort)
            or self._name_error(text, cohort, intent)
            or ("duplicate" if prompt_text_hash(text) in self._normalized else "")
        )
        if error:
            return error
        self._normalized.add(prompt_text_hash(text))
        self._accepted.append(
            {
                "slot_id": _candidate_field(candidate, "slot_id"),
                "topic_id": topic_id,
                "text": text,
                "intent": intent,
                "buyer_stage": _candidate_field(candidate, "buyer_stage"),
                "prompt_intent": _candidate_field(candidate, "prompt_intent"),
                "cohort": cohort,
            }
        )
        return ""


def _partition_portfolio(
    prompts: list[dict], topic_ids: list[str]
) -> tuple[dict[str, list[dict]], list[dict]]:
    by_topic: dict[str, list[dict]] = {topic_id: [] for topic_id in topic_ids}
    trailing: list[dict] = []
    for prompt in prompts:
        if prompt["cohort"] == PROMPT_COHORT_CORE and prompt["topic_id"] in by_topic:
            by_topic[prompt["topic_id"]].append(prompt)
        else:
            trailing.append(prompt)
    return by_topic, trailing


def ordered_portfolio(prompts: list[dict], *, topic_ids: list[str]) -> list[dict]:
    """Round-robin across topics in model order, then append named cohorts."""
    by_topic, trailing = _partition_portfolio(prompts, topic_ids)
    organic: list[dict] = []
    depth = max((len(rows) for rows in by_topic.values()), default=0)
    for index in range(depth):
        for topic_id in topic_ids:
            rows = by_topic[topic_id]
            if index < len(rows) and len(organic) < VISIBILITY_MAX_ORGANIC_PROMPTS:
                organic.append(rows[index])
    return [*organic, *trailing]
