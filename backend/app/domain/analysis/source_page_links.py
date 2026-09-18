"""Linking a cited page in Sources to the action it produced, if any.

The Sources inventory and the Opportunities catalog describe the same page
from two directions: one lists what the engines cited, the other lists what a
person could do about it. Without a link between them a reader who finds a
suspicious publisher page in Sources has to go and search for its task by
name.

Strictly a read over persisted rows. It never inspects, never enqueues and
never creates a page record -- a cited URL nobody has inspected simply carries
no page identity, no page facts and no action, which is the honest answer.
What "live action for this page" means is the Opportunity owner's question and
what a page IS is the page owner's, so this asks each of them rather than
reconstructing either answer here.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.analysis.schemas import SourceRow
from app.domain.opportunities.page_links import live_page_opportunities
from app.domain.source_pages.projection import page_facts_for

__all__ = ["attach_page_links"]


async def attach_page_links(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    items: list[SourceRow],
) -> None:
    """Fill the page state and action on page rows, in place.

    Only meaningful when Sources is showing PAGES (a domain is selected); a
    domain row's key is a hostname and has no page identity, so its
    ``url_hash`` was never set by the projection and it is skipped here.

    Grouped by identity rather than keyed by it: two rows are two cited URLs,
    and two URLs can canonicalize to one page -- a tracking parameter, or a
    redirect token resolved to the publisher it pointed at. Keeping one row
    per hash would leave the others silently unlinked.
    """
    identities: dict[str, list[SourceRow]] = {}
    for row in items:
        if row.url_hash:
            identities.setdefault(row.url_hash, []).append(row)
    if not identities:
        return
    hashes = sorted(identities)
    actions = await live_page_opportunities(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        url_hashes=hashes,
    )
    facts = await page_facts_for(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        url_hashes=hashes,
    )
    for url_hash, rows in identities.items():
        # A hash this project has no page record for stays unset on every
        # field: the reader is told nobody looked, not that nothing is wrong.
        action = actions.get(url_hash)
        fact = facts.get(url_hash)
        for row in rows:
            if action is not None:
                row.inspection_state = action.inspection_state
                row.opportunity_id = action.opportunity_id
            if fact is not None:
                # `last_cited_at` is deliberately NOT set here. It is a
                # measurement, and the source projection derives it from the
                # citation evidence; this table is the inspection schedule and
                # holds no record at all for a page on the project's own
                # domain. Reading it from here reported "Not measured" for
                # every owned URL.
                row.title = fact.title or None
                row.page_format = fact.page_format
                row.page_format_method = fact.page_format_method
