"""Where competitors are cited on somebody else's page and the brand is not.

One question, answered on one screen, grouped by the KIND of source: editorial
outlets, review marketplaces, communities, social. Everything it needs is
already persisted by the inspector; this module groups it.

Pure read. It never fetches, never enqueues and never repairs.

Three things here are load-bearing.

It reuses the one resolver.
    ``projection.entity_state`` decides what a reader is told about a brand or
    a competitor on a page, from the page's state AND the presence row. This
    module never re-derives that. A page nobody has inspected reports as
    ``not_inspected`` and is counted separately from the pages that were read,
    because an unread page is not a clean page.

A positive claim carries its quote.
    A competitor is only reported as present on a page when a passage from
    that page's snapshot says so. An absence carries the extraction coverage
    and the matching method instead, because no passage can prove one.

Answer-level co-occurrence is not on-page presence.
    Nothing here reads competitor names out of answer prose. Every name in a
    group comes from a verdict about the page itself, which is the whole
    reason the page-keyed detector exists.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    ENTITY_KIND_COMPETITOR,
    INSPECTION_BLOCKED,
    INSPECTION_INSPECTED,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PRESENT,
    SOURCE_PAGE_ANALYSIS_MAX_COMPETITORS,
    SOURCE_PAGE_ANALYSIS_MAX_PAGES,
    SOURCE_PAGE_ANALYSIS_MAX_PASSAGES,
    SOURCE_PAGE_ANALYSIS_MAX_PER_CLASS,
)
from app.core.config.source_patterns import (
    SOURCE_CLASS_ORDER,
    SOURCE_CLASS_OTHER_THIRD_PARTY,
)
from app.domain.opportunities.page_links import PageAction, live_page_opportunities
from app.domain.source_pages.projection import (
    EntityView,
    entity_state,
    entity_view,
    page_limitations,
    page_title,
    presence_rows,
)
from app.models.analysis import Citation
from app.models.audit import Audit
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)

__all__ = ["CompetitorAnalysisView", "SourceClassGroup", "get_competitor_analysis"]


@dataclass(frozen=True, slots=True)
class CompetitorPageView:
    """One cited page a reader should look at, and the proof that they should.

    Every page here was READ: a gap needs a brand verdict, which only an
    inspected page has. So the page's own inspection state is a constant on
    this shape and is deliberately absent -- the counts beside the group are
    where a reader learns what was not read.
    """

    url_hash: str
    canonical_url: str
    registrable_domain: str
    page_format: str
    title: str
    extracted_chars: int
    # Distinct analyzed answers in this project that cited this page. NOT
    # ``recurrence_count``, which is a scheduling value for admission and is
    # never a measurement a reader is shown.
    answers_citing: int
    # What the brand's own verdict is on this page, through the one resolver.
    brand_state: str
    brand_match_method: str | None
    competitors: tuple[EntityView, ...]
    opportunity_id: uuid.UUID | None
    opportunity_title: str | None
    limitations: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class SourceClassGroup:
    """One kind of source, and what it costs the brand to be missing from it."""

    source_class: str
    pages_total: int
    pages_inspected: int
    pages_not_inspected: int
    pages_blocked: int
    # Pages in this class where a competitor is on the page and the brand is
    # not. The headline number, and the length of ``pages`` before truncation.
    gap_pages: int
    pages: tuple[CompetitorPageView, ...]
    truncated: bool


@dataclass(frozen=True, slots=True)
class CompetitorAnalysisView:
    pages_total: int
    pages_inspected: int
    pages_not_inspected: int
    gap_pages: int
    groups: tuple[SourceClassGroup, ...]
    limitations: tuple[str, ...]
    truncated: bool


def _class_of(page: SourcePage) -> str:
    """Which group a page belongs to. An unclassified publisher is its own."""
    return page.source_class or SOURCE_CLASS_OTHER_THIRD_PARTY


async def _pages(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> list[SourcePage]:
    """This project's cited inventory, most-recurrent first and bounded."""
    return list(
        (
            await session.scalars(
                select(SourcePage)
                .where(
                    SourcePage.workspace_id == workspace_id,
                    SourcePage.project_id == project_id,
                )
                .order_by(
                    SourcePage.recurrence_count.desc(),
                    SourcePage.url_hash.asc(),
                )
                .limit(SOURCE_PAGE_ANALYSIS_MAX_PAGES + 1)
            )
        ).all()
    )


