"""Shapes shared by third-party page extraction, presence and format.

Pure value types. Nothing here touches a database, a network or a model.

The one shape worth reading twice is :class:`EvidencePassage`. Its offsets
index text that is deliberately NOT retained, so they are provenance and
ordering only; the quoted ``text`` it carries is the whole of what a reader
will ever see.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class EvidencePassage:
    """One short quoted window showing why a claim was made.

    Self-contained on purpose. The normalized text this was cut from is
    discarded after extraction, so a passage that only stored offsets would be
    unreadable forever afterwards.
    """

    text: str
    char_start: int
    char_end: int
    entity_ref: str = ""

    def as_row(self) -> dict:
        return {
            "text": self.text,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "entity_ref": self.entity_ref,
        }


@dataclass(frozen=True, slots=True)
class ExtractedPage:
    """Bounded facts from one fetched page, plus the text they came from.

    ``text`` is the working copy used to find entities and is never persisted.
    ``extracted_chars`` is what survives, and it is what makes a non-detection
    reportable: an absence found in 80 characters of boilerplate is not the
    same claim as an absence found in 8,000 characters of prose.
    """

    title: str = ""
    meta_description: str = ""
    text: str = ""
    headings: tuple[str, ...] = ()
    structured_types: tuple[str, ...] = ()
    table_headers: tuple[tuple[str, ...], ...] = ()
    outbound_domains: tuple[str, ...] = ()
    text_truncated: bool = False
    content_hash: str = ""
    parsed: bool = False

    @property
    def extracted_chars(self) -> int:
        return len(self.text)

    def as_page_facts(self) -> dict:
        """The persisted projection. Excludes ``text`` by construction."""
        return {
            "title": self.title,
            "meta_description": self.meta_description,
            "headings": list(self.headings),
            "structured_types": list(self.structured_types),
            "table_headers": [list(headers) for headers in self.table_headers],
            "outbound_domains": list(self.outbound_domains),
            "text_truncated": self.text_truncated,
            "parsed": self.parsed,
        }


@dataclass(frozen=True, slots=True)
class EntityPresence:
    """Whether one tracked entity was found on one inspected page."""

    entity_kind: str
    entity_name: str
    presence: str
    match_method: str
    match_count: int = 0
    first_offset: int | None = None
    passage_refs: tuple[int, ...] = ()


@dataclass(frozen=True, slots=True)
class PageAssessment:
    """Everything one inspection concluded about one page."""

    page_format: str
    page_format_method: str
    presences: tuple[EntityPresence, ...] = ()
    passages: tuple[EvidencePassage, ...] = field(default_factory=tuple)
    sufficient_coverage: bool = False
