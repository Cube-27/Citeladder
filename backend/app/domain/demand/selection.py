"""Which Demand snapshot is CURRENT, for every consumer that needs one.

Prompt generation and the Opportunity demand adapter each carried their own
copy of this query, byte-identical and both wrong in the same way: they took
the newest snapshot by ``created_at``, which is when the row was WRITTEN, not
the period it observed.

Those differ. A historical backfill finishing tonight writes a snapshot over a
window from months ago; under a created_at ordering it immediately became the
guidance the generator and the opportunity adapter worked from, displacing a
snapshot that actually describes the recent period. Ordering by the observation
window first fixes that, with ``created_at`` kept as the tiebreak so two
snapshots over the same window still resolve to the later computation.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.demand import DemandSnapshot


async def current_demand_snapshot(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> DemandSnapshot | None:
    """The snapshot describing the most recent period this project observed.

    Ordered by ``window_end`` (what it measured), then ``created_at`` and
    ``id`` (when it was computed) so the choice is total and deterministic.
    Returns ``None`` when the project has no snapshot at all — which is not
    the same as a snapshot with no signals, and callers keep the two apart.
    """
    return await session.scalar(
        select(DemandSnapshot)
        .where(
            DemandSnapshot.workspace_id == workspace_id,
            DemandSnapshot.project_id == project_id,
        )
        .order_by(
            DemandSnapshot.window_end.desc(),
            DemandSnapshot.created_at.desc(),
            DemandSnapshot.id.desc(),
        )
        .limit(1)
    )
