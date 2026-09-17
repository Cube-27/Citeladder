"""Which brands were named in the answers that cited each page.

Co-occurrence, and nothing stronger. A mention is persisted against the
RESPONSE -- ``BrandMention`` and ``CompetitorMention`` carry an ``analysis_id``
and no citation reference at all -- so "this brand was mentioned because of
this source" is a fact the schema cannot express. What it can say is that a
brand was named in an answer that cited this page, which is what every field
here is named for.

Presenting this as presence ON the page would be the mistake, and it is an easy
one to make: the page detail carries a real, inspected presence verdict for the
same brands, and the two would look identical in a table. They are not the same
fact, and only one of them survives the page being rewritten.

Attached to the loaded page only. The rows are paginated, so this reads the
URLs actually on screen rather than the whole selection.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.analysis.schemas import SourceRow, SourceRowBrand
from app.models.analysis import BrandMention, Citation, CompetitorMention

__all__ = ["attach_row_mentions"]

# Chips a cell can carry before it stops being a cell. The rest are counted
# into the overflow the table renders as "+N".
SOURCE_ROW_MAX_BRANDS = 3


async def attach_row_mentions(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    scope,
    items: list[SourceRow],
) -> None:
    """Fill ``mentions`` and ``brands`` on page rows, in place."""
    urls = [row.key for row in items if row.key]
    if not urls:
        return
    found: dict[str, dict[tuple[str, str], int]] = {}
    for model, kind, column in (
        (BrandMention, "brand", BrandMention.brand_name),
        (CompetitorMention, "competitor", CompetitorMention.competitor_name),
    ):
        rows = (
            await session.execute(
                select(
                    Citation.url,
                    column,
                    func.count(func.distinct(model.analysis_id)).label("responses"),
                )
                .join(scope, scope.c.analysis_id == Citation.analysis_id)
                .join(model, model.analysis_id == Citation.analysis_id)
                .where(
                    Citation.workspace_id == workspace_id,
                    Citation.url.in_(urls),
                    column != "",
                )
                .group_by(Citation.url, column)
            )
        ).all()
        for url, name, responses in rows:
            if name:
                found.setdefault(str(url), {})[(kind, str(name))] = int(responses)
    for row in items:
        named = found.get(row.key)
        if not named:
            continue
        ordered = sorted(named.items(), key=lambda item: (-item[1], item[0][1]))
        row.mentions = len(ordered)
        row.brands = [
            SourceRowBrand(kind=kind, name=name, responses=responses)
            for (kind, name), responses in ordered[:SOURCE_ROW_MAX_BRANDS]
        ]
