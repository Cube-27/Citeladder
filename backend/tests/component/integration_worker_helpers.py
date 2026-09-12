"""Shared read helpers for the integration-worker component tests.

`test_integration_bing.py` and `test_integration_worker.py` each carried a
byte-identical `_artifacts`/`_metric_rows` and a `_worker` builder differing
only in its owner default. These are ordering-sensitive reads — the artifact
query's three-key sort is what makes the assertions deterministic — so two
copies is two places for that ordering to drift apart.
"""

from __future__ import annotations

import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.integrations import (
    IntegrationImportArtifact,
    IntegrationMetricRow,
)
from app.workers.integration_worker import IntegrationWorker


def build_worker(
    session_factory: async_sessionmaker[AsyncSession],
    transport: httpx.AsyncBaseTransport,
    *,
    owner: str = "test-worker",
) -> IntegrationWorker:
    return IntegrationWorker(
        session_factory=session_factory, owner=owner, transport=transport
    )


async def artifacts_for_run(
    db_session, run_id: uuid.UUID
) -> list[IntegrationImportArtifact]:
    """Every artifact of a run, in a total order the assertions can rely on."""
    result = await db_session.scalars(
        select(IntegrationImportArtifact)
        .where(IntegrationImportArtifact.sync_run_id == run_id)
        .order_by(
            IntegrationImportArtifact.dataset.asc(),
            IntegrationImportArtifact.created_at.asc(),
            IntegrationImportArtifact.id.asc(),
        )
    )
    return list(result)


async def metric_rows_for_run(
    db_session, run_id: uuid.UUID
) -> list[IntegrationMetricRow]:
    """Metric rows derived from a run's artifacts."""
    artifact_ids = select(IntegrationImportArtifact.id).where(
        IntegrationImportArtifact.sync_run_id == run_id
    )
    result = await db_session.scalars(
        select(IntegrationMetricRow).where(
            IntegrationMetricRow.source_artifact_id.in_(artifact_ids)
        )
    )
    return list(result)
