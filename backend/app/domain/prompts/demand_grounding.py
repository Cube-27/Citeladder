"""What observed search demand prompt generation is allowed to see.

Split from ``generation.py``, which owns the generation call itself. This
module owns the narrower question of which demand evidence is current and how
much of it reaches the model.

Both answers used to be wrong in ways that were invisible from the outside:
the snapshot was chosen by when its row was WRITTEN rather than the period it
observed, and each signal was serialized down to a topic-cluster label, so the
generator invented prompt wording while the actual observed query sat unread.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.demand import DEMAND_SIGNAL_STATE_ACTIVE
from app.domain.demand.selection import current_demand_snapshot
from app.models.demand import DemandSignal, DemandSnapshot


async def load_demand_grounding(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int,
) -> tuple[DemandSnapshot | None, list[DemandSignal]]:
    snapshot = await current_demand_snapshot(
        session, workspace_id=workspace_id, project_id=project_id
    )
    if snapshot is None:
        return None, []
    signals = list(
        (
            await session.scalars(
                select(DemandSignal)
                .where(
                    DemandSignal.workspace_id == workspace_id,
                    DemandSignal.project_id == project_id,
                    DemandSignal.snapshot_id == snapshot.id,
                    # Active only. A resolved signal describes a gap that has
                    # since closed, and grounding new prompts in it asks the
                    # model to chase something already handled. The Opportunity
                    # adapter has always filtered this; generation did not.
                    DemandSignal.state == DEMAND_SIGNAL_STATE_ACTIVE,
                )
                .order_by(
                    DemandSignal.priority_score.desc().nullslast(), DemandSignal.id
                )
                .limit(limit)
            )
        ).all()
    )
    return snapshot, signals


def serialize_demand_signal(
    signal: DemandSignal, *, snapshot: DemandSnapshot | None
) -> dict[str, Any]:
    """One observed demand signal, as the generator should see it.

    This used to carry type/topic/page/priority/limitations and nothing else,
    which left the model inventing prompt wording from a topic-cluster label
    while the actual observed QUERY sat unread in ``signal.evidence`` — the
    single most useful thing about the signal. The observed metrics and the
    period they were measured over were likewise omitted, so the model could
    not tell a query with 40,000 impressions from one with 12, nor a reading
    from last week from one from last year.

    Everything here is an OBSERVATION, not an instruction: the contract
    presents it as reference evidence, and structural validation still owns
    what may become a tracked prompt.
    """
    evidence = signal.evidence or {}
    metrics = signal.metrics or {}
    row: dict[str, Any] = {
        "id": str(signal.id),
        "type": signal.signal_type,
        "topic": signal.topic_cluster,
        "page": signal.page_url,
        "priority": signal.priority_score,
        "limitations": list(signal.limitations or []),
    }
    # The observed query text, when this signal is about one. ``target`` is
    # only a query when ``target_kind`` says so — a page target is a URL, and
    # presenting it as a search someone typed would be a fabrication.
    if evidence.get("target_kind") == "query":
        row["observed_query"] = evidence.get("target")
    if metrics:
        row["observed_metrics"] = metrics
    if snapshot is not None:
        row["observed_period"] = {
            "start": snapshot.window_start.isoformat(),
            "end": snapshot.window_end.isoformat(),
        }
    return row
