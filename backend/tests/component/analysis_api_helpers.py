"""Shared persisted audits and snapshots for analysis projection tests."""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.answer_engines.contracts import (
    AnswerEngineRequest,
    AnswerEngineResponse,
    CitationResult,
    NormalizedUsage,
    SearchEventResult,
)
from app.core.config.audits import (
    AUDIT_STATUS_COMPLETED,
    AUDIT_TRIGGER_MANUAL,
    audit_settings,
)
from app.core.config.provider_catalog import (
    ENGINE_GEMINI,
    TRANSPORT_GOOGLE,
    measurement_route,
)
from app.core.config.task_queue import TASK_STATUS_SUCCEEDED
from app.domain.audits.creation import create_audit
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
from app.workers.audit import execution as audit_execution
from app.workers.audit_worker import AuditWorker
from tests.component.audit_helpers import seed_audit_fixtures

# The model the PLANNER freezes for these audits. Read from the catalog rather
# than pinned as a literal: these assertions are about provenance travelling
# intact from the frozen route to the projection, not about which Gemini build
# is current, and a literal here goes stale on every model-version bump.
GEMINI_MODEL = measurement_route(ENGINE_GEMINI).transport_model

_BRAND = "Acme Corp"
_COMPETITOR = "Globex"
_PARTITION_IDENTITIES = [
    ("model-a", True, (60.0, 80.0)),
    ("model-b", True, (100.0, 0.0)),
    ("model-a", False, (10.0, 30.0)),
]


class _StubAdapter:
    """In-memory answer-engine stand-in: mentions the brand + cites owned +
    competitor domains so the analysis has signal to aggregate (no network)."""

    logical_engine = ENGINE_GEMINI
    transport_provider = TRANSPORT_GOOGLE

    def __init__(self, **_: object) -> None:
        # No-op: stub holds no state; accepts and ignores adapter build kwargs.
        pass

    async def execute(self, request: AnswerEngineRequest) -> AnswerEngineResponse:
        return AnswerEngineResponse(
            logical_engine=self.logical_engine,
            transport_provider=self.transport_provider,
            transport_model=request.model,
            answer_text=(
                f"Acme Corp is a great option for {request.prompt}. "
                "Globex is an alternative."
            ),
            search_used=request.retrieval_enabled,
            search_events=(
                (SearchEventResult(sequence=0, query=request.prompt),)
                if request.retrieval_enabled
                else ()
            ),
            citations=(
                CitationResult(
                    ordinal=0,
                    url="https://acme.com/",
                    title="Acme",
                    domain="acme.com",
                    start_index=0,
                    end_index=4,
                    cited_text="Acme",
                ),
                CitationResult(
                    ordinal=1,
                    url="https://globex.com/",
                    title="Globex",
                    domain="globex.com",
                    start_index=0,
                    end_index=6,
                    cited_text="Globex",
                ),
            ),
            provider_metadata={"query_text_available": True},
            normalized_usage=NormalizedUsage(
                uncached_input_tokens=10, output_tokens=20, total_tokens=30
            ),
            latency_ms=5,
        )


@pytest.fixture
def _stub_adapter(monkeypatch: pytest.MonkeyPatch):
    def _build(**_: object) -> _StubAdapter:
        return _StubAdapter()

    monkeypatch.setattr(audit_execution, "build_adapter", _build)
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)


async def _run_completed_audit(
    session_factory: async_sessionmaker[AsyncSession],
):
    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=2)
    async with session_factory() as session:
        audit = await create_audit(
            session,
            trigger=AUDIT_TRIGGER_MANUAL,
            workspace_id=seed.workspace_id,
            project_id=seed.project_id,
            engines=seed.engines,
            prompt_set_id=seed.prompt_set_id,
            repetitions=2,
            random_seed="1",
        )
    worker = AuditWorker(session_factory=session_factory, owner="w-b6")
    await worker.run_until_idle()
    return seed, audit


class _UsageStubAdapter(_StubAdapter):
    """Like the base stub but reports canonical typed provider usage."""

    async def execute(self, request: AnswerEngineRequest) -> AnswerEngineResponse:
        response = await super().execute(request)
        return AnswerEngineResponse(
            logical_engine=response.logical_engine,
            transport_provider=response.transport_provider,
            transport_model=response.transport_model,
            answer_text=response.answer_text,
            search_used=response.search_used,
            search_events=response.search_events,
            citations=response.citations,
            provider_metadata=dict(response.provider_metadata),
            normalized_usage=NormalizedUsage(
                uncached_input_tokens=100,
                output_tokens=50,
                total_tokens=150,
                provider_cost_microusd=250_000,
            ),
            latency_ms=response.latency_ms,
        )


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
