"""Linking a cited page in Sources to the action it produced, if any.

The Sources inventory and the Opportunities catalog describe the same page
from two directions: one lists what the engines cited, the other lists what a
person could do about it. Without a link between them a reader who finds a
suspicious publisher page in Sources has to go and search for its task by
name.

Strictly a read over persisted rows. It never inspects, never enqueues and
never creates a page record -- a cited URL nobody has inspected simply carries
no page identity and no action, which is the honest answer. What "live action
for this page" means is the Opportunity owner's question, so this asks it
rather than reconstructing the target key here.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.analysis.schemas import SourceRow
from app.domain.opportunities.page_links import live_page_opportunities

__all__ = ["attach_page_links"]


async def attach_page_links(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    items: list[SourceRow],
) -> None:
    """Fill ``opportunity_id`` on page rows that have an action, in place.

    Only meaningful when Sources is showing PAGES (a domain is selected); a
    domain row's key is a hostname and has no page identity, so its
    ``url_hash`` was never set by the projection and it is skipped here.
    """
    identities = {row.url_hash: row for row in items if row.url_hash}
    if not identities:
        return
    actions = await live_page_opportunities(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        url_hashes=sorted(identities),
    )
    for url_hash, row in identities.items():
        # A hash this project has no page record for addresses somebody
        # else's evidence; the row keeps its identity but offers no action.
        row.opportunity_id = actions.get(url_hash)
