"""Which live action, if any, stands behind a cited page.

Owned here rather than by the Sources projection that asks the question,
because both halves of the answer are this module's vocabulary: what a page
target key looks like, and what makes a row live. A reader elsewhere
reconstructing either would have to be found and changed when either moves.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.earned_actions import EARNED_PAGE_TARGET_PREFIX
from app.models.opportunity import Opportunity
from app.models.source_pages import SourcePage

__all__ = ["PageAction", "live_page_opportunities"]


@dataclass(frozen=True, slots=True)
class PageAction:
    """What this project knows about one cited page, for a linking reader.

    Absence from the result and a ``None`` ``opportunity_id`` are different
    answers: the first means no record of the page exists here, the second
    that one does and no rule has acted on it. A reader that cannot tell them
    apart reports an uninspected page as one with nothing wrong.
    """

    inspection_state: str
    opportunity_id: uuid.UUID | None
    # What the live action IS, for a reader who should not have to open the
    # drawer to find out. Null exactly when ``opportunity_id`` is null.
    rule_id: str | None = None
    status: str | None = None
    title: str | None = None


async def live_page_opportunities(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    url_hashes: list[str],
) -> dict[str, PageAction]:
    """Page identities this project knows, mapped to their live action.

    A hash absent from the result is a page this project has no record for;
    one mapped to ``None`` is a page it knows and no rule has acted on. The
    two are different answers and the caller renders them differently.

    Left join in one statement: the pages and their actions are the same
    question, and asking it twice serialized two round trips on a read path.
    Every status is included -- a dismissed or resolved action is still the
    action for that page, and hiding it would make "no action yet" a lie.
    """
    if not url_hashes:
        return {}
    # The key is built in SQL from the page's own identity, so the join is
    # the same equality the partial unique index enforces rather than a list
    # of keys assembled in Python and kept in step by hand.
    page_key = literal(EARNED_PAGE_TARGET_PREFIX).concat(SourcePage.url_hash)
    rows = await session.execute(
        select(
            SourcePage.url_hash,
            SourcePage.inspection_state,
            Opportunity.id,
            Opportunity.rule_id,
            Opportunity.status,
            Opportunity.title,
        )
        .outerjoin(
            Opportunity,
            (Opportunity.target_key == page_key)
            & (Opportunity.workspace_id == workspace_id)
            & (Opportunity.project_id == SourcePage.project_id)
            & (Opportunity.superseded_at.is_(None)),
        )
        .where(
            SourcePage.project_id == project_id,
            SourcePage.url_hash.in_(sorted(url_hashes)),
        )
        .order_by(
            SourcePage.url_hash.asc(),
            Opportunity.priority_score.desc().nullslast(),
        )
    )
    found: dict[str, PageAction] = {}
    for url_hash, state, opportunity_id, rule_id, status, title in rows.all():
        # Ordered by descending priority, so the first row per page is the
        # one a reader should act on first if a future rule set ever emits
        # two for one page.
        found.setdefault(
            str(url_hash),
            PageAction(
                inspection_state=str(state),
                opportunity_id=opportunity_id,
                # Off the same row as the id. The outer join makes these NULL
                # together, so a page can never be shown an action's name
                # beside another action's identity.
                rule_id=rule_id,
                status=status,
                title=title,
            ),
        )
    return found
