"""Read-only, workspace-authorized evidence tools for Growth Agent tasks.

Every executor here is a PROJECTION over persisted rows: no provider call, no
recomputation, and no write (invariant 7). Each returns one of two shapes —
``available`` with its facts, or ``unavailable`` with the reason the source
does not exist. Those are distinct answers, and neither is an observed zero.

The connected-data readers (Performance, AI referrals, integration status)
delegate to the very services the REST surface uses, so an MCP client and the
dashboard can never disagree about a number (invariant 2 — one owner of the
rule).
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from typing import Any, Final

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.integrations_contracts import MAPPING_STATUS_ACTIVE
from app.domain.analytics.service import get_ai_referrals
from app.domain.integrations.readiness import get_project_readiness
from app.domain.traffic.performance import (
    get_performance_dashboard,
    get_performance_table,
)
from app.domain.traffic.query_support import PerformanceQueryError
from app.models.audit import Audit
from app.models.demand import DemandSnapshot
from app.models.integrations import (
    IntegrationConnection,
    IntegrationOAuthGrant,
    IntegrationPropertyMapping,
)
from app.models.opportunity import Opportunity
from app.models.site_health.snapshot import SiteHealthSnapshot

TOOL_VERSION: Final = "2.0.0"
MAX_ROADMAP_ITEMS: Final = 10


@dataclass(frozen=True, slots=True)
class ToolExecutionContext:
    session: AsyncSession
    workspace_id: uuid.UUID
    project_id: uuid.UUID


ToolExecutor = Callable[
    [ToolExecutionContext, dict[str, Any]], Awaitable[dict[str, Any]]
]


async def execute_tool(
    name: str, context: ToolExecutionContext, payload: dict[str, Any]
) -> dict[str, Any]:
    executor = _EXECUTORS.get(name)
    if executor is None:
        raise ValueError(f"unknown agent tool: {name}")
    return await executor(context, payload)


async def _site_snapshot(
    context: ToolExecutionContext, _payload: dict[str, Any]
) -> dict[str, Any]:
    row = await context.session.scalar(
        select(SiteHealthSnapshot)
        .where(
            SiteHealthSnapshot.workspace_id == context.workspace_id,
            SiteHealthSnapshot.project_id == context.project_id,
        )
        .order_by(SiteHealthSnapshot.created_at.desc(), SiteHealthSnapshot.id.desc())
        .limit(1)
    )
    if row is None:
        return _unavailable("no_site_snapshot")
    return {
        "state": "available",
        "scores": {
            "web_fundamentals": row.web_fundamentals_score,
            "aeo_readiness": row.aeo_readiness_score,
            "aeo_measurement_coverage": row.aeo_measurement_coverage,
        },
        "coverage": {
            "selected_urls": row.selected_url_count,
            "analyzed_urls": row.analyzed_url_count,
        },
        "versions": {
            "analyzer": row.analyzer_version,
            "scoring": row.scoring_version,
        },
        "artifact_refs": [
            {"kind": "site_snapshot", "id": str(row.id)},
            {"kind": "site_crawl", "id": str(row.crawl_id)},
        ],
        "omissions": [],
    }


async def _demand_snapshot(
    context: ToolExecutionContext, _payload: dict[str, Any]
) -> dict[str, Any]:
    row = await context.session.scalar(
        select(DemandSnapshot)
        .where(
            DemandSnapshot.workspace_id == context.workspace_id,
            DemandSnapshot.project_id == context.project_id,
        )
        .order_by(DemandSnapshot.created_at.desc(), DemandSnapshot.id.desc())
        .limit(1)
    )
    if row is None:
        return _unavailable("no_demand_snapshot")
    source_refs = [
        {"kind": "integration_artifact", "id": str(source_id)}
        for source_id in row.source_artifact_ids
    ]
    source_refs.extend(
        {"kind": "integration_metric_row", "id": str(source_id)}
        for source_id in row.source_metric_row_ids
    )
    return {
        "state": "available",
        "window": {
            "start": row.window_start.isoformat(),
            "end": row.window_end.isoformat(),
        },
        "summary": row.summary,
        "coverage": row.coverage,
        "comparison": row.comparison,
        "artifact_refs": [
            {"kind": "demand_snapshot", "id": str(row.id)},
            *source_refs,
        ],
        "omissions": [],
    }


async def _ranked_opportunities(
    context: ToolExecutionContext, _payload: dict[str, Any]
) -> dict[str, Any]:
    rows = list(
        (
            await context.session.scalars(
                select(Opportunity)
                .where(
                    Opportunity.workspace_id == context.workspace_id,
                    Opportunity.project_id == context.project_id,
                    Opportunity.superseded_at.is_(None),
                )
                .order_by(Opportunity.priority_score.desc(), Opportunity.id.asc())
                .limit(MAX_ROADMAP_ITEMS + 1)
            )
        ).all()
    )
    emitted = rows[:MAX_ROADMAP_ITEMS]
    if not emitted:
        return _unavailable("no_opportunities")
    items = [
        {
            "rank": rank,
            "priority_score": row.priority_score,
            "severity": row.severity,
            "type": row.opportunity_type,
            "title": row.title,
            "remediation": row.remediation,
            "target_url": row.target_url,
        }
        for rank, row in enumerate(emitted, start=1)
    ]
    omissions = (
        [{"reason": "roadmap_item_limit", "count": len(rows) - len(emitted)}]
        if len(rows) > len(emitted)
        else []
    )
    return {
        "state": "available",
        "ordering": "priority_score_desc_then_id",
        "items": items,
        "artifact_refs": [
            {"kind": "opportunity", "id": str(row.id)} for row in emitted
        ],
        "omissions": omissions,
    }


async def _latest_audit(
    context: ToolExecutionContext, _payload: dict[str, Any]
) -> dict[str, Any]:
    row = await context.session.scalar(
        select(Audit)
        .where(
            Audit.workspace_id == context.workspace_id,
            Audit.project_id == context.project_id,
        )
        .order_by(Audit.created_at.desc(), Audit.id.desc())
        .limit(1)
    )
    if row is None:
        return _unavailable("no_audit")
    return {
        "state": "available",
        "status": row.status,
        "summary": row.summary,
        "counts": {
            "requested": row.requested_count,
            "completed": row.completed_count,
            "failed": row.failed_count,
        },
        "analyzer_version": row.analyzer_version,
        "artifact_refs": [{"kind": "audit", "id": str(row.id)}],
        "omissions": [],
    }


# --- Connected-data readers (Slice 5) ----------------------------------------
#
# Performance, AI referrals and integration status, reachable from an MCP
# client exactly as the dashboard reads them. Each delegates to the domain
# service that owns the rule rather than re-deriving it, and each takes its
# arguments through the same validators the REST query string uses — so a bad
# range is refused here for the same reason and with the same message.


def _text(payload: dict[str, Any], key: str) -> str | None:
    """One optional string argument, or ``None`` when it was not supplied.

    An empty string is NOT an absent argument, and it is refused HERE. Most of
    the validators downstream spell their default as ``value or default``, so
    an empty range, compare mode, dimension or sort would silently become the
    default — and an empty cursor would skip decoding and quietly serve page
    one. A caller that sent a field meant something by it; answering a
    different question is worse than refusing.
    """
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{key} must be a string")
    if not value:
        raise ValueError(f"{key} must not be empty")
    return value


def _day(payload: dict[str, Any], key: str) -> date | None:
    value = _text(payload, key)
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{key} must be an ISO date (YYYY-MM-DD)") from exc


def _identifier(payload: dict[str, Any], key: str) -> uuid.UUID | None:
    value = _text(payload, key)
    if value is None:
        return None
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ValueError(f"{key} must be a UUID") from exc


def _count(payload: dict[str, Any], key: str) -> int | None:
    value = payload.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{key} must be an integer")
    return value


async def _dashboard(context: ToolExecutionContext, payload: dict[str, Any]) -> Any:
    """The dashboard projection for the requested range.

    A query-validation failure becomes a ``ValueError`` so the caller is told
    which argument was wrong, rather than being handed a default window that
    answers a question nobody asked.
    """
    try:
        return await get_performance_dashboard(
            context.session,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            range_token=_text(payload, "range"),
            from_date=_day(payload, "from"),
            to_date=_day(payload, "to"),
            compare=_text(payload, "compare"),
            compare_from=_day(payload, "compare_from"),
            compare_to=_day(payload, "compare_to"),
            granularity=_text(payload, "granularity"),
        )
    except PerformanceQueryError as exc:
        raise ValueError(str(exc)) from exc


async def _performance_snapshot(
    context: ToolExecutionContext, payload: dict[str, Any]
) -> dict[str, Any]:
    dashboard = await _dashboard(context, payload)
    if dashboard.selected.snapshot_id is None:
        # The range has no persisted projection. That is NOT "no traffic": the
        # window was never derived, and a client told zero here would report a
        # measured collapse that nobody measured.
        return _unavailable("performance_range_not_projected")
    body = dashboard.model_dump(mode="json")
    refs = [{"kind": "traffic_snapshot", "id": str(dashboard.selected.snapshot_id)}]
    if dashboard.comparison is not None and dashboard.comparison.snapshot_id:
        refs.append(
            {
                "kind": "traffic_snapshot",
                "id": str(dashboard.comparison.snapshot_id),
            }
        )
    return {
        "state": "available",
        "range": dashboard.range,
        "granularity": dashboard.granularity,
        "compare": dashboard.compare,
        "selected": body["selected"],
        "comparison": body["comparison"],
        "coverage": body["coverage"],
        "dimension_counts": body["dimension_counts"],
        # Reports nobody collects. Their tables are UNAVAILABLE, never empty.
        "unavailable_dimensions": body["unavailable_dimensions"],
        "versions": {
            "formula": dashboard.formula_version,
            "normalization": dashboard.normalization_version,
        },
        "artifact_refs": refs,
        "omissions": [],
    }


async def _performance_table(
    context: ToolExecutionContext, payload: dict[str, Any]
) -> dict[str, Any]:
    """One paged dimension table, for any of the six dimensions.

    ``snapshot_id`` may be omitted, in which case the range resolves the same
    way the dashboard resolves it — a client should not have to make two calls
    to read the top queries for "last month".
    """
    snapshot_id = _identifier(payload, "snapshot_id")
    if snapshot_id is None:
        dashboard = await _dashboard(context, payload)
        if dashboard.selected.snapshot_id is None:
            return _unavailable("performance_range_not_projected")
        snapshot_id = dashboard.selected.snapshot_id
    try:
        page = await get_performance_table(
            context.session,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            snapshot_id=snapshot_id,
            dimension=_text(payload, "dimension"),
            sort=_text(payload, "sort"),
            cursor=_text(payload, "cursor"),
            page_size=_count(payload, "page_size"),
            compare_snapshot_id=_identifier(payload, "compare_snapshot_id"),
        )
    except PerformanceQueryError as exc:
        raise ValueError(str(exc)) from exc
    body = page.model_dump(mode="json")
    return {
        "state": "available",
        "dimension": page.dimension,
        "items": body["items"],
        "next_cursor": page.next_cursor,
        "total_count": page.total_count,
        "page_size": page.page_size,
        "artifact_refs": [{"kind": "traffic_snapshot", "id": str(snapshot_id)}],
        "omissions": (
            [{"reason": "page_size_limit", "count": page.total_count - len(page.items)}]
            if page.total_count > len(page.items)
            else []
        ),
    }


async def _referrals_snapshot(
    context: ToolExecutionContext, payload: dict[str, Any]
) -> dict[str, Any]:
    referrals = await get_ai_referrals(
        context.session,
        workspace_id=context.workspace_id,
        project_id=context.project_id,
        from_date=_day(payload, "from"),
        to_date=_day(payload, "to"),
        range_token=_text(payload, "range"),
    )
    if not referrals.window_start or not referrals.window_end:
        # No snapshot for the requested window. The service returns an empty
        # payload rather than recomputing; reporting it as available would
        # dress "never derived" up as "no AI referrals".
        return _unavailable("no_ai_referrals_snapshot")
    return {
        "state": "available",
        "window": {
            "start": referrals.window_start,
            "end": referrals.window_end,
        },
        "granularity": referrals.granularity,
        "referral_volume": [
            point.model_dump(mode="json") for point in referrals.referral_volume
        ],
        "referral_share": [
            point.model_dump(mode="json") for point in referrals.referral_share
        ],
        "sources": [source.model_dump(mode="json") for source in referrals.sources],
        "versions": {
            "analyzer": referrals.analyzer_version,
            "formula": referrals.formula_version,
        },
        "artifact_refs": [],
        "omissions": [],
    }


async def _integration_status(
    context: ToolExecutionContext, _payload: dict[str, Any]
) -> dict[str, Any]:
    """Why a project's data looks the way it does: connections and progress.

    This is the tool that answers "why is this empty" — a project with no
    mapped connection, an import still running, and an import that failed are
    three different answers, and only this read tells them apart.
    """
    readiness = await get_project_readiness(
        context.session,
        workspace_id=context.workspace_id,
        project_id=context.project_id,
    )
    mappings = (
        await context.session.execute(
            select(
                IntegrationConnection.id,
                IntegrationConnection.provider,
                IntegrationConnection.label,
                IntegrationConnection.last_synced_at,
                IntegrationOAuthGrant.status,
                IntegrationPropertyMapping.property_ref,
            )
            .join(
                IntegrationPropertyMapping,
                and_(
                    IntegrationPropertyMapping.workspace_id
                    == IntegrationConnection.workspace_id,
                    IntegrationPropertyMapping.connection_id
                    == IntegrationConnection.id,
                ),
            )
            .join(
                IntegrationOAuthGrant,
                and_(
                    IntegrationOAuthGrant.workspace_id
                    == IntegrationConnection.workspace_id,
                    IntegrationOAuthGrant.id == IntegrationConnection.grant_id,
                ),
            )
            .where(IntegrationConnection.workspace_id == context.workspace_id)
            .where(IntegrationPropertyMapping.project_id == context.project_id)
            .where(IntegrationPropertyMapping.status == MAPPING_STATUS_ACTIVE)
            .order_by(
                IntegrationConnection.provider.asc(), IntegrationConnection.id.asc()
            )
        )
    ).all()
    return {
        # Never "unavailable": "nothing is connected" is itself the answer this
        # tool exists to give.
        "state": "available",
        # ``connection_count`` counts only connections on a LIVE grant, while
        # ``connections`` lists every active mapping with the grant status
        # behind it. They differ exactly when a grant was revoked or needs
        # re-auth — which is the most useful thing this tool can say about an
        # empty chart, so the row stays rather than being filtered away.
        "stage": readiness.stage,
        "connection_count": readiness.connection_count,
        "backfill_state": readiness.backfill_state,
        "imported_through": (
            readiness.imported_through.isoformat()
            if readiness.imported_through is not None
            else None
        ),
        "has_performance_snapshot": readiness.has_performance_snapshot,
        "has_demand_snapshot": readiness.has_demand_snapshot,
        "opportunity_count": readiness.opportunity_count,
        "connections": [
            {
                "provider": provider,
                "label": label,
                "property_ref": property_ref,
                "grant_status": grant_status,
                "last_synced_at": (
                    last_synced_at.isoformat() if last_synced_at is not None else None
                ),
            }
            for (
                _connection_id,
                provider,
                label,
                last_synced_at,
                grant_status,
                property_ref,
            ) in mappings
        ],
        "artifact_refs": [
            {"kind": "integration_connection", "id": str(connection_id)}
            for (connection_id, *_rest) in mappings
        ],
        "omissions": [],
    }


def _unavailable(reason: str) -> dict[str, Any]:
    return {
        "state": "unavailable",
        "reason": reason,
        "artifact_refs": [],
        "omissions": [{"reason": reason, "count": 1}],
    }


_EXECUTORS: Final[dict[str, ToolExecutor]] = {
    "site.read_snapshot": _site_snapshot,
    "demand.read_snapshot": _demand_snapshot,
    "opportunities.read_ranked": _ranked_opportunities,
    "audits.read_latest": _latest_audit,
    "performance.read_snapshot": _performance_snapshot,
    "performance.read_table": _performance_table,
    "referrals.read_snapshot": _referrals_snapshot,
    "integrations.read_status": _integration_status,
}
