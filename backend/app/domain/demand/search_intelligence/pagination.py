"""Stable, scope-bound keyset pagination over persisted dataset rows."""

from __future__ import annotations

import base64
import json
import uuid
from decimal import Decimal

from sqlalchemy import Numeric, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.search_intelligence import AUXILIARY_SORT_FIELDS, ROW_SORT_FIELDS
from app.models.search_intelligence import (
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
)


class UnsupportedSortError(ValueError):
    """The requested ordering is not supported for dataset rows."""


def _cursor_id(cursor: str, scope: list[object]) -> uuid.UUID:
    decoded = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
    if (
        not isinstance(decoded, list)
        or len(decoded) != len(scope) + 1
        or decoded[:-1] != scope
    ):
        raise ValueError("Cursor scope does not match")
    return uuid.UUID(str(decoded[-1]))


async def sorted_rows(
    session: AsyncSession,
    dataset: SearchIntelligenceDataset,
    *,
    cursor: str | None,
    limit: int,
    sort: str,
    direction: str,
    search: str = "",
    min_volume: int | None = None,
    intent: str = "",
) -> tuple[list[SearchIntelligenceRow], str | None]:
    if sort not in ROW_SORT_FIELDS | AUXILIARY_SORT_FIELDS or direction not in {
        "asc",
        "desc",
    }:
        raise UnsupportedSortError("Unsupported dataset sort")
    column = (
        cast(SearchIntelligenceRow.auxiliary[sort].astext, Numeric)
        if sort in AUXILIARY_SORT_FIELDS
        else getattr(SearchIntelligenceRow, sort)
    )
    query = filtered_query(dataset, search, min_volume, intent)
    scope = [
        str(dataset.workspace_id),
        str(dataset.project_id),
        str(dataset.id),
        sort,
        direction,
        limit,
        search,
        min_volume,
        intent,
    ]
    if cursor:
        after = _cursor_id(cursor, scope)
        anchor = await session.scalar(query.where(SearchIntelligenceRow.id == after))
        if anchor is None:
            raise ValueError("Cursor row does not exist")
        value = _sort_value(anchor, sort)
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


def _sort_value(row: SearchIntelligenceRow, sort: str):
    if sort not in AUXILIARY_SORT_FIELDS:
        return getattr(row, sort)
    raw = (row.auxiliary or {}).get(sort)
    return Decimal(str(raw)) if raw is not None else None


def filtered_query(
    dataset: SearchIntelligenceDataset, search: str, min_volume: int | None, intent: str
):
    query = select(SearchIntelligenceRow).where(
        SearchIntelligenceRow.workspace_id == dataset.workspace_id,
        SearchIntelligenceRow.project_id == dataset.project_id,
        SearchIntelligenceRow.dataset_id == dataset.id,
    )
    if search:
        query = query.where(
            or_(
                *(
                    column.icontains(search, autoescape=True)
                    for column in (
                        SearchIntelligenceRow.keyword,
                        SearchIntelligenceRow.domain,
                        SearchIntelligenceRow.url,
                        SearchIntelligenceRow.intent,
                    )
                )
            )
        )
    if min_volume is not None:
        query = query.where(SearchIntelligenceRow.search_volume >= min_volume)
    if intent:
        query = query.where(SearchIntelligenceRow.intent == intent)
    return query


async def filtered_count(
    session: AsyncSession,
    dataset: SearchIntelligenceDataset,
    search: str,
    min_volume: int | None,
    intent: str,
) -> int:
    return (
        await session.scalar(
            select(func.count()).select_from(
                filtered_query(dataset, search, min_volume, intent).subquery()
            )
        )
        or 0
    )