async def _snapshots(
    session: AsyncSession,
    *,
    project_id: uuid.UUID,
    pages: list[SourcePage],
) -> dict[uuid.UUID, SourcePageSnapshot]:
    """Each page's LATEST snapshot, keyed by page id.

    Scoped by project as well as by id: the pointer alone does not prove the
    snapshot belongs to this tenant, and a mismatched row would surface
    someone else's evidence under this URL.
    """
    ids = [page.latest_snapshot_id for page in pages if page.latest_snapshot_id]
    if not ids:
        return {}
    rows = (
        await session.scalars(
            select(SourcePageSnapshot).where(
                SourcePageSnapshot.id.in_(ids),
                SourcePageSnapshot.project_id == project_id,
            )
        )
    ).all()
    return {row.source_page_id: row for row in rows}


async def _answers_citing(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    url_hashes: list[str],
) -> dict[str, int]:
    """Distinct analyzed answers in this project that cited each page.

    Joined to ``audits`` for the project scope because ``citations`` carries
    no ``project_id``; it is written during analysis, long before any page
    record exists. Counting without that join would report another project's
    answers under this project's page.
    """
    if not url_hashes:
        return {}
    rows = await session.execute(
        select(
            Citation.url_hash,
            func.count(func.distinct(Citation.analysis_id)),
        )
        .join(Audit, Audit.id == Citation.audit_id)
        .where(
            Citation.workspace_id == workspace_id,
            Audit.project_id == project_id,
            Citation.url_hash.in_(url_hashes),
        )
        .group_by(Citation.url_hash)
    )
    return {str(url_hash): int(count or 0) for url_hash, count in rows.all()}


@dataclass(frozen=True, slots=True)
class _Reading:
    """One page's verdicts, already resolved through the shared vocabulary."""

    brand: EntityView | None
    competitors: tuple[EntityView, ...]

    @property
    def present_competitors(self) -> tuple[EntityView, ...]:
        """Present AND quotable. A name without its line is not a finding.

        ``entity_view`` has already resolved each verdict's passage refs
        against the snapshot, so a verdict whose refs pointed at nothing has
        an empty ``passages`` here. Reporting it anyway would put a rival's
        name on screen under a heading promising the line that proves it,
        with no line -- which is the claim this whole surface exists to stop
        making.
        """
        return tuple(
            row
            for row in self.competitors
            if row.state == PRESENCE_PRESENT and row.passages
        )

    @property
    def brand_missing(self) -> bool:
        """The brand was looked for on a page that was read, and not found.

        Deliberately NOT "the brand is not present". ``ambiguous`` and
        ``partial`` mean the reading could not settle where the brand stands,
        and a page nobody read has no verdict at all. Listing either as a gap
        would print "you are not on this page" over a reading that never said
        so -- the same overclaim as reporting an unread page as an absence.
        """
        return self.brand is not None and self.brand.state == PRESENCE_NOT_DETECTED


def _reading(
    page: SourcePage,
    snapshot: SourcePageSnapshot | None,
    rows: list[SourcePageEntityPresence],
) -> _Reading:
    views = [
        entity_view(page, snapshot, row, max_passages=SOURCE_PAGE_ANALYSIS_MAX_PASSAGES)
        for row in rows
    ]
    return _Reading(
        brand=next((v for v in views if v.entity_kind == ENTITY_KIND_BRAND), None),
        competitors=tuple(v for v in views if v.entity_kind == ENTITY_KIND_COMPETITOR),
    )


def _page_view(
    page: SourcePage,
    *,
    snapshot: SourcePageSnapshot | None,
    reading: _Reading,
    answers: int,
    action: PageAction | None,
) -> CompetitorPageView:
    return CompetitorPageView(
        url_hash=page.url_hash,
        canonical_url=page.canonical_url,
        registrable_domain=page.registrable_domain,
        page_format=page.page_format,
        title=page_title(snapshot),
        extracted_chars=snapshot.extracted_chars if snapshot else 0,
        answers_citing=answers,
        brand_state=reading.brand.state if reading.brand else entity_state(page, None),
        brand_match_method=reading.brand.match_method if reading.brand else None,
        competitors=reading.present_competitors[:SOURCE_PAGE_ANALYSIS_MAX_COMPETITORS],
        opportunity_id=action.opportunity_id if action else None,
        opportunity_title=action.title if action else None,
        limitations=page_limitations(page, snapshot),
    )


def _rank(view: CompetitorPageView) -> tuple:
    """Worst first: most rivals on the page, then most answers citing it."""
    return (
        -len(view.competitors),
        -view.answers_citing,
        view.registrable_domain,
        view.url_hash,
    )


