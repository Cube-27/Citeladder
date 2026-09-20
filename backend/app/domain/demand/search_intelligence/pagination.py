"""Stable, scope-bound keyset pagination over persisted dataset rows."""

from __future__ import annotations

import base64
import json
import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.search_intelligence import ROW_SORT_FIELDS
from app.models.search_intelligence import (
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
)


class UnsupportedSortError(ValueError):
    """The requested ordering is not supported for dataset rows."""


def _cursor_id(cursor: str, scope: list[object]) -> uuid.UUID:
    decoded = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
    if not isinstance(decoded, list) or len(decoded) != 5 or decoded[:4] != scope:
        raise ValueError("Cursor scope does not match")
    return uuid.UUID(str(decoded[4]))


async def sorted_rows(
    session: AsyncSession,
    dataset: SearchIntelligenceDataset,
    *,
    cursor: str | None,
    limit: int,
    sort: str,
    direction: str,
) -> tuple[list[SearchIntelligenceRow], str | None]:
    if sort not in ROW_SORT_FIELDS or direction not in {"asc", "desc"}:
        raise UnsupportedSortError("Unsupported dataset sort")
    column = getattr(SearchIntelligenceRow, sort)
    query = select(SearchIntelligenceRow).where(
        SearchIntelligenceRow.workspace_id == dataset.workspace_id,
        SearchIntelligenceRow.project_id == dataset.project_id,
        SearchIntelligenceRow.dataset_id == dataset.id,
    )
    scope = [str(dataset.id), sort, direction, limit]
    if cursor:
        after = _cursor_id(cursor, scope)
        anchor = await session.scalar(query.where(SearchIntelligenceRow.id == after))
        if anchor is None:
            raise ValueError("Cursor row does not exist")
        value = getattr(anchor, sort)
        tie = SearchIntelligenceRow.id > after
        if value is None:
            query = query.where(and_(column.is_(None), tie))
        else:
            beyond = column > value if direction == "asc" else column < value
            query = query.where(
                or_(beyond, and_(column == value, tie), column.is_(None))
            )
    ordering = column.asc() if direction == "asc" else column.desc()
    rows = list(
        (
            await session.scalars(
                query.order_by(ordering.nulls_last(), SearchIntelligenceRow.id).limit(
                    limit + 1
                )
            )
        ).all()
    )
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = base64.urlsafe_b64encode(
            json.dumps([*scope, str(rows[-1].id)]).encode()
        ).decode()
    return rows, next_cursor
