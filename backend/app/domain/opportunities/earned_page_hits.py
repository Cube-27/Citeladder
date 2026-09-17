"""Assembling the page evidence the earned-page detector reads.

Reads persisted rows only. Nothing here fetches, inspects or scores; it turns
what the inspector already committed into the frozen bundle the pure detector
consumes.

The answer set matters more than it looks. ``build_source_projection`` filters
to prompts already classified as brand-absence gaps, which is precisely what
makes correction and defence unreachable: a page where the brand is present
but wrongly described, or present and losing ground, is never in scope. This
loader reads every eligible analyzed answer in the audit instead.

Presence verdicts are read from the snapshot they were taken on and compared
against the roster in force NOW. A roster or alias change invalidates them
rather than ageing them, because re-judging retained text is not possible --
the text is not retained.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.opportunities.detectors import DetectorHit, VisibilityEvidence
from app.analysis.opportunities.earned_page_evidence import (
    EarnedPageEvidence,
    PageEntityEvidence,
    PriorPageEvidence,
    SourcePageEvidence,
)
from app.analysis.opportunities.earned_pages import detect_earned_page_opportunities
from app.core.config.earned_actions import EARNED_PAGE_DETECTOR_MAX_PAGES
from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    INSPECTION_INSPECTED,
    SOURCE_PAGE_MIN_COVERAGE_CHARS,
)
from app.domain.source_pages.persistence import OUTCOME_INSPECTED
from app.domain.source_pages.roster import project_roster
from app.models.analysis import Citation
from app.models.audit import Audit
from app.models.brand import OwnedDomain
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)

__all__ = ["load_earned_page_hits"]

# Latest plus the one before it. Deterioration compares against the last
# usable snapshot, so a third would be read and never used.
_SNAPSHOTS_PER_PAGE = 2


async def _cited_by_hash(
    session: AsyncSession, *, workspace_id: uuid.UUID, audit: Audit
) -> dict[str, set[uuid.UUID]]:
    """Which analyses in this audit cited each identified page.

    Grouped by ``url_hash`` rather than by raw URL: some providers cite
    through a redirect, so the raw token is not a page identity. A citation
    whose identity was never established is absent here, which is the honest
    state -- not a page of its own.
    """
    rows = await session.execute(
        select(Citation.url_hash, Citation.analysis_id).where(
            Citation.workspace_id == workspace_id,
            Citation.audit_id == audit.id,
            Citation.url_hash.is_not(None),
            Citation.is_owned.is_(False),
        )
    )
    grouped: dict[str, set[uuid.UUID]] = {}
    for url_hash, analysis_id in rows.all():
        grouped.setdefault(str(url_hash), set()).add(analysis_id)
    return grouped


async def _pages(
    session: AsyncSession,
    *,
    project_id: uuid.UUID,
    url_hashes: list[str],
) -> list[SourcePage]:
    if not url_hashes:
        return []
    return list(
        (
            await session.scalars(
                select(SourcePage)
                .where(
                    SourcePage.project_id == project_id,
                    SourcePage.url_hash.in_(url_hashes),
                )
                .order_by(
                    SourcePage.recurrence_count.desc(),
                    SourcePage.url_hash.asc(),
                )
                .limit(EARNED_PAGE_DETECTOR_MAX_PAGES)
            )
        ).all()
    )


async def _snapshots(
    session: AsyncSession, *, project_id: uuid.UUID, page_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[SourcePageSnapshot]]:
    """The two most recent successful readings of each page, newest first.

    Only successful ones: a blocked or failed attempt is a fact about the
    fetch, not a reading of the page, and comparing a placement against one
    would report every outage as a lost listing.
    """
    if not page_ids:
        return {}
    ranked = (
        select(
            SourcePageSnapshot.id.label("id"),
            func.row_number()
            .over(
                partition_by=SourcePageSnapshot.source_page_id,
                order_by=(
                    SourcePageSnapshot.fetched_at.desc(),
                    SourcePageSnapshot.id.desc(),
                ),
            )
            .label("rank"),
        )
        .where(
            SourcePageSnapshot.project_id == project_id,
            SourcePageSnapshot.source_page_id.in_(page_ids),
            SourcePageSnapshot.outcome == OUTCOME_INSPECTED,
        )
        .subquery()
    )
    rows = list(
        (
            await session.scalars(
                select(SourcePageSnapshot)
                .join(ranked, ranked.c.id == SourcePageSnapshot.id)
                .where(ranked.c.rank <= _SNAPSHOTS_PER_PAGE)
                .order_by(
                    SourcePageSnapshot.source_page_id.asc(),
                    SourcePageSnapshot.fetched_at.desc(),
                    SourcePageSnapshot.id.desc(),
                )
            )
        ).all()
    )
    grouped: dict[uuid.UUID, list[SourcePageSnapshot]] = {}
    for row in rows:
        grouped.setdefault(row.source_page_id, []).append(row)
    return grouped


async def _presences(
    session: AsyncSession, *, project_id: uuid.UUID, snapshot_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[SourcePageEntityPresence]]:
    if not snapshot_ids:
        return {}
    rows = list(
        (
            await session.scalars(
                select(SourcePageEntityPresence)
                .where(
                    SourcePageEntityPresence.project_id == project_id,
                    SourcePageEntityPresence.snapshot_id.in_(snapshot_ids),
                )
                .order_by(
                    SourcePageEntityPresence.entity_kind != ENTITY_KIND_BRAND,
                    SourcePageEntityPresence.entity_name.asc(),
                )
            )
        ).all()
    )
    grouped: dict[uuid.UUID, list[SourcePageEntityPresence]] = {}
    for row in rows:
        grouped.setdefault(row.snapshot_id, []).append(row)
    return grouped


def _passages(snapshot: SourcePageSnapshot, refs: list | None) -> tuple[str, ...]:
    """The quoted windows behind one verdict, resolved from the snapshot."""
    rows = snapshot.evidence_passages or []
    out: list[str] = []
    for index in refs or []:
        if isinstance(index, int) and 0 <= index < len(rows):
            text = str((rows[index] or {}).get("text") or "").strip()
            if text:
                out.append(text)
    return tuple(out)


def _entities(
    snapshot: SourcePageSnapshot, rows: list[SourcePageEntityPresence]
) -> tuple[PageEntityEvidence, ...]:
    return tuple(
        PageEntityEvidence(
            entity_kind=row.entity_kind,
            entity_name=row.entity_name,
            presence=row.presence,
            match_method=row.match_method,
            match_count=row.match_count,
            passages=_passages(snapshot, row.passage_refs),
        )
        for row in rows
    )


def _prior(
    snapshot: SourcePageSnapshot | None, rows: list[SourcePageEntityPresence]
) -> PriorPageEvidence | None:
    if snapshot is None:
        return None
    entities = _entities(snapshot, rows)
    brand = next(
        (item for item in entities if item.entity_kind == ENTITY_KIND_BRAND), None
    )
    return PriorPageEvidence(
        snapshot_id=str(snapshot.id),
        brand_present=bool(brand and brand.is_present),
        brand_match_count=brand.match_count if brand else 0,
        present_competitors=tuple(
            item.entity_name
            for item in entities
            if item.entity_kind != ENTITY_KIND_BRAND and item.is_present
        ),
        content_hash=snapshot.content_hash,
    )


def _answer_context(
    visibility: VisibilityEvidence, analysis_ids: set[uuid.UUID]
) -> tuple[tuple[int, ...], tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """Prompts, themes, analysis ids and answer-level competitor names.

    The competitor names are carried for DISPLAY. They attach every name in an
    answer to every page that answer cited, which is why they are excluded
    from the priority and labelled in the brief.
    """
    themes = {row.prompt_index: row.theme for row in visibility.prompt_snapshots}
    selected = [row for row in visibility.analyses if row.analysis_id in analysis_ids]
    return (
        tuple(sorted({row.prompt_index for row in selected})),
        tuple(
            sorted(
                {theme for row in selected if (theme := themes.get(row.prompt_index))}
            )
        ),
        tuple(sorted(str(row.analysis_id) for row in selected)),
        tuple(sorted({name for row in selected for name in row.competitor_names})),
    )


@dataclass(frozen=True, slots=True)
class _Reading:
    """The latest successful reading of one page, flattened for assembly."""

    snapshot: SourcePageSnapshot | None
    rows: list[SourcePageEntityPresence]
    facts: dict

    @property
    def extracted_chars(self) -> int:
        return self.snapshot.extracted_chars if self.snapshot else 0

    def strings(self, key: str) -> tuple[str, ...]:
        return tuple(str(item) for item in (self.facts.get(key) or []))


def _reading(
    snapshots: list[SourcePageSnapshot],
    presences: dict[uuid.UUID, list[SourcePageEntityPresence]],
) -> _Reading:
    latest = snapshots[0] if snapshots else None
    return _Reading(
        snapshot=latest,
        rows=presences.get(latest.id, []) if latest else [],
        facts=(latest.page_facts or {}) if latest else {},
    )


def _page_evidence(
    page: SourcePage,
    *,
    snapshots: list[SourcePageSnapshot],
    presences: dict[uuid.UUID, list[SourcePageEntityPresence]],
    visibility: VisibilityEvidence,
    analysis_ids: set[uuid.UUID],
    roster_version: str,
) -> SourcePageEvidence:
    read = _reading(snapshots, presences)
    prompt_indices, themes, ids, answer_competitors = _answer_context(
        visibility, analysis_ids
    )
    return SourcePageEvidence(
        url_hash=page.url_hash,
        canonical_url=page.canonical_url,
        registrable_domain=page.registrable_domain,
        page_format=page.page_format,
        page_format_method=page.page_format_method,
        inspection_state=page.inspection_state,
        inspection_reason=page.inspection_reason,
        snapshot_id=str(read.snapshot.id) if read.snapshot else None,
        extracted_chars=read.extracted_chars,
        sufficient_coverage=(
            page.inspection_state == INSPECTION_INSPECTED
            and read.extracted_chars >= SOURCE_PAGE_MIN_COVERAGE_CHARS
        ),
        title=str(read.facts.get("title") or ""),
        headings=read.strings("headings"),
        outbound_domains=read.strings("outbound_domains"),
        content_hash=read.snapshot.content_hash if read.snapshot else None,
        entities=_entities(read.snapshot, read.rows) if read.snapshot else (),
        prior=_prior(
            snapshots[1] if len(snapshots) > 1 else None,
            presences.get(snapshots[1].id, []) if len(snapshots) > 1 else [],
        ),
        # Every verdict on this snapshot was frozen against one roster, so
        # comparing the first is comparing all of them.
        roster_current=bool(
            read.rows and read.rows[0].roster_version == roster_version
        ),
        source_class=page.source_class,
        recurrence_count=page.recurrence_count,
        answer_count=len(analysis_ids),
        prompt_indices=prompt_indices,
        themes=themes,
        analysis_ids=ids,
        answer_competitors=answer_competitors,
        requested=page.inspection_requested_at is not None,
    )


async def _coverage(session: AsyncSession, *, project_id: uuid.UUID) -> tuple[int, int]:
    """How much of this project's cited inventory has actually been read."""
    total = await session.scalar(
        select(func.count(SourcePage.id)).where(SourcePage.project_id == project_id)
    )
    inspected = await session.scalar(
        select(func.count(SourcePage.id)).where(
            SourcePage.project_id == project_id,
            SourcePage.inspection_state == INSPECTION_INSPECTED,
        )
    )
    return int(inspected or 0), int(total or 0)


