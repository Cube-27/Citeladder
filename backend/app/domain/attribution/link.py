"""Deterministic order-referrer links over sanitized immutable order facts."""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.analytics import AI_REFERRAL_RULE_VERSION
from app.core.config.attribution import (
    ATTRIBUTION_ANALYZER_VERSION,
    ATTRIBUTION_METHOD_ORDER_REFERRER,
)
from app.domain.analytics.classification import classify_referral_signals
from app.domain.analytics.enqueue import enqueue_attribution_snapshot_refresh
from app.domain.analytics.tasks import raise_if_task_terminal
from app.domain.commerce.orders import order_fact_not_superseded
from app.models.analytics import AnalyticsTask
from app.models.attribution import AttributionLink
from app.models.commerce import OrderFact
from app.models.integrations import IntegrationImportArtifact, IntegrationSyncRun


def _host(value: object) -> str:
    if not isinstance(value, str) or not value:
        return ""
    return (urlsplit(value).hostname or "").casefold()


def _link_values(order: OrderFact) -> dict | None:
    """Return classifier values for an order, or ``None`` when unmatched."""
    keys = order.attribution_keys if isinstance(order.attribution_keys, Mapping) else {}
    match = classify_referral_signals(
        referrer_host=_host(keys.get("referrer_url")),
        utm_source=str(keys.get("utm_source") or ""),
        utm_medium=str(keys.get("utm_medium") or ""),
    )
    if match is None:
        return None
    return {
        "method": ATTRIBUTION_METHOD_ORDER_REFERRER,
        "confidence": match.confidence,
        "matched_rule_id": match.matched_rule_id,
        "ai_source": match.ai_source,
        "match_signal": match.match_signal,
    }


async def run_attribution_link(
    session_factory: async_sessionmaker[AsyncSession], task: AnalyticsTask
) -> None:
    """Link latest order revisions from one sync, then enqueue its snapshot."""
    if task.project_id is None:
        raise ValueError("attribution_link task missing project_id")
    payload = task.payload or {}
    try:
        sync_run_id = uuid.UUID(str(payload["sync_run_id"]))
    except (KeyError, ValueError, TypeError) as exc:
        raise ValueError("attribution_link payload missing sync_run_id") from exc
    rule_version = str(payload.get("rule_version") or AI_REFERRAL_RULE_VERSION)
    await raise_if_task_terminal(session_factory, task.id, boundary="order-link batch")

    async with session_factory() as session:
        run = await session.scalar(
            select(IntegrationSyncRun)
            .where(IntegrationSyncRun.id == sync_run_id)
            .where(IntegrationSyncRun.workspace_id == task.workspace_id)
        )
        if run is None:
            raise ValueError("attribution_link sync run not found")
        orders = list(
            (
                await session.scalars(
                    select(OrderFact)
                    .join(
                        IntegrationImportArtifact,
                        OrderFact.source_artifact_id == IntegrationImportArtifact.id,
                    )
                    .where(OrderFact.workspace_id == task.workspace_id)
                    .where(OrderFact.project_id == task.project_id)
                    .where(IntegrationImportArtifact.sync_run_id == sync_run_id)
                    .where(order_fact_not_superseded())
                    .order_by(OrderFact.id.asc())
                )
            ).all()
        )
        for order in orders:
            values = _link_values(order)
            if values is None:
                continue
            await session.execute(
                pg_insert(AttributionLink)
                .values(
                    workspace_id=order.workspace_id,
                    project_id=order.project_id,
                    order_fact_id=order.id,
                    method=values["method"],
                    confidence=values["confidence"],
                    matched_rule_id=values["matched_rule_id"],
                    rule_version=rule_version,
                    analyzer_version=ATTRIBUTION_ANALYZER_VERSION,
                    evidence_refs={
                        "order_fact_id": str(order.id),
                        "source_artifact_id": str(order.source_artifact_id),
                        "ai_source": values["ai_source"],
                        "match_signal": values["match_signal"],
                    },
                    revenue_amount=order.total_amount,
                    currency=order.currency,
                )
                .on_conflict_do_nothing(
                    index_elements=["order_fact_id", "matched_rule_id", "rule_version"]
                )
            )
        await enqueue_attribution_snapshot_refresh(
            session,
            workspace_id=task.workspace_id,
            project_id=task.project_id,
            window_start=run.window_start,
            window_end=run.window_end,
            resync_seq=run.resync_seq,
            source_revision=str(run.id),
        )
        await session.commit()
