"""Persisted visibility readers retained for MCP through migration PR 19."""

import uuid
from datetime import UTC, datetime

import pytest

from app.domain.analysis.errors import AnalysisNotFoundError
from app.domain.analysis.evidence import get_execution_evidence
from app.domain.analysis.metrics import get_metrics
from app.models.analysis import MetricSnapshot
from app.models.audit import Audit
from tests.component.analysis_api_helpers import _seed_evidence_execution
from tests.component.audit_helpers import seed_audit_fixtures


async def test_readers_preserve_frozen_provenance_and_workspace_isolation(db_session):
    seed = await seed_audit_fixtures(db_session, prompt_count=1)
    audit, _, task, analysis = await _seed_evidence_execution(
        db_session,
        workspace_id=seed.workspace_id,
        project_id=seed.project_id,
        completed_at=datetime.now(UTC),
        brand_mentions=[("Acme Corp", 0)],
        competitor_mentions=["Globex"],
        citations=[("https://acme.com/", "acme.com", "owned")],
    )
    task.request_snapshot = {"retrieval_enabled": False}
    task.route_snapshot = {"retrieval_enabled": True}
    audit.configuration = {"measurement_policy": {"retrieval_enabled": True}}
    db_session.add(
        MetricSnapshot(
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            audit_id=audit.id,
            analyzer_version=analysis.analyzer_version,
            scoring_rule_version="fixture",
            total_completed=1,
            visibility_score=73,
            metrics={"avg_position": None},
            source_analysis_ids=[str(analysis.id)],
            source_artifact_ids=[str(analysis.artifact_id)],
        )
    )
    await db_session.commit()
    metrics = await get_metrics(
        db_session, workspace_id=seed.workspace_id, audit_id=audit.id
    )
    assert metrics.visibility_score == 73
    assert metrics.metrics["avg_position"] is None
    evidence = await get_execution_evidence(
        db_session, workspace_id=seed.workspace_id, task_id=task.id
    )
    assert evidence.analysis_id == analysis.id
    assert evidence.retrieval_enabled is False
    assert [c.url for c in evidence.citations] == ["https://acme.com/"]
    for reader, key in [
        (get_metrics, {"audit_id": audit.id}),
        (get_execution_evidence, {"task_id": task.id}),
    ]:
        with pytest.raises(AnalysisNotFoundError):
            await reader(db_session, workspace_id=uuid.uuid4(), **key)


async def test_unanalyzed_run_has_no_metric_snapshot(db_session):
    seed = await seed_audit_fixtures(db_session, prompt_count=1)
    audit = Audit(workspace_id=seed.workspace_id, project_id=seed.project_id)
    db_session.add(audit)
    await db_session.commit()
    with pytest.raises(AnalysisNotFoundError):
        await get_metrics(db_session, workspace_id=seed.workspace_id, audit_id=audit.id)
