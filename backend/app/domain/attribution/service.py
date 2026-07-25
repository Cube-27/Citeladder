# Commerce attribution read service (WS-B): persisted projections only.
#
# ``get_commerce_attribution`` serves the persisted ``AttributionSnapshot``
# for the requested (window, granularity) — or the project's latest
# snapshot at the granularity when the window is omitted. NO provider is
# ever called and NOTHING is recomputed at read time (invariant 7): an
# absent snapshot yields the empty contract (empty method sections, the
# permanently ``not_offered`` statistical namespace), never a 404 and
# never a fabricated zero.
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.analytics import (
    ANALYTICS_DEFAULT_GRANULARITY,
    ANALYTICS_MAX_WINDOW_DAYS,
    ANALYTICS_SNAPSHOT_GRANULARITIES,
)
from app.core.config.attribution import (
    ATTRIBUTION_ANALYZER_VERSION,
    ATTRIBUTION_FORMULA_VERSION,
    ATTRIBUTION_METRICS_NAMESPACE_DETERMINISTIC,
    ATTRIBUTION_METRICS_NAMESPACE_STATISTICAL,
    ATTRIBUTION_STATISTICAL_STATE_NOT_OFFERED,
)
from app.domain.attribution.schemas import (
    AttributionDeterministic,
    AttributionMetrics,
    AttributionStatistical,
    CommerceAttributionResponse,
)
from app.models.attribution import AttributionSnapshot


class AttributionQueryError(ValueError):
    """Raised for an invalid attribution query (bad granularity/window).

    The API layer maps this to HTTP 422; it is never a not-found
    condition. Mirrors the ``TrafficQueryError`` contract (one owner per
    surface).
    """


def _validate_granularity(granularity: str) -> str:
    granularity = granularity or ANALYTICS_DEFAULT_GRANULARITY
    if granularity not in ANALYTICS_SNAPSHOT_GRANULARITIES:
        raise AttributionQueryError(f"unknown granularity: {granularity!r}")
    return granularity


def _validate_window(from_date: date | None, to_date: date | None) -> None:
    """The from/to contract: both-or-neither, ordered, within the max span."""
    if (from_date is None) != (to_date is None):
        raise AttributionQueryError("'from' and 'to' must be supplied together")
    if from_date is None or to_date is None:
        return
    if to_date < from_date:
        raise AttributionQueryError("'to' must not be before 'from'")
    if (to_date - from_date).days + 1 > ANALYTICS_MAX_WINDOW_DAYS:
        raise AttributionQueryError(
            f"window exceeds ANALYTICS_MAX_WINDOW_DAYS ({ANALYTICS_MAX_WINDOW_DAYS})"
        )


async def _load_snapshot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    from_date: date | None,
    to_date: date | None,
    granularity: str,
) -> AttributionSnapshot | None:
    """The persisted snapshot serving the request, or ``None``.

    An explicit ``from``/``to`` selects the snapshot persisted for exactly
    that window (read endpoints serve persisted snapshot windows only —
    arbitrary custom windows are never recomputed). Without a window the
    project's LATEST persisted snapshot at the granularity is served (the
    A9/A10 precedent).
    """
    stmt = (
        select(AttributionSnapshot)
        .where(AttributionSnapshot.workspace_id == workspace_id)
        .where(AttributionSnapshot.project_id == project_id)
        .where(AttributionSnapshot.granularity == granularity)
    )
    if from_date is not None and to_date is not None:
        stmt = stmt.where(AttributionSnapshot.window_start == from_date)
        stmt = stmt.where(AttributionSnapshot.window_end == to_date)
    else:
        stmt = stmt.order_by(
            AttributionSnapshot.window_end.desc(),
            AttributionSnapshot.window_start.desc(),
        )
    return await session.scalar(stmt.limit(1))


def _empty_metrics() -> AttributionMetrics:
    """The metrics document of an absent snapshot: empty method sections."""
    return AttributionMetrics(
        deterministic=AttributionDeterministic(a1=[], a2=[], delta=[], unattributed=[]),
        statistical=AttributionStatistical(
            state=ATTRIBUTION_STATISTICAL_STATE_NOT_OFFERED,
            sample_size=None,
            allocations=[],
        ),
    )


def _uuid_list(raw: object) -> list[uuid.UUID]:
    """Parse a persisted JSONB id array; malformed entries are skipped."""
    ids: list[uuid.UUID] = []
    for value in raw if isinstance(raw, list) else []:
        try:
            ids.append(uuid.UUID(str(value)))
        except ValueError:
            continue
    return ids


async def get_commerce_attribution(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    from_date: date | None = None,
    to_date: date | None = None,
    granularity: str = ANALYTICS_DEFAULT_GRANULARITY,
) -> CommerceAttributionResponse:
    """Serve the Commerce attribution projection from the persisted snapshot.

    The persisted ``metrics`` JSONB already carries the exact served
    document (the refresh executor writes it in the served shape); this
    validates it into the strict response model. An absent snapshot yields
    the empty contract (never a recomputation — invariant 7).
    """
    granularity = _validate_granularity(granularity)
    _validate_window(from_date, to_date)
    snapshot = await _load_snapshot(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        from_date=from_date,
        to_date=to_date,
        granularity=granularity,
    )
    if snapshot is None:
        return CommerceAttributionResponse(
            project_id=project_id,
            window_start=from_date.isoformat() if from_date is not None else "",
            window_end=to_date.isoformat() if to_date is not None else "",
            granularity=granularity,
            metrics=_empty_metrics(),
            source_link_ids=[],
            source_order_fact_ids=[],
            source_metric_row_ids=[],
            source_snapshot_ids=[],
            formula_version=ATTRIBUTION_FORMULA_VERSION,
            analyzer_version=ATTRIBUTION_ANALYZER_VERSION,
            created_at=None,
        )

    raw_metrics = snapshot.metrics or {}
    deterministic = raw_metrics.get(ATTRIBUTION_METRICS_NAMESPACE_DETERMINISTIC) or {}
    statistical = raw_metrics.get(ATTRIBUTION_METRICS_NAMESPACE_STATISTICAL) or {}
    return CommerceAttributionResponse(
        project_id=project_id,
        window_start=snapshot.window_start.isoformat(),
        window_end=snapshot.window_end.isoformat(),
        granularity=snapshot.granularity,
        metrics=AttributionMetrics(
            deterministic=AttributionDeterministic(
                a1=deterministic.get("a1") or [],
                a2=deterministic.get("a2") or [],
                delta=deterministic.get("delta") or [],
                unattributed=deterministic.get("unattributed") or [],
            ),
            statistical=AttributionStatistical(
                state=statistical.get(
                    "state", ATTRIBUTION_STATISTICAL_STATE_NOT_OFFERED
                ),
                sample_size=statistical.get("sample_size"),
                allocations=statistical.get("allocations") or [],
            ),
        ),
        source_link_ids=_uuid_list(snapshot.source_link_ids),
        source_order_fact_ids=_uuid_list(snapshot.source_order_fact_ids),
        source_metric_row_ids=_uuid_list(snapshot.source_metric_row_ids),
        source_snapshot_ids=_uuid_list(snapshot.source_snapshot_ids),
        formula_version=snapshot.formula_version,
        analyzer_version=snapshot.analyzer_version,
        created_at=(
            snapshot.created_at.isoformat() if snapshot.created_at is not None else None
        ),
    )
