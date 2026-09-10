"""Deterministic text and domain normalization for AI-visibility scoring.

All brand/competitor matching is alias-based (no fuzzy matching) to avoid false
positives. These helpers make the matching robust to casing, punctuation,
``&``/``and`` equivalence, separator-free spellings, and ``www.``/fragment noise
on domains.

Ported from the reference ``ai_visibility/normalization.py`` (B6), with
whole-token compact matching added: see :func:`alias_present`.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from urllib.parse import urlsplit

_WHITESPACE_RE = re.compile(r"\s+")
_PUNCTUATION_RE = re.compile(r"[^\w\s]", flags=re.UNICODE)


def normalize_alias(value: object) -> str:
    """Aggressive normalization for alias matching: strip punctuation too.

    ``Best&Less`` / ``Best & Less`` / ``Best and Less`` all collapse to the same
    token ``best and less``.
    """
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = text.replace("&", " and ")
    text = _PUNCTUATION_RE.sub(" ", text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def alias_present(alias: str, normalized_haystack: str) -> bool:
    """Whole-token containment of a normalized alias in a normalized haystack.

    Both sides must already be normalized with :func:`normalize_alias`. Uses word
    boundaries so ``target`` does not match inside ``targeted``, and additionally
    matches across token boundaries so a separator-free spelling and a spaced one
    are the same brand -- see :func:`_compact_alias_offset`.
    """
    # Presence does not care WHERE, so a direct hit is the whole answer and the
    # token index never gets built. That index is the expensive half of the new
    # matching, and this is the hot path: every brand and every competitor is
    # tested against every answer.
    alias = alias.strip()
    if not alias:
        return False
    if _direct_alias_offset(alias, normalized_haystack) is not None:
        return True
    return _compact_alias_offset(alias, normalized_haystack) is not None


def _direct_alias_offset(alias: str, normalized_haystack: str) -> int | None:
    """Word-boundary match, so ``target`` does not match inside ``targeted``."""
    match = re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", normalized_haystack)
    return match.start() if match else None


def first_alias_offset(alias: str, normalized_haystack: str) -> int | None:
    """Offset of the alias's first appearance, or ``None`` when absent.

    The offset indexes ``normalized_haystack``, because callers order brands by
    where each one appears in the answer. Both spellings are searched and the
    EARLIER wins: one answer can carry the joined form and the spaced form, and
    the position a reader would report is the first of them.
    """
    alias = alias.strip()
    if not alias:
        return None
    direct = _direct_alias_offset(alias, normalized_haystack)
    compact = _compact_alias_offset(alias, normalized_haystack)
    if direct is None:
        return compact
    if compact is None:
        return direct
    return min(direct, compact)


@lru_cache(maxsize=8)
def _token_spans(normalized: str) -> tuple[str, dict[int, int], set[int]]:
    """The haystack with its token separators removed, plus a way back.

    Returns the concatenated tokens, a map from each token's offset in that
    concatenation to its offset in ``normalized``, and the set of offsets where
    a token ends. The two indexes are what keep compact matching honest: a
    match is only a match when it starts where a token starts AND ends where a
    token ends.

    Cached because the ANSWER is the argument and the aliases are the loop: one
    answer is scanned for the brand and for every competitor in turn, and
    rebuilding this index per alias was most of the cost of scoring a long
    answer. A handful of entries is all it takes -- the scans of one answer are
    consecutive. Callers must treat the returned indexes as read-only; both are
    module-private and only ever read.
    """
    compact: list[str] = []
    starts: dict[int, int] = {}
    ends: set[int] = set()
    cursor = 0
    offset = 0
    for token in normalized.split(" "):
        if not token:
            offset += 1
            continue
        starts[cursor] = offset
        cursor += len(token)
        ends.add(cursor)
        compact.append(token)
        offset += len(token) + 1
    return "".join(compact), starts, ends


def _compact_alias_offset(alias: str, normalized_haystack: str) -> int | None:
    """Match an alias across token boundaries, whole tokens only.

    A brand is written both ways and both are the brand: the site is
    ``bestandless.com.au``, the shopper types "bestandless", and the model
    answers "Best & Less", which :func:`normalize_alias` renders as the three
    tokens ``best and less``. Neither spelling contains the other, so word-
    boundary matching alone scores one of them as an absence -- and which one
    depends only on how the brand name happened to be typed at onboarding.

    Removing the separators from BOTH sides makes the two spellings one token,
    but it also destroys the word boundaries that keep alias matching from
    firing mid-word. The token index restores them: a compact match counts only
    when it covers whole tokens end to end, so ``bonds`` still cannot match
    inside ``bond sand`` (the run would have to stop at offset 5, which is not
    where a token ends), while ``bestandless`` matches ``best and less``
    exactly.
    """
    compact_alias = alias.replace(" ", "")
    if not compact_alias:
        return None
    # Both directions matter, so neither side may be special-cased: the alias
    # can be the joined spelling and the answer the split one ("bestandless"
    # against "best and less"), or the reverse. A single-token alias that gets
    # here found nothing at a word boundary, so any compact match it makes
    # necessarily spans two or more whole tokens -- the split spelling, which is
    # the case worth catching.
    #
    # Probing the token starts rather than scanning the string is not just
    # cheaper -- it is the only correct way round. A scan for candidates
    # (`re.finditer`) yields NON-OVERLAPPING matches, so rejecting one that
    # failed the boundary test resumed after its end and skipped any valid
    # match overlapping it: "Duran Duran" found nothing in "Duran DuranDuran"
    # because the rejected run starting at 0 swallowed the real one at 6. Only
    # a token start can ever begin a whole-token match, so every candidate is
    # here, and each is tested independently.
    compact, starts, ends = _token_spans(normalized_haystack)
    size = len(compact_alias)
    for start, offset in starts.items():  # insertion-ordered: ascending
        if start + size in ends and compact.startswith(compact_alias, start):
            return offset
    return None


def normalize_domain(value: object) -> str:
    """Lowercase host, strip ``www.`` and any leading scheme/path.

    Accepts a bare domain (``Kmart.com.au``), a full URL, or a citation title
    that is itself a domain (as Gemini returns).
    """
    text = str(value or "").strip().lower()
    if not text:
        return ""
    if "://" not in text:
        text = "https://" + text
    host = urlsplit(text).hostname or ""
    return host.removeprefix("www.")


def domain_matches(candidate: str, target: str) -> bool:
    """True if ``candidate`` domain equals or is a subdomain of ``target``.

    ``shop.bestandless.com.au`` matches owned domain ``bestandless.com.au``.
    """
    candidate = normalize_domain(candidate)
    target = normalize_domain(target)
    if not candidate or not target:
        return False
    return candidate == target or candidate.endswith("." + target)
