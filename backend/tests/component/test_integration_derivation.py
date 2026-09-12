"""Component tests for derivation: artifact -> IntegrationMetricRow (I9).

Drives the real ``IntegrationWorker`` over recorded GSC fixtures (and the
pure ``build_metric_row_values`` transform directly) against a live
Postgres schema. Covers:

  - Provenance on EVERY derived row (invariant 4): ``source_artifact_id`` +
    ``INTEGRATION_IMPORTER_VERSION`` + the run's ``resync_seq``, with the
    ``dimension_key`` packed in the template's declared order (date
    included) via the config-owned ``pack_dimension_key`` (C1).
  - Unmapped property: the run fails with ``unmapped_property`` and no
    project is ever guessed; zero metric rows + zero projections.
  - Re-sync of a completed window writes NEW rows at the higher
    ``resync_seq``; old revisions are retained, never overwritten (inv. 3).
  - Derivation is idempotent under replay (ON CONFLICT DO NOTHING).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select, update

from app.core.config.integrations_contracts import (
    ERROR_UNMAPPED_PROPERTY,
    EVENT_INTEGRATION_SYNC_FINISHED,
    GRANT_STATUS_CONNECTED,
    INTEGRATION_IMPORTER_VERSION,
)
from app.core.config.integrations_datasets import (
    DATASET_GA4_SOURCE_MEDIUM_DAILY,
    DATASET_GSC_COUNTRY_DAILY,
    DATASET_GSC_DEVICE_DAILY,
    DATASET_GSC_PAGE_DAILY,
    DATASET_GSC_QUERY_DAILY,
    DATASET_GSC_QUERY_PAGE_DAILY,
    INTEGRATION_DATASET_TEMPLATES,
    INTEGRATION_SYNC_EXCLUDED_DATASETS,
)
from app.core.config.integrations_settings import (
    integration_settings,
)
from app.core.config.integrations_transport import (
    INTEGRATION_PROVIDER_GA4,
    INTEGRATION_PROVIDER_GSC,
    INTEGRATION_TRANSPORT_GOOGLE,
)
from app.core.config.task_queue import (
    TASK_STATUS_FAILED,
    TASK_STATUS_SUCCEEDED,
)
from app.core.security import encrypt_secret
from app.domain.integrations.derive import (
    UnmappedPropertyError,
    _parse_row_date,
    build_metric_row_values,
    derive_run,
    resolve_active_mapping,
)
from app.domain.integrations.sync import enqueue_sync_run
from app.models.analytics import AnalyticsTask
from app.models.brand import OwnedDomain
from app.models.integrations import (
    IntegrationConnection,
    IntegrationEvent,
    IntegrationImportArtifact,
    IntegrationMetricRow,
    IntegrationOAuthGrant,
    IntegrationPropertyMapping,
    IntegrationSyncRun,
)
from app.models.project import Project
from app.models.workspace import Workspace
from app.workers.integration_worker import IntegrationWorker

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "integrations"
_WINDOW = (date(2026, 7, 20), date(2026, 7, 22))
_PROPERTY_REF = "https://example.com"


def test_invalid_compact_ga4_date_is_dropped() -> None:
    assert _parse_row_date("20260230") is None


def _fixture(name: str) -> dict:
    return json.loads((_FIXTURES / name).read_text())


@pytest.fixture(autouse=True)
def _fast_pacing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(integration_settings, "gsc_requests_per_minute", 60000)


# One artifact and one derived metric row per provider-compatible GSC family
# (the stub returns a single row per family). Read from the catalog so a new
# dataset moves these counts with it.
_GSC_FAMILIES = len(
    [
        template
        for template in INTEGRATION_DATASET_TEMPLATES.values()
        if template.provider == INTEGRATION_PROVIDER_GSC
        and template.dataset not in INTEGRATION_SYNC_EXCLUDED_DATASETS
    ]
)


def _gsc_transport(*, clicks: int = 3, impressions: int = 30) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        dimensions = tuple(body.get("dimensions") or ())
        values = {
            # The date-only report: no breakdown dimension, so the key is
            # the date alone.
            ("date",): ["2026-07-21"],
            ("page", "date"): ["https://example.com/admissions", "2026-07-21"],
            ("query", "date"): ["admissions", "2026-07-21"],
            ("query", "page", "date"): [
                "admissions",
                "https://example.com/admissions",
                "2026-07-21",
            ],
            ("searchAppearance", "date"): ["WEB", "2026-07-21"],
            ("device", "date"): ["MOBILE", "2026-07-21"],
            ("country", "date"): ["ind", "2026-07-21"],
        }
        assert dimensions in values
        return httpx.Response(
            200,
            json={
                "rows": [
                    {
                        "keys": values[dimensions],
                        "clicks": clicks,
                        "impressions": impressions,
                        "ctr": 0.1,
                        "position": 4.5,
                    }
                ]
            },
        )

    return httpx.MockTransport(handler)


async def _seed_graph(db_session, *, with_mapping: bool = True) -> tuple:
    workspace = Workspace(name="Acme")
    db_session.add(workspace)
    await db_session.flush()
    project = Project(workspace_id=workspace.id, name="Acme Site")
    db_session.add(project)
    await db_session.flush()
    db_session.add(OwnedDomain(project_id=project.id, domain="example.com"))
    grant = IntegrationOAuthGrant(
        workspace_id=workspace.id,
        transport=INTEGRATION_TRANSPORT_GOOGLE,
        access_token_encrypted=encrypt_secret("access-token-1"),
        refresh_token_encrypted=encrypt_secret("refresh-token-1"),
        token_expires_at=datetime.now(UTC) + timedelta(hours=1),
        granted_scopes=["scope-a"],
        status=GRANT_STATUS_CONNECTED,
    )
    db_session.add(grant)
    await db_session.flush()
    connection = IntegrationConnection(
        workspace_id=workspace.id,
        grant_id=grant.id,
        provider=INTEGRATION_PROVIDER_GSC,
        label="gsc connection",
        account_ref=_PROPERTY_REF,
    )
    db_session.add(connection)
    await db_session.flush()
    if with_mapping:
        db_session.add(
            IntegrationPropertyMapping(
                workspace_id=workspace.id,
                connection_id=connection.id,
                provider=INTEGRATION_PROVIDER_GSC,
                property_ref=_PROPERTY_REF,
                project_id=project.id,
                status="active",
            )
        )
    await db_session.commit()
    return workspace.id, project.id, connection.id


async def _enqueue_run(db_session, workspace_id, connection_id) -> IntegrationSyncRun:
    return await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection_id,
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
    )


async def _run_worker(
    session_factory, *, clicks: int = 3, impressions: int = 30
) -> None:
    worker = IntegrationWorker(
        session_factory=session_factory,
        owner="derivation-test",
        transport=_gsc_transport(clicks=clicks, impressions=impressions),
    )
    await worker.run_until_idle()


async def _run_artifacts(
    db_session, run_id: uuid.UUID
) -> list[IntegrationImportArtifact]:
    result = await db_session.scalars(
        select(IntegrationImportArtifact).where(
            IntegrationImportArtifact.sync_run_id == run_id
        )
    )
    return list(result)


async def _run_metric_rows(db_session, run_id: uuid.UUID) -> list[IntegrationMetricRow]:
    artifact_ids = select(IntegrationImportArtifact.id).where(
        IntegrationImportArtifact.sync_run_id == run_id
    )
    result = await db_session.scalars(
        select(IntegrationMetricRow).where(
            IntegrationMetricRow.source_artifact_id.in_(artifact_ids)
        )
    )
    return list(result)


@pytest.mark.asyncio
async def test_derivation_provenance_on_every_row(session_factory, db_session) -> None:
    workspace_id, project_id, connection_id = await _seed_graph(db_session)
    run = await _enqueue_run(db_session, workspace_id, connection_id)

    await _run_worker(session_factory)

    await db_session.refresh(run)
    assert run.status == TASK_STATUS_SUCCEEDED
    artifacts = await _run_artifacts(db_session, run.id)
    assert len(artifacts) == _GSC_FAMILIES
    rows = await _run_metric_rows(db_session, run.id)
    assert len(rows) == _GSC_FAMILIES

    artifact_ids = {artifact.id for artifact in artifacts}
    for row in rows:
        # Provenance triple on every row (invariant 4).
        assert row.source_artifact_id in artifact_ids
        assert row.importer_version == INTEGRATION_IMPORTER_VERSION
        assert row.resync_seq == run.resync_seq == 0
        # Identity resolved through the mapping, never from client input.
        assert row.project_id == project_id
        assert row.workspace_id == workspace_id
        assert row.property_ref == _PROPERTY_REF
        assert row.provider == INTEGRATION_PROVIDER_GSC

    by_dataset: dict[str, list[IntegrationMetricRow]] = {}
    for row in rows:
        by_dataset.setdefault(row.dataset, []).append(row)

    expected_keys = {
        DATASET_GSC_PAGE_DAILY: "https://example.com/admissions | 2026-07-21",
        DATASET_GSC_QUERY_DAILY: "admissions | 2026-07-21",
        DATASET_GSC_QUERY_PAGE_DAILY: (
            "admissions | https://example.com/admissions | 2026-07-21"
        ),
        DATASET_GSC_DEVICE_DAILY: "MOBILE | 2026-07-21",
        DATASET_GSC_COUNTRY_DAILY: "ind | 2026-07-21",
    }
    for dataset, expected_key in expected_keys.items():
        (row,) = by_dataset[dataset]
        assert row.dimension_key == expected_key
        assert row.date == date(2026, 7, 21)
        assert row.metrics == {
            "clicks": 3,
            "impressions": 30,
            "ctr": 0.1,
            "position": 4.5,
        }
    # Each row points at the artifact of ITS dataset (not just any artifact).
    artifact_dataset = {artifact.id: artifact.dataset for artifact in artifacts}
    for row in rows:
        assert artifact_dataset[row.source_artifact_id] == row.dataset


@pytest.mark.asyncio
async def test_unmapped_property_fails_run(session_factory, db_session) -> None:
    """A mapping retired while the run is in flight fails it, never relabels.

    The run froze its target at enqueue, so the fetched rows belong to the
    property that WAS selected. If that mapping is retired before derivation,
    attributing the rows to whatever the connection points at now would be a
    guess about someone else's data.
    """
    workspace_id, _project_id, connection_id = await _seed_graph(db_session)
    run = await _enqueue_run(db_session, workspace_id, connection_id)
    # Retire the mapping after the run is queued and before it derives.
    await db_session.execute(
        update(IntegrationPropertyMapping)
        .where(IntegrationPropertyMapping.connection_id == connection_id)
        .values(status="disabled")
    )
    await db_session.commit()

    await _run_worker(session_factory)

    await db_session.refresh(run)
    assert run.status == TASK_STATUS_FAILED
    assert run.error_code == ERROR_UNMAPPED_PROPERTY
    assert run.completed_at is not None
    # The raw import landed (immutable evidence retained) but NOTHING was
    # derived or projected: the property was never guessed.
    assert len(await _run_artifacts(db_session, run.id)) == _GSC_FAMILIES
    assert await _run_metric_rows(db_session, run.id) == []
    assert list((await db_session.scalars(select(AnalyticsTask))).all()) == []
    events = list(
        (
            await db_session.scalars(
                select(IntegrationEvent).where(
                    IntegrationEvent.workspace_id == workspace_id
                )
            )
        ).all()
    )
    assert EVENT_INTEGRATION_SYNC_FINISHED not in [event.event_type for event in events]
    connection = await db_session.get(IntegrationConnection, connection_id)
    assert connection.last_synced_at is None


@pytest.mark.asyncio
async def test_resync_writes_new_rows_old_retained(session_factory, db_session) -> None:
    workspace_id, project_id, connection_id = await _seed_graph(db_session)
    run0 = await _enqueue_run(db_session, workspace_id, connection_id)
    await _run_worker(session_factory)
    await db_session.refresh(run0)
    assert run0.status == TASK_STATUS_SUCCEEDED

    rows0 = await _run_metric_rows(db_session, run0.id)
    artifacts0 = await _run_artifacts(db_session, run0.id)
    hashes0 = {artifact.id: artifact.payload_hash for artifact in artifacts0}
    assert len(rows0) == _GSC_FAMILIES
    assert {row.resync_seq for row in rows0} == {0}

    # The completed window re-syncs at resync_seq 1 (I5 allocation).
    run1 = await _enqueue_run(db_session, workspace_id, connection_id)
    assert run1.resync_seq == 1
    await _run_worker(session_factory)
    await db_session.refresh(run1)
    assert run1.status == TASK_STATUS_SUCCEEDED

    rows1 = await _run_metric_rows(db_session, run1.id)
    assert len(rows1) == _GSC_FAMILIES
    assert {row.resync_seq for row in rows1} == {1}

    # Old rows + old artifacts are retained, never mutated (invariant 3):
    # same identity tuple at both revisions, distinct row ids.
    identity = (
        select(
            IntegrationMetricRow.project_id,
            IntegrationMetricRow.property_ref,
            IntegrationMetricRow.provider,
            IntegrationMetricRow.dataset,
            IntegrationMetricRow.date,
            IntegrationMetricRow.dimension_key,
            IntegrationMetricRow.resync_seq,
        )
        .where(IntegrationMetricRow.project_id == project_id)
        .group_by(
            IntegrationMetricRow.project_id,
            IntegrationMetricRow.property_ref,
            IntegrationMetricRow.provider,
            IntegrationMetricRow.dataset,
            IntegrationMetricRow.date,
            IntegrationMetricRow.dimension_key,
            IntegrationMetricRow.resync_seq,
        )
    )
    grouped = (await db_session.execute(identity)).all()
    # One identity per GSC family, at two revisions.
    assert len(grouped) == _GSC_FAMILIES * 2
    seqs = {row.resync_seq for row in grouped}
    assert seqs == {0, 1}
    for artifact in artifacts0:
        await db_session.refresh(artifact)
        assert artifact.payload_hash == hashes0[artifact.id]


@pytest.mark.asyncio
async def test_derivation_replay_is_a_dedup_noop(session_factory, db_session) -> None:
    workspace_id, _project_id, connection_id = await _seed_graph(db_session)
    run = await _enqueue_run(db_session, workspace_id, connection_id)
    await _run_worker(session_factory)
    await db_session.refresh(run)
    assert run.status == TASK_STATUS_SUCCEEDED

    async with session_factory() as session:
        persisted_run = await session.get(IntegrationSyncRun, run.id)
        connection = await session.get(IntegrationConnection, connection_id)
        artifacts = list(
            (
                await session.scalars(
                    select(IntegrationImportArtifact).where(
                        IntegrationImportArtifact.sync_run_id == run.id
                    )
                )
            ).all()
        )
        derived = await derive_run(
            session, run=persisted_run, connection=connection, artifacts=artifacts
        )
        await session.commit()
    # The transform still maps every payload row, but the insert conflicts
    # on the identity tuple and lands NOTHING twice.
    assert derived.metric_row_count == _GSC_FAMILIES
    assert len(await _run_metric_rows(db_session, run.id)) == _GSC_FAMILIES


@pytest.mark.asyncio
async def test_resolve_active_mapping_never_guesses(db_session) -> None:
    workspace_id, project_id, connection_id = await _seed_graph(db_session)
    mapping = await resolve_active_mapping(
        db_session,
        workspace_id=workspace_id,
        provider=INTEGRATION_PROVIDER_GSC,
        property_ref=_PROPERTY_REF,
    )
    assert mapping.project_id == project_id
    assert mapping.connection_id == connection_id
    with pytest.raises(UnmappedPropertyError):
        await resolve_active_mapping(
            db_session,
            workspace_id=workspace_id,
            provider=INTEGRATION_PROVIDER_GA4,
            property_ref=_PROPERTY_REF,
        )


def test_build_metric_row_values_pure_packing() -> None:
    """Pure transform: declared-order packing incl. date; GA4 compact dates;
    malformed rows are skipped, never guessed."""
    template = INTEGRATION_DATASET_TEMPLATES[DATASET_GA4_SOURCE_MEDIUM_DAILY]
    workspace_id = uuid.uuid4()
    run = IntegrationSyncRun(
        workspace_id=workspace_id,
        connection_id=uuid.uuid4(),
        window_start=_WINDOW[0],
        window_end=_WINDOW[1],
        resync_seq=2,
        idempotency_key=uuid.uuid4().hex,
    )
    mapping = IntegrationPropertyMapping(
        workspace_id=workspace_id,
        connection_id=run.connection_id,
        provider=INTEGRATION_PROVIDER_GA4,
        property_ref="properties/123",
        project_id=uuid.uuid4(),
    )
    artifact = IntegrationImportArtifact(
        id=uuid.uuid4(),
        sync_run_id=run.id,
        connection_id=run.connection_id,
        workspace_id=workspace_id,
        provider=INTEGRATION_PROVIDER_GA4,
        dataset=DATASET_GA4_SOURCE_MEDIUM_DAILY,
        payload_hash=hashlib.sha256(b"fixture").hexdigest(),
        row_count=3,
        payload={
            "rows": [
                {
                    "keys": ["google", "organic", "20260720"],
                    "sessions": 41,
                    "engagedSessions": 30,
                    "keyEvents": 2,
                },
                {"keys": ["only-two", "20260720"]},  # wrong arity: skipped
                {
                    "keys": ["bing", "referral", "not-a-date"]  # bad date: skipped
                },
            ]
        },
    )

    values = build_metric_row_values(
        template=template, run=run, mapping=mapping, artifact=artifact
    )
    assert len(values) == 1
    (row,) = values
    assert row["dimension_key"] == "google | organic | 20260720"
    assert row["date"] == date(2026, 7, 20)
    assert row["metrics"] == {
        "sessions": 41,
        "engagedSessions": 30,
        "keyEvents": 2,
    }
    assert row["resync_seq"] == 2
    assert row["importer_version"] == INTEGRATION_IMPORTER_VERSION
    assert row["source_artifact_id"] == artifact.id
    assert row["project_id"] == mapping.project_id


@pytest.mark.asyncio
async def test_overlapping_windows_supersede_instead_of_colliding(
    session_factory, db_session
) -> None:
    """A revised day imported by an OVERLAPPING window must win.

    The dispatcher enqueues a long trailing window and a short late-data
    window every tick. They share their most recent days. While revisions were
    allocated per window, both imports were revision 0, so the corrected rows
    hit the metric-row unique identity and were thrown away by ON CONFLICT DO
    NOTHING — Search Console's late-data correction never landed. Both
    revisions must now be stored, and readers must see the later one.
    """
    workspace_id, project_id, connection_id = await _seed_graph(db_session)

    # First import: a wide window, under-reported (the provider is still
    # counting the most recent days).
    wide = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection_id,
        window_start=date(2026, 7, 1),
        window_end=date(2026, 7, 22),
    )
    await _run_worker(session_factory, clicks=3, impressions=30)
    await db_session.refresh(wide)
    assert wide.status == TASK_STATUS_SUCCEEDED

    # Second import: a NARROWER, overlapping window with corrected values.
    narrow = await enqueue_sync_run(
        db_session,
        workspace_id=workspace_id,
        connection_id=connection_id,
        window_start=date(2026, 7, 20),
        window_end=date(2026, 7, 22),
    )
    assert (narrow.window_start, narrow.window_end) != (
        wide.window_start,
        wide.window_end,
    )
    assert narrow.resync_seq > wide.resync_seq
    await _run_worker(session_factory, clicks=9, impressions=90)
    await db_session.refresh(narrow)
    assert narrow.status == TASK_STATUS_SUCCEEDED

    # Both revisions are retained (immutable evidence, invariant 3)...
    rows = list(
        await db_session.scalars(
            select(IntegrationMetricRow).where(
                IntegrationMetricRow.project_id == project_id,
                IntegrationMetricRow.dataset == DATASET_GSC_PAGE_DAILY,
                IntegrationMetricRow.date == date(2026, 7, 21),
            )
        )
    )
    assert len(rows) == 2
    by_seq = {row.resync_seq: row for row in rows}
    assert by_seq[wide.resync_seq].metrics["clicks"] == 3
    assert by_seq[narrow.resync_seq].metrics["clicks"] == 9

    # ...and the current value is the later revision, counted exactly once.
    current = max(rows, key=lambda row: row.resync_seq)
    assert current.metrics == {
        "clicks": 9,
        "impressions": 90,
        "ctr": 0.1,
        "position": 4.5,
    }


@pytest.mark.asyncio
async def test_re_deriving_the_same_run_changes_nothing(
    session_factory, db_session
) -> None:
    """Replay is a dedup no-op: the run owns its revision."""
    workspace_id, project_id, connection_id = await _seed_graph(db_session)
    run = await _enqueue_run(db_session, workspace_id, connection_id)
    await _run_worker(session_factory)
    await db_session.refresh(run)
    before = await _run_metric_rows(db_session, run.id)
    assert before

    connection = await db_session.get(IntegrationConnection, connection_id)
    artifacts = await _run_artifacts(db_session, run.id)
    derived = await derive_run(
        db_session, run=run, connection=connection, artifacts=artifacts
    )
    await db_session.commit()

    after = await _run_metric_rows(db_session, run.id)
    assert len(after) == len(before)
    assert derived.project_id == project_id
    assert {(row.id, row.resync_seq) for row in after} == {
        (row.id, row.resync_seq) for row in before
    }
