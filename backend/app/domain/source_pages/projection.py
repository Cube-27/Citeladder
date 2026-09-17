"""Reading back what is known about one externally cited page.

Pure read. It never fetches, never enqueues and never repairs; a page nobody
has inspected renders as ``not_inspected`` rather than quietly becoming a fetch.

The single resolver below is the reason page state and presence are stored
separately. Whether the brand is "absent" from a page depends on facts that
live in two places -- did anyone read it, and was the brand found -- and any
view that answers from one of them alone eventually reports an unread page as
an absence. Resolving both here means the vocabulary cannot drift between
callers.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.source_pages import (
    ENTITY_KIND_BRAND,
    INSPECTION_BLOCKED,
    INSPECTION_FAILED,
    INSPECTION_INSPECTED,
    INSPECTION_STALE,
    PRESENCE_PARTIAL,
    SOURCE_PAGE_MIN_COVERAGE_CHARS,
)
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)

# The vocabulary a reader sees. The first four come from a presence row and
# require a snapshot; the last three are properties of the page itself.
STATE_NOT_INSPECTED = "not_inspected"
STATE_BLOCKED = "blocked"
STATE_STALE = "stale"


@dataclass(frozen=True, slots=True)
class EntityView:
    entity_kind: str
    entity_name: str
    state: str
    match_method: str
    match_count: int
    passages: tuple[str, ...]
    limitations: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class SourcePageView:
    """Everything a reader may be told about one cited page."""

    id: uuid.UUID
    canonical_url: str
    registrable_domain: str
    source_class: str | None
    page_format: str
    page_format_method: str | None
    inspection_state: str
    inspection_reason: str | None
    last_inspected_at: datetime | None
    last_cited_at: datetime | None
    recurrence_count: int
    title: str
    extracted_chars: int
    entities: tuple[EntityView, ...]
    limitations: tuple[str, ...]


def _page_limitations(page: SourcePage, snapshot: SourcePageSnapshot | None) -> tuple:
    """Why this page's findings should be read with caution, if they should."""
    if page.inspection_state == INSPECTION_BLOCKED:
        return (
            "This publisher does not permit automated access, so nothing on the "
            "page has been read.",
        )
    if page.inspection_state == INSPECTION_FAILED:
        return ("The page could not be read, so who appears on it is unknown.",)
    if page.inspection_state == INSPECTION_STALE:
        return (
            "This reflects an earlier inspection; the page may have changed since.",
        )
    if page.inspection_state != INSPECTION_INSPECTED:
        return ("This page has not been inspected.",)
    if (
        snapshot is not None
        and snapshot.extracted_chars < SOURCE_PAGE_MIN_COVERAGE_CHARS
    ):
        return (
            "Very little text was readable, so an absence is not evidence that "
            "a brand is missing.",
        )
    return ()


def _entity_limitations(row: SourcePageEntityPresence) -> tuple[str, ...]:
    """A non-detection carries its own caveat; a passage speaks for itself."""
    if row.presence == PRESENCE_PARTIAL:
        return ("Not enough of the page was readable to judge this.",)
    return ()


def _passages(snapshot: SourcePageSnapshot | None, refs: list | None) -> tuple:
    rows = (snapshot.evidence_passages or []) if snapshot else []
    out: list[str] = []
    for index in refs or []:
        if isinstance(index, int) and 0 <= index < len(rows):
            text = str((rows[index] or {}).get("text") or "").strip()
            if text:
                out.append(text)
    return tuple(out)


def _state(page: SourcePage, row: SourcePageEntityPresence | None) -> str:
    """One vocabulary for "what do we know", from page state and verdict.

    A verdict is only meaningful if the page behind it was read recently
    enough. A stale or blocked page overrides whatever the last snapshot
    concluded rather than presenting it as current.
    """
    if page.inspection_state == INSPECTION_BLOCKED:
        return STATE_BLOCKED
    if page.inspection_state == INSPECTION_STALE:
        return STATE_STALE
    if row is None or page.inspection_state != INSPECTION_INSPECTED:
        return STATE_NOT_INSPECTED
    return row.presence


async def get_source_page(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    url_hash: str,
) -> SourcePageView | None:
    """Project one cited page, or ``None`` when this project has no record."""
    page = await session.scalar(
        select(SourcePage).where(
            SourcePage.workspace_id == workspace_id,
            SourcePage.project_id == project_id,
            SourcePage.url_hash == url_hash,
        )
    )
    if page is None:
        return None

    snapshot = (
        await session.get(SourcePageSnapshot, page.latest_snapshot_id)
        if page.latest_snapshot_id
        else None
    )
    rows = (
        list(
            (
                await session.scalars(
                    select(SourcePageEntityPresence)
                    .where(SourcePageEntityPresence.snapshot_id == snapshot.id)
                    .order_by(
                        SourcePageEntityPresence.entity_kind != ENTITY_KIND_BRAND,
                        SourcePageEntityPresence.entity_name,
                    )
                )
            ).all()
        )
        if snapshot is not None
        else []
    )
    entities = tuple(
        EntityView(
            entity_kind=row.entity_kind,
            entity_name=row.entity_name,
            state=_state(page, row),
            match_method=row.match_method,
            match_count=row.match_count,
            passages=_passages(snapshot, row.passage_refs),
            limitations=_entity_limitations(row),
        )
        for row in rows
    )
    return SourcePageView(
        id=page.id,
        canonical_url=page.canonical_url,
        registrable_domain=page.registrable_domain,
        source_class=page.source_class,
        page_format=page.page_format,
        page_format_method=page.page_format_method,
        inspection_state=page.inspection_state,
        inspection_reason=page.inspection_reason,
        last_inspected_at=page.last_inspected_at,
        last_cited_at=page.last_cited_at,
        recurrence_count=page.recurrence_count,
        title=str(((snapshot.page_facts or {}) if snapshot else {}).get("title") or ""),
        extracted_chars=snapshot.extracted_chars if snapshot else 0,
        entities=entities,
        limitations=_page_limitations(page, snapshot),
    )
