"""Resolve selected Search Intelligence rows into bounded Content evidence."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search_intelligence import (
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
)


class SearchIntelligenceEvidenceNotFound(LookupError):
    pass


async def search_intelligence_context(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    reference: Any | None,
) -> str:
    if reference is None:
        return ""
    dataset = await session.scalar(
        select(SearchIntelligenceDataset).where(
            SearchIntelligenceDataset.id == reference.dataset_id,
            SearchIntelligenceDataset.workspace_id == workspace_id,
            SearchIntelligenceDataset.project_id == project_id,
            SearchIntelligenceDataset.status == "published",
        )
    )
    if dataset is None:
        raise SearchIntelligenceEvidenceNotFound(
            "Search Intelligence dataset not found"
        )
    rows = list(
        (
            await session.scalars(
                select(SearchIntelligenceRow).where(
                    SearchIntelligenceRow.dataset_id == dataset.id,
                    SearchIntelligenceRow.workspace_id == workspace_id,
                    SearchIntelligenceRow.project_id == project_id,
                    SearchIntelligenceRow.id.in_(reference.row_ids),
                )
            )
        ).all()
    )
    if len(rows) != len(reference.row_ids):
        raise SearchIntelligenceEvidenceNotFound(
            "Search Intelligence evidence not found"
        )
    return _render_rows(dataset, rows, reference.row_ids)


def _render_rows(
    dataset: SearchIntelligenceDataset,
    rows: list[SearchIntelligenceRow],
    row_ids: list[uuid.UUID],
) -> str:
    by_id = {row.id: row for row in rows}
    market = (
        dataset.location_code if dataset.location_code is not None else "not applicable"
    )
    language = dataset.language_code or "not applicable"
    lines = [
        "SEARCH INTELLIGENCE EVIDENCE",
        f"Dataset: {dataset.id}",
        f"Canonical target: {dataset.target_hostname}",
        f"Market: {market} · {language}",
    ]
    for row_id in row_ids:
        row = by_id[row_id]
        volume = row.search_volume if row.search_volume is not None else "unavailable"
        position = row.rank_group if row.rank_group is not None else "unavailable"
        lines.append(
            f"Row {row.id} · source call {row.call_id or 'derived'}: "
            f"{row.keyword or row.domain or row.url}; "
            f"volume {volume}; position {position}"
        )
    return "\n".join(lines)
