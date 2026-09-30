"""B6 analysis endpoints over HTTP (component, invariants 5/7).

Drives the real HTTP surface through the ASGI client, sharing the per-test
schema with the ORM/worker seeding so a fully-analyzed audit is reachable:

  - ``GET /audits/{id}/metrics`` serves the single-run snapshot;
  - the executions list's ids resolve in the execution-evidence reader;
  - ``GET /audits/{id}/export.{csv,md}`` download with the right media types;
  - all are auth-protected + workspace-scoped (a foreign workspace 404s).
"""

from __future__ import annotations

import uuid as _uuid

import httpx
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
    AUDIT_TRIGGER_MANUAL,
    audit_settings,
)
from app.core.config.provider_catalog import (
    ENGINE_GEMINI,
    TRANSPORT_GOOGLE,
    measurement_route,
)
from app.domain.analysis.evidence import get_execution_evidence
from app.domain.audits.creation import create_audit
from app.models.workspace import WorkspaceMember
from app.workers.audit import execution as audit_execution
from app.workers.audit_worker import AuditWorker
from tests.component.audit_helpers import seed_audit_fixtures
from tests.component.auth_helpers import register_and_login

# The model the PLANNER freezes for these audits. Read from the catalog rather
# than pinned as a literal: these assertions are about provenance travelling
# intact from the frozen route to the API projections and exports, not about
# which Gemini build is current, and a literal goes stale on every bump.
GEMINI_MODEL = measurement_route(ENGINE_GEMINI).transport_model


class _StubAdapter:
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
            answer_text="Acme Corp is a great option. Globex is an alternative.",
            search_used=True,
            search_events=(SearchEventResult(sequence=0, query=request.prompt),),
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
            ),
            provider_metadata={"query_text_available": True},
            normalized_usage=NormalizedUsage(
                uncached_input_tokens=10, output_tokens=20, total_tokens=30
            ),
            latency_ms=5,
        )


@pytest.fixture
def _stub_adapter(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(audit_execution, "build_adapter", lambda **_: _StubAdapter())
    monkeypatch.setattr(audit_settings, "min_request_interval_seconds", 0.0)
    monkeypatch.setattr(audit_settings, "heartbeat_interval_seconds", 3600.0)


@pytest.mark.asyncio
async def test_endpoints_serve_projections_over_http(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    _stub_adapter,
) -> None:
    # Register a real user (hashed password) so login works, then attach them
    # to the seeded workspace as a member.
    email = "b6-real@example.com"
    await register_and_login(client, email)

    async with session_factory() as session:
        seed = await seed_audit_fixtures(session, prompt_count=2)
        # Attach the registered user to the seeded workspace.
        from app.models.user import User

        user = await session.scalar(select(User).where(User.email == email))
        assert user is not None
        session.add(
            WorkspaceMember(
                workspace_id=seed.workspace_id, user_id=user.id, role="owner"
            )
        )
        await session.commit()
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
    worker = AuditWorker(session_factory=session_factory, owner="w-http")
    await worker.run_until_idle()

    headers = {"X-Workspace-Id": str(seed.workspace_id)}

    # Metrics projection.
    m = await client.get(f"/api/v1/audits/{audit.id}/metrics", headers=headers)
    assert m.status_code == 200
    assert m.json()["visibility_score"] == 87.5

    # Audit projection: the stable aggregate provenance
    # model_provenance list (never a forced singular model), no `mode` alias.
    a = await client.get(f"/api/v1/audits/{audit.id}", headers=headers)
    assert a.status_code == 200
    abody = a.json()
    assert abody["model_provenance"] == [
        {
            "logical_engine": ENGINE_GEMINI,
            "transport_provider": TRANSPORT_GOOGLE,
            "transport_model": GEMINI_MODEL,
            "retrieval_enabled": True,
        }
    ]
    assert "mode" not in abody

    # Execution evidence. The executions list and the single-execution read
    # must share one id space: the id from GET /audits/{id}/executions must
    # resolve in the evidence reader (regression: it used to 404 because the
    # single-execution route keyed on the internal analysis id). The HTTP
    # route moved to the TypeScript API service; MCP still reads this one.
    execs = await client.get(f"/api/v1/audits/{audit.id}/executions", headers=headers)
    assert execs.status_code == 200
    exec_rows = execs.json()
    assert exec_rows
    # Every row carries the shopping-surface slot; the listing defaults to
    # measurement ("") while the gate is disabled.
    # Execution-level provenance: exact singular model + frozen mode/retrieval
    # from the task request snapshot; vocabulary lock (no `mode` alias).
    first_row = exec_rows[0]
    assert first_row["transport_model"] == GEMINI_MODEL
    assert first_row["retrieval_enabled"] is True
    assert "mode" not in first_row
    execution_id = exec_rows[0]["id"]
    async with session_factory() as session:
        evidence = await get_execution_evidence(
            session,
            workspace_id=seed.workspace_id,
            task_id=_uuid.UUID(execution_id),
        )
    ebody = evidence.model_dump(mode="json")
    assert ebody["brand_mentioned"] is True
    # The returned id echoes the execution id the client passed in, and the
    # internal analysis id is surfaced separately for traceability.
    assert ebody["id"] == execution_id
    assert ebody["task_id"] == execution_id
    assert ebody["analysis_id"] != execution_id
    # Execution-detail provenance (frozen fields only, invariants 4/7).
    assert ebody["transport_model"] == GEMINI_MODEL
    assert ebody["retrieval_enabled"] is True
    assert "mode" not in ebody

    # Exports with correct media types.
    csv_resp = await client.get(
        f"/api/v1/audits/{audit.id}/export.csv", headers=headers
    )
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in csv_resp.headers["content-disposition"]
    # CSV rows carry the frozen measurement provenance beside the model/search
    # columns; no bare `mode` column (vocabulary lock).
    csv_header = csv_resp.text.splitlines()[0].split(",")
    assert "retrieval_enabled" in csv_header
    assert "mode" not in csv_header

    md_resp = await client.get(f"/api/v1/audits/{audit.id}/export.md", headers=headers)
    assert md_resp.status_code == 200
    assert md_resp.headers["content-type"].startswith("text/markdown")
    assert "# AI Search Visibility Audit" in md_resp.text
    # Markdown metadata identifies the measurement mode + aggregate provenance.
    assert "- **Model provenance:**" in md_resp.text
    assert f"`gemini` via `google` model `{GEMINI_MODEL}` (retrieval on)" in (
        md_resp.text
    )

    # Cross-workspace access is denied (invariant 5): a member of another
    # workspace cannot read this audit's metrics.
    import uuid

    bad = await client.get(
        f"/api/v1/audits/{audit.id}/metrics",
        headers={"X-Workspace-Id": str(uuid.uuid4())},
    )
    assert bad.status_code == 404
