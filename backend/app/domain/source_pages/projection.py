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
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.source_pages import (
    INSPECTION_BLOCKED,
    INSPECTION_INSPECTED,
    INSPECTION_NOT_INSPECTED,
    INSPECTION_STALE,
)
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)

# The vocabulary a reader sees. Four values come from a presence row and
# require a snapshot; these three are properties of the page itself. Aliased
# rather than re-spelled, so the two vocabularies cannot silently diverge.
STATE_NOT_INSPECTED = INSPECTION_NOT_INSPECTED
STATE_BLOCKED = INSPECTION_BLOCKED
STATE_STALE = INSPECTION_STALE


def passage_texts(snapshot: SourcePageSnapshot | None, refs: list | None) -> tuple:
    """The quoted windows behind one verdict, resolved from its snapshot.

    Shared with the Opportunity brief rather than reimplemented there: the
    shape of ``evidence_passages`` (which index is valid, which key holds the
    text, what an empty one means) has one owner, so a reader and an action
    cannot end up quoting the same page differently.
    """
    rows = (snapshot.evidence_passages or []) if snapshot else []
    out: list[str] = []
    for index in refs or []:
        if isinstance(index, int) and 0 <= index < len(rows):
            text = str((rows[index] or {}).get("text") or "").strip()
            if text:
                out.append(text)
    return tuple(out)


def page_title(snapshot: SourcePageSnapshot | None) -> str:
    """The page's own title, or empty when nobody has read it.

    ``page_facts`` is an untyped JSON blob, so every reader that reaches into
    it by hand is a separate place a key rename has to be found. It has one
    owner, here, beside the passage reader that exists for the same reason.
    """
    return str(((snapshot.page_facts or {}) if snapshot else {}).get("title") or "")


def page_fact_strings(facts: dict | None, key: str) -> tuple[str, ...]:
    """A bounded list of strings out of ``page_facts`` -- headings, domains."""
    return tuple(str(item) for item in ((facts or {}).get(key) or []))


def entity_state(page: SourcePage, row: SourcePageEntityPresence | None) -> str:
    """One vocabulary for "what do we know", from page state and verdict.

    THE resolver. Every surface that reports whether a brand or a competitor
    is on a page goes through this function, because the answer depends on
    facts held in two rows -- did anyone read the page, and what did they find
    -- and any view that answers from one of them alone eventually reports an
    unread page as an absence.

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


@dataclass(frozen=True)
class SourcePageFacts:
    """What the Sources table shows about one cited page.

    A read over persisted rows for the URL table, kept beside the page
    projection rather than in the analysis owner: ``page_format`` and the
    page's own title belong to the page, and a second module reaching into
    ``page_facts`` by hand is a second place a key rename has to be found.
    """

    title: str
    page_format: str
    page_format_method: str | None


async def page_facts_for(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    url_hashes: Sequence[str],
) -> dict[str, SourcePageFacts]:
    """Page facts for the given identities, keyed by ``url_hash``.

    An identity with no page record is simply absent from the result. That is
    the honest answer for a URL nobody has a record of, and it is NOT the same
    as a page whose format is ``unresolved`` because nobody has read it yet.
    """
    if not url_hashes:
        return {}
    rows = (
        await session.execute(
            select(
                SourcePage.url_hash,
                SourcePage.page_format,
                SourcePage.page_format_method,
                SourcePageSnapshot.page_facts,
            )
            .outerjoin(
                SourcePageSnapshot,
                SourcePageSnapshot.id == SourcePage.latest_snapshot_id,
            )
            .where(
                SourcePage.workspace_id == workspace_id,
                SourcePage.project_id == project_id,
                SourcePage.url_hash.in_(list(url_hashes)),
            )
        )
    ).all()
    return {
        str(url_hash): SourcePageFacts(
            title=str((facts or {}).get("title") or ""),
            page_format=page_format,
            page_format_method=page_format_method,
        )
        for url_hash, page_format, page_format_method, facts in rows
    }
