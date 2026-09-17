"""Linking a cited page in Sources to the action it produced, if any.

The Sources inventory and the Opportunities catalog describe the same page
from two directions: one lists what the engines cited, the other lists what a
person could do about it. Without a link between them a reader who finds a
suspicious publisher page in Sources has to go and search for its task by
name.

Strictly a read over persisted rows. It never inspects, never enqueues and
never creates a page record -- a cited URL nobody has inspected simply carries
no page identity and no action, which is the honest answer.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.earned_actions import EARNED_PAGE_TARGET_PREFIX
from app.domain.analysis.schemas import SourceRow
from app.models.analysis import Citation
from app.models.opportunity import Opportunity
from app.models.source_pages import SourcePage

__all__ = ["attach_page_links"]


async def _identities(
    session: AsyncSession, *, workspace_id: uuid.UUID, urls: list[str]
) -> dict[str, str]:
    """``url -> url_hash`` for the citations behind the loaded rows.

    Read from the citations rather than recomputed, so the identity shown is
    the one that was actually derived and recorded -- including a provider's
    redirect token that resolved to a publisher page under a different URL.
    """
    rows = await session.execute(
        select(Citation.url, Citation.url_hash).where(
            Citation.workspace_id == workspace_id,
            Citation.url.in_(urls),
            Citation.url_hash.is_not(None),
        )
    )
    return {str(url): str(url_hash) for url, url_hash in rows.all()}


async def _actions(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    url_hashes: list[str],
) -> dict[str, uuid.UUID]:
    """The live page-keyed Opportunity for each identity, where one exists.

    One page yields at most one task, so the first row per key is the row.
    Ordered by priority so that if a future rule set ever produces two, the
    link goes to the one a reader should act on first rather than to an
    arbitrary one.
    """
    if not url_hashes:
        return {}
    keys = [f"{EARNED_PAGE_TARGET_PREFIX}{value}" for value in url_hashes]
    rows = await session.execute(
        select(Opportunity.target_key, Opportunity.id)
        .where(
            Opportunity.workspace_id == workspace_id,
            Opportunity.project_id == project_id,
            Opportunity.superseded_at.is_(None),
            Opportunity.target_key.in_(keys),
        )
        .order_by(Opportunity.priority_score.desc(), Opportunity.id.asc())
    )
    found: dict[str, uuid.UUID] = {}
    prefix = len(EARNED_PAGE_TARGET_PREFIX)
    for target_key, opportunity_id in rows.all():
        found.setdefault(str(target_key)[prefix:], opportunity_id)
    return found


async def attach_page_links(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    items: list[SourceRow],
) -> None:
    """Fill ``url_hash`` and ``opportunity_id`` on page rows, in place.

    Only meaningful when Sources is showing PAGES (a domain is selected);
    a domain row's key is a hostname and has no page identity, so it is left
    alone rather than matched against something that looks like a URL.
    """
    urls = [row.key for row in items if row.key.startswith(("http://", "https://"))]
    if not urls:
        return
    identities = await _identities(session, workspace_id=workspace_id, urls=urls)
    if not identities:
        return
    known = await _known_pages(
        session, project_id=project_id, url_hashes=sorted(set(identities.values()))
    )
    actions = await _actions(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        url_hashes=sorted(known),
    )
    for row in items:
        url_hash = identities.get(row.key)
        # Only an identity this PROJECT has a page record for. A hash from
        # another project's citations would address a page this reader is not
        # entitled to open.
        if url_hash is None or url_hash not in known:
            continue
        row.url_hash = url_hash
        row.opportunity_id = actions.get(url_hash)


async def _known_pages(
    session: AsyncSession, *, project_id: uuid.UUID, url_hashes: list[str]
) -> set[str]:
    if not url_hashes:
        return set()
    rows = await session.scalars(
        select(SourcePage.url_hash).where(
            SourcePage.project_id == project_id,
            SourcePage.url_hash.in_(url_hashes),
        )
    )
    return {str(value) for value in rows.all()}
