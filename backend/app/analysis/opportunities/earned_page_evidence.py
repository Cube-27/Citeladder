"""What one inspected third-party page offers the earned-page detector.

Pure value types. Nothing here reads a database, fetches anything or scores.

Two separations in these shapes are the whole point of the feature and are
easy to lose by adding one convenient field.

Verified presence versus answer co-occurrence
    ``entities`` are verdicts about THIS PAGE, each requiring a snapshot and
    a quoted passage to be positive. ``answer_competitors`` are names that
    appeared somewhere in an answer that happened to cite this page. The
    second is descriptive only; the detector never scores on it, because a
    competitor named in prose says nothing about the publisher's page.

Page state versus entity verdict
    ``inspection_state`` says whether anybody read the page. A page nobody
    read carries no verdicts at all, so "not detected" can never be inferred
    from silence.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    ENTITY_KIND_COMPETITOR,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PRESENT,
)


@dataclass(frozen=True, slots=True)
class PageEntityEvidence:
    """One tracked entity's verdict on one inspected page."""

    entity_kind: str
    entity_name: str
    presence: str
    match_method: str
    match_count: int = 0
    # Short self-contained quoted windows. Empty for anything but a positive
    # finding, because no passage can demonstrate an absence.
    passages: tuple[str, ...] = ()

    @property
    def is_present(self) -> bool:
        """Verified presence only. ``ambiguous`` and ``partial`` are neither.

        An ambiguous match was found in normalized text whose offsets cannot
        produce a quotable window, and a partial verdict means too little of
        the page was read to judge. Counting either as presence is how an
        extraction limitation becomes a confident claim.
        """
        return self.presence == PRESENCE_PRESENT

    @property
    def is_absent(self) -> bool:
        return self.presence == PRESENCE_NOT_DETECTED


@dataclass(frozen=True, slots=True)
class PriorPageEvidence:
    """The snapshot before the current one, when there is a usable one.

    Only what a deterioration comparison needs. Without a prior snapshot there
    is nothing to deteriorate FROM, and a first inspection that finds no brand
    is an absence, not a loss.
    """

    snapshot_id: str
    brand_present: bool
    brand_match_count: int
    present_competitors: tuple[str, ...]
    content_hash: str | None = None


@dataclass(frozen=True, slots=True)
class SourcePageEvidence:
    """One externally cited page, as the detector sees it."""

    url_hash: str
    canonical_url: str
    registrable_domain: str
    page_format: str
    page_format_method: str | None
    inspection_state: str
    inspection_reason: str | None
    # Snapshot-derived. ``None`` when nobody has read this page.
    snapshot_id: str | None
    extracted_chars: int
    sufficient_coverage: bool
    title: str
    headings: tuple[str, ...]
    outbound_domains: tuple[str, ...]
    content_hash: str | None
    entities: tuple[PageEntityEvidence, ...]
    prior: PriorPageEvidence | None
    # Whether the verdicts above were judged against the roster in force now.
    # A roster or alias change invalidates them rather than ageing them.
    roster_current: bool
    source_class: str | None = None
    # Project-wide scheduling counter. Ranks candidates; never a citation count.
    recurrence_count: int = 0
    # Observed in THIS audit's eligible answers.
    answer_count: int = 0
    prompt_indices: tuple[int, ...] = ()
    themes: tuple[str, ...] = ()
    analysis_ids: tuple[str, ...] = ()
    # Descriptive evidence only; deliberately never a scoring input.
    answer_competitors: tuple[str, ...] = ()
    # A human asked for this page specifically.
    requested: bool = False

    @property
    def brand(self) -> PageEntityEvidence | None:
        return next(
            (e for e in self.entities if e.entity_kind == ENTITY_KIND_BRAND), None
        )

    @property
    def present_competitors(self) -> tuple[PageEntityEvidence, ...]:
        return tuple(
            e
            for e in self.entities
            if e.entity_kind == ENTITY_KIND_COMPETITOR and e.is_present
        )


@dataclass(frozen=True, slots=True)
class EarnedPageEvidence:
    """The page slice one audit offers the earned-page detector."""

    pages: tuple[SourcePageEvidence, ...]
    # Reviewed, human-authoritative brand facts a correction can cite.
    owned_domains: tuple[str, ...]
    brand_name: str
    # Analyzed answers this audit could have cited a page from. The denominator
    # of the recurrence factor, and the reason it is a rate rather than a count.
    eligible_answers: int
    # Inspection coverage, disclosed beside every finding: a page nobody read
    # is absent from the verdicts, not evidence of a clean publisher.
    inspected_pages: int = 0
    total_pages: int = 0