async def load_earned_page_hits(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit: Audit,
    visibility: VisibilityEvidence,
) -> list[DetectorHit]:
    """Page-keyed earned hits for this audit, over its full answer set."""
    cited = await _cited_by_hash(session, workspace_id=workspace_id, audit=audit)
    pages = await _pages(session, project_id=project_id, url_hashes=sorted(cited))
    if not pages:
        return []
    snapshots = await _snapshots(
        session, project_id=project_id, page_ids=[page.id for page in pages]
    )
    presences = await _presences(
        session,
        project_id=project_id,
        snapshot_ids=[row.id for rows in snapshots.values() for row in rows],
    )
    owned_domains = list(
        (
            await session.scalars(
                select(OwnedDomain.domain)
                .where(OwnedDomain.project_id == project_id)
                .order_by(OwnedDomain.domain.asc())
            )
        ).all()
    )
    inspected_pages, total_pages = await _coverage(session, project_id=project_id)
    roster_version = project_roster(audit.configuration or {})
    evidence = EarnedPageEvidence(
        pages=tuple(
            _page_evidence(
                page,
                snapshots=snapshots.get(page.id, []),
                presences=presences,
                visibility=visibility,
                analysis_ids=cited.get(page.url_hash, set()),
                roster_version=roster_version,
            )
            for page in pages
        ),
        owned_domains=tuple(owned_domains),
        brand_name=str((audit.configuration or {}).get("brand_name") or ""),
        # Every analyzed answer in the audit, not only the ones already
        # classified as brand-absence gaps. That filter is what made
        # correction and defence structurally unreachable.
        eligible_answers=len(visibility.analyses),
        inspected_pages=inspected_pages,
        total_pages=total_pages,
    )
    return detect_earned_page_opportunities(evidence)
