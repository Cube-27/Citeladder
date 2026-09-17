"""Finding tracked entities on an inspected page, and saying how confidently.

Reuses the alias matching the answer scorer already uses, so "mentioned in the
answer" and "present on the page" mean the same thing by the same rules.

Two restraints matter more than the matching itself.

An absence is not evidence.
    No quoted passage can demonstrate that something is not there. A
    ``not_detected`` verdict is therefore only admissible alongside the amount
    of text that was actually read, and a page that yielded almost nothing
    reports ``partial`` instead. A thin extraction and a real absence look
    identical if this distinction is dropped.

Named is not listed.
    A page can name a brand without linking to it, which is a different
    finding from a proper listing. The outbound-domain evidence is carried
    separately rather than folded into presence.
"""

from __future__ import annotations

import re

from app.analysis.normalization import first_alias_offset, normalize_alias
from app.analysis.source_pages.contracts import (
    EntityPresence,
    EvidencePassage,
    ExtractedPage,
)
from app.core.config.source_pages import (
    PRESENCE_AMBIGUOUS,
    PRESENCE_MATCH_EXACT_ALIAS,
    PRESENCE_MATCH_NONE,
    PRESENCE_MATCH_NORMALIZED_ALIAS,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PARTIAL,
    PRESENCE_PRESENT,
    SOURCE_PAGE_MAX_PASSAGES,
    SOURCE_PAGE_MIN_COVERAGE_CHARS,
    SOURCE_PAGE_PASSAGE_CHARS,
)

# An alias this short is almost always an ordinary word on a page of prose.
# Matching it produces a confident-looking verdict from a coincidence.
_MIN_UNAMBIGUOUS_ALIAS_CHARS = 3


def _windows(text: str, alias: str) -> list[tuple[int, int]]:
    """Every whole-token occurrence of ``alias`` in the ORIGINAL text.

    Searched case-insensitively against the original rather than against a
    lowercased copy, because ``str.lower()`` is not length-preserving for
    every Unicode input and offsets taken from a lowered copy can address the
    wrong characters in the original.
    """
    pattern = re.compile(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", re.IGNORECASE)
    return [(match.start(), match.end()) for match in pattern.finditer(text)]


def _passage(text: str, start: int, end: int, entity_ref: str) -> EvidencePassage:
    half = max((SOURCE_PAGE_PASSAGE_CHARS - (end - start)) // 2, 0)
    left = max(start - half, 0)
    right = min(end + half, len(text))
    return EvidencePassage(
        text=text[left:right].strip(),
        char_start=left,
        char_end=right,
        entity_ref=entity_ref,
    )


def _resolve_alias(
    text: str, aliases: tuple[str, ...]
) -> tuple[str, list[tuple[int, int]]]:
    """First alias that actually appears, with its occurrences."""
    for alias in aliases:
        candidate = alias.strip()
        if len(candidate) < _MIN_UNAMBIGUOUS_ALIAS_CHARS:
            continue
        spans = _windows(text, candidate)
        if spans:
            return candidate, spans
    return "", []


def _normalized_offset(text: str, aliases: tuple[str, ...]) -> int | None:
    """Fall back to the normalized matcher used for answers.

    Catches spelling variants a literal search misses (``Best&Less`` against
    ``Best and Less``). The offset indexes the NORMALIZED text, so it cannot
    produce a quotable passage -- which is exactly why this verdict is
    ``ambiguous`` rather than ``present``.
    """
    haystack = normalize_alias(text)
    offsets = [
        offset
        for alias in aliases
        if (offset := first_alias_offset(normalize_alias(alias), haystack)) is not None
    ]
    return min(offsets) if offsets else None


def assess_entity(
    page: ExtractedPage,
    *,
    entity_kind: str,
    entity_name: str,
    aliases: tuple[str, ...],
    passages: list[EvidencePassage],
) -> EntityPresence:
    """Decide whether one entity is on this page, appending any evidence."""
    entity_ref = f"{entity_kind}:{normalize_alias(entity_name)}"
    haystack = " ".join(
        part for part in (page.title, page.meta_description, page.text) if part
    )
    candidates = tuple(dict.fromkeys((entity_name, *aliases)))

    alias, spans = _resolve_alias(haystack, candidates)
    if spans:
        refs: list[int] = []
        for start, end in spans:
            if len(passages) >= SOURCE_PAGE_MAX_PASSAGES:
                break
            refs.append(len(passages))
            passages.append(_passage(haystack, start, end, entity_ref))
        return EntityPresence(
            entity_kind=entity_kind,
            entity_name=entity_name,
            presence=PRESENCE_PRESENT,
            match_method=(
                PRESENCE_MATCH_EXACT_ALIAS
                if alias == entity_name
                else PRESENCE_MATCH_NORMALIZED_ALIAS
            ),
            match_count=len(spans),
            first_offset=spans[0][0],
            passage_refs=tuple(refs),
        )

    normalized = _normalized_offset(haystack, candidates)
    if normalized is not None:
        return EntityPresence(
            entity_kind=entity_kind,
            entity_name=entity_name,
            presence=PRESENCE_AMBIGUOUS,
            match_method=PRESENCE_MATCH_NORMALIZED_ALIAS,
            match_count=1,
            first_offset=normalized,
        )

    # Nothing found. Whether that is an absence depends entirely on how much
    # was read: "not on this page" and "we barely got any of this page" are
    # different claims and must not share a verdict.
    return EntityPresence(
        entity_kind=entity_kind,
        entity_name=entity_name,
        presence=(
            PRESENCE_NOT_DETECTED if has_sufficient_coverage(page) else PRESENCE_PARTIAL
        ),
        match_method=PRESENCE_MATCH_NONE,
    )


def has_sufficient_coverage(page: ExtractedPage) -> bool:
    """Whether an absence on this page is reportable at all."""
    return page.parsed and page.extracted_chars >= SOURCE_PAGE_MIN_COVERAGE_CHARS