def _group(
    source_class: str,
    pages: list[SourcePage],
    gaps: list[CompetitorPageView],
) -> SourceClassGroup:
    """One class's counts, derived from its pages rather than accumulated.

    Counting alongside the loop meant a second, mutable picture of the same
    list that had to be kept in step by hand: a new inspection state needed a
    counter, a branch, a field and a line in the freeze, and forgetting one
    produced numbers that quietly disagreed with the rows beneath them.
    """
    ranked = sorted(gaps, key=_rank)
    states = [page.inspection_state for page in pages]
    inspected = states.count(INSPECTION_INSPECTED)
    blocked = states.count(INSPECTION_BLOCKED)
    return SourceClassGroup(
        source_class=source_class,
        pages_total=len(pages),
        pages_inspected=inspected,
        # Everything without a current reading, DERIVED rather than counted
        # per state. Counting only ``not_inspected`` left queued, failed and
        # stale pages in the total and in none of the three buckets, so the
        # numbers under a group did not add up to it -- and a new state would
        # silently vanish the same way.
        pages_not_inspected=len(pages) - inspected - blocked,
        pages_blocked=blocked,
        gap_pages=len(ranked),
        pages=tuple(ranked[:SOURCE_PAGE_ANALYSIS_MAX_PER_CLASS]),
        truncated=len(ranked) > SOURCE_PAGE_ANALYSIS_MAX_PER_CLASS,
    )


def _ordered(
    by_class: dict[str, list[SourcePage]],
    gaps: dict[str, list[CompetitorPageView]],
) -> tuple[SourceClassGroup, ...]:
    """Classes in the taxonomy's own order, with unknown ones after it.

    Ordering by gap count instead would reshuffle the axis every time a page
    was inspected, so a reader could not learn where to look.
    """
    known = [name for name in SOURCE_CLASS_ORDER if name in by_class]
    rest = sorted(name for name in by_class if name not in SOURCE_CLASS_ORDER)
    return tuple(
        _group(name, by_class[name], gaps.get(name, [])) for name in [*known, *rest]
    )


def _limitations(*, inspected: int, total: int, truncated: bool) -> tuple[str, ...]:
    """What this reader should not conclude from what they are seeing."""
    notes: list[str] = []
    if total == 0:
        return ()
    if inspected < total:
        notes.append(
            f"{inspected} of {total} cited pages have been inspected. The rest are"
            " inventory, not findings: nobody has read them, so nobody can say"
            " who appears on them."
        )
    if truncated:
        notes.append(
            f"Only the {SOURCE_PAGE_ANALYSIS_MAX_PAGES} most recurrent cited pages"
            " were read for this view."
        )
    notes.append(
        "Competitors listed here were found ON the page, each with the line that"
        " proves it. Competitors merely named in an answer are a different fact"
        " and are not counted here."
    )
    return tuple(notes)


async def get_competitor_analysis(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
) -> CompetitorAnalysisView:
    """Group this project's cited pages by source class and find the gaps."""
    rows = await _pages(session, workspace_id=workspace_id, project_id=project_id)
    truncated = len(rows) > SOURCE_PAGE_ANALYSIS_MAX_PAGES
    pages = rows[:SOURCE_PAGE_ANALYSIS_MAX_PAGES]
    snapshots = await _snapshots(session, project_id=project_id, pages=pages)
    presences = await presence_rows(
        session,
        project_id=project_id,
        snapshot_ids=[row.id for row in snapshots.values()],
    )
    url_hashes = [page.url_hash for page in pages]
    answers = await _answers_citing(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        url_hashes=url_hashes,
    )
    actions = await live_page_opportunities(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        url_hashes=url_hashes,
    )

    by_class: dict[str, list[SourcePage]] = {}
    gaps: dict[str, list[CompetitorPageView]] = {}
    for page in pages:
        source_class = _class_of(page)
        by_class.setdefault(source_class, []).append(page)
        snapshot = snapshots.get(page.id)
        reading = _reading(
            page, snapshot, presences.get(snapshot.id, []) if snapshot else []
        )
        # A gap needs BOTH halves: somebody else is on this page, and we were
        # looked for and not found. Either half alone is inventory.
        if not (reading.present_competitors and reading.brand_missing):
            continue
        gaps.setdefault(source_class, []).append(
            _page_view(
                page,
                snapshot=snapshot,
                reading=reading,
                answers=answers.get(page.url_hash, 0),
                action=actions.get(page.url_hash),
            )
        )
    groups = _ordered(by_class, gaps)
    inspected = sum(group.pages_inspected for group in groups)
    return CompetitorAnalysisView(
        pages_total=len(pages),
        pages_inspected=inspected,
        pages_not_inspected=sum(group.pages_not_inspected for group in groups),
        gap_pages=sum(group.gap_pages for group in groups),
        groups=groups,
        limitations=_limitations(
            inspected=inspected, total=len(pages), truncated=truncated
        ),
        truncated=truncated,
    )
