"""Shared persisted audits and snapshots for analysis projection tests."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from app.core.config.audits import (
    AUDIT_STATUS_COMPLETED,
)
from app.core.config.provider_catalog import (
    ENGINE_GEMINI,
    TRANSPORT_GOOGLE,
    measurement_route,
)
from app.core.config.task_queue import TASK_STATUS_SUCCEEDED
from app.models.analysis import (
    BrandMention,
    Citation,
    CompetitorMention,
    ResponseAnalysis,
)
from app.models.audit import (
    Audit,
    AuditEngineSnapshot,
    AuditPromptSnapshot,
    AuditTask,
    RawResponseArtifact,
)

# The model the PLANNER freezes for these audits. Read from the catalog rather
# than pinned as a literal: these assertions are about provenance travelling
# intact from the frozen route to the projection, not about which Gemini build
# is current, and a literal here goes stale on every model-version bump.
GEMINI_MODEL = measurement_route(ENGINE_GEMINI).transport_model


async def _seed_evidence_execution(
    session,
    *,
    workspace_id,
    project_id,
    completed_at: datetime,
    prompt_index: int = 0,
    repetition: int = 0,
    logical_engine: str = ENGINE_GEMINI,
    transport_provider: str = TRANSPORT_GOOGLE,
    transport_model: str = "gemini-flash-latest",
    prompt_id=None,
    prompt_text: str = "best crm software",
    search_used: bool = True,
    search_query_count: int = 1,
    artifact_events=None,
    task_events=None,
    brand_mentions=None,
    competitor_mentions=None,
    citations=None,
    audit=None,
    status: str = AUDIT_STATUS_COMPLETED,
    analyzer_version: str = "b6-analysis-1",
):
    """Seed one dashboard-ready execution with full evidence child rows."""
    if audit is None:
        audit = Audit(
            workspace_id=workspace_id,
            project_id=project_id,
            status=status,
            completed_at=completed_at,
            requested_count=1,
            completed_count=1,
        )
        session.add(audit)
        await session.flush()

    # Reuse an existing prompt snapshot for this audit+prompt_index (the unique
    # (audit_id, prompt_index) slot) so multiple repetitions can share one.
    snapshot = await session.scalar(
        select(AuditPromptSnapshot).where(
            AuditPromptSnapshot.audit_id == audit.id,
            AuditPromptSnapshot.prompt_index == prompt_index,
        )
    )
    if snapshot is None:
        snapshot = AuditPromptSnapshot(
            audit_id=audit.id,
            prompt_id=prompt_id,
            prompt_index=prompt_index,
            text=prompt_text,
            theme="general",
            intent="category",
        )
        session.add(snapshot)
        await session.flush()
    # Reuse an existing engine snapshot for this audit+engine (the unique
    # (audit_id, logical_engine) slot) so multiple executions can share one.
    engine_snapshot = await session.scalar(
        select(AuditEngineSnapshot).where(
            AuditEngineSnapshot.audit_id == audit.id,
            AuditEngineSnapshot.logical_engine == logical_engine,
        )
    )
    if engine_snapshot is None:
        engine_snapshot = AuditEngineSnapshot(
            audit_id=audit.id,
            logical_engine=logical_engine,
            transport_provider=transport_provider,
            transport_model=transport_model,
        )
        session.add(engine_snapshot)
        await session.flush()

    task = AuditTask(
        audit_id=audit.id,
        workspace_id=workspace_id,
        project_id=project_id,
        # A TASK's terminal success is `succeeded`; `completed` is the AUDIT
        # vocabulary. Stamping the audit's constant here is what let a filter
        # on a status no task can hold pass every test while returning nothing
        # in production.
        status=TASK_STATUS_SUCCEEDED,
        prompt_snapshot_id=snapshot.id,
        engine_snapshot_id=engine_snapshot.id,
        prompt_index=prompt_index,
        repetition=repetition,
        randomized_position=0,
        logical_engine=logical_engine,
        transport_provider=transport_provider,
        transport_model=transport_model,
        prompt_text=prompt_text,
        idempotency_key=(f"{audit.id}:{prompt_index}:{repetition}:{logical_engine}"),
        answer_text="Acme Corp is great. Globex is an alternative.",
        search_used=search_used,
        search_events=task_events if task_events is not None else [],
    )
    session.add(task)
    await session.flush()

    artifact = RawResponseArtifact(
        audit_id=audit.id,
        task_id=task.id,
        logical_engine=logical_engine,
        transport_provider=transport_provider,
        transport_model=transport_model,
        answer_text="Acme Corp is great. Globex is an alternative.",
        search_used=search_used,
        search_events=artifact_events if artifact_events is not None else [],
        citations=[],
    )
    session.add(artifact)
    await session.flush()
    artifact_id = artifact.id
    task.result_artifact_id = artifact_id
    await session.flush()

    analysis = ResponseAnalysis(
        workspace_id=workspace_id,
        audit_id=audit.id,
        task_id=task.id,
        artifact_id=artifact_id,
        analyzer_version=analyzer_version,
        scoring_rule_version="scoring-v1",
        logical_engine=logical_engine,
        transport_provider=transport_provider,
        transport_model=transport_model,
        prompt_index=prompt_index,
        repetition=repetition,
        brand_mentioned=bool(brand_mentions),
        search_used=search_used,
        search_query_count=search_query_count,
    )
    session.add(analysis)
    await session.flush()

    for name, offset in brand_mentions or []:
        session.add(
            BrandMention(
                workspace_id=workspace_id,
                audit_id=audit.id,
                analysis_id=analysis.id,
                artifact_id=artifact_id,
                analyzer_version=analyzer_version,
                brand_name=name,
                first_offset=offset,
            )
        )
    for name in competitor_mentions or []:
        session.add(
            CompetitorMention(
                workspace_id=workspace_id,
                audit_id=audit.id,
                analysis_id=analysis.id,
                artifact_id=artifact_id,
                analyzer_version=analyzer_version,
                competitor_name=name,
            )
        )
    for ordinal, (url, domain, classification) in enumerate(citations or []):
        session.add(
            Citation(
                workspace_id=workspace_id,
                audit_id=audit.id,
                analysis_id=analysis.id,
                artifact_id=artifact_id,
                analyzer_version=analyzer_version,
                ordinal=ordinal,
                url=url,
                title=domain,
                domain=domain,
                classification=classification,
                is_owned=classification == "owned",
                matched_competitor="Globex" if classification == "competitor" else None,
            )
        )
    await session.flush()
    return audit, snapshot, task, analysis


def _event(sequence, query, call_id="", call_sequence=0, query_sequence=0):
    return {
        "sequence": sequence,
        "query": query,
        "call_id": call_id,
        "call_sequence": call_sequence,
        "query_sequence": query_sequence,
    }
