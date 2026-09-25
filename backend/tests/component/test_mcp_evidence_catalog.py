"""MCP evidence enumeration, retrieval, and generated-catalog contracts."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from mcp.server.auth.middleware.auth_context import auth_context_var
from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser
from mcp.server.auth.provider import AccessToken
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.mcp import MCP_MAX_VISIBILITY_SOURCE_OFFSET, MCP_READ_SCOPE
from app.domain.mcp import evidence_readers, retrieval
from app.domain.mcp.common import _cursor_decode, _cursor_encode
from app.domain.mcp.evidence_readers import (
    read_prompt_portfolio,
    read_query_evidence,
    read_search_dataset,
    read_search_intelligence,
    read_site_links,
    read_site_pages,
    read_visibility_results,
    read_visibility_sources,
)
from app.domain.mcp.oauth_provider import resource_url
from app.domain.mcp.retrieval import fetch_business_record
from app.domain.mcp.server import mcp_server
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember

TOOL_REFERENCE = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "frontend/apps/marketing/src/data/mcp-tools.json"
    ).read_text(encoding="utf-8")
)


async def _account(
    session: AsyncSession, label: str
) -> tuple[User, Workspace, Project]:
    user = User(
        email=f"{label}-{uuid.uuid4().hex[:8]}@example.test", hashed_password="x"
    )
    workspace = Workspace(name=f"{label} workspace")
    session.add_all([user, workspace])
    await session.flush()
    project = Project(
        workspace_id=workspace.id,
        name=f"{label} project",
        brand_name=label,
        website_url=f"https://{label}.example",
    )
    session.add_all(
        [WorkspaceMember(workspace_id=workspace.id, user_id=user.id), project]
    )
    await session.commit()
    return user, workspace, project


def _caller(user: User):
    return auth_context_var.set(
        AuthenticatedUser(
            AccessToken(
                token="test",
                client_id="test-client",
                scopes=[MCP_READ_SCOPE],
                subject=str(user.id),
                resource=resource_url(),
            )
        )
    )


@pytest.mark.asyncio
async def test_prompt_portfolio_pages_without_skips_and_fetches_a_document(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, _workspace, project = await _account(db_session, "portfolio")
    prompt_set = PromptSet(project_id=project.id, name="Complete set")
    db_session.add(prompt_set)
    await db_session.flush()
    db_session.add_all(
        [
            Prompt(prompt_set_id=prompt_set.id, text=f"Prompt {index:02d}")
            for index in range(51)
        ]
    )
    await db_session.commit()

    token = _caller(user)
    try:
        first = await read_prompt_portfolio(db_session, str(project.id), limit=50)
        second = await read_prompt_portfolio(
            db_session,
            str(project.id),
            limit=50,
            cursor=first["pagination"]["next_cursor"],
        )
        document = await fetch_business_record(
            db_session, first["items"][0]["record_uri"]
        )
        monkeypatch.setattr(
            "app.domain.mcp.retrieval_document.MCP_MAX_DOCUMENT_BYTES", 800
        )
        first_part = await fetch_business_record(
            db_session, first["items"][0]["record_uri"]
        )
        second_part = await fetch_business_record(
            db_session, first_part["metadata"]["part_uris"][1]
        )
        with pytest.raises(LookupError, match="part was not found"):
            await fetch_business_record(
                db_session,
                f"{first['items'][0]['record_uri']}?part=999",
            )
    finally:
        auth_context_var.reset(token)

    identities = [item["id"] for item in first["items"] + second["items"]]
    assert len(identities) == len(set(identities)) == 51
    assert first["pagination"]["has_more"] is True
    assert second["pagination"]["has_more"] is False
    assert document["metadata"]["record_type"] == "prompt"
    assert document["metadata"]["project_id"] == str(project.id)
    assert document["url"].startswith("http")
    assert document["text"]
    assert first_part["metadata"]["complete"] is False
    assert len(json.dumps(first_part).encode()) <= 800
    assert second_part["metadata"]["part"] == 1


@pytest.mark.asyncio
async def test_saved_evidence_reads_stay_unavailable_and_tenant_scoped(
    db_session: AsyncSession,
) -> None:
    caller, _workspace, project = await _account(db_session, "caller")
    _other, _other_workspace, foreign = await _account(db_session, "foreign")
    token = _caller(caller)
    try:
        missing = await read_query_evidence(
            db_session,
            str(project.id),
            window_start="2026-09-01",
            window_end="2026-09-07",
        )
        search = await read_search_intelligence(db_session, str(project.id))
        with pytest.raises(LookupError, match="not found"):
            await read_search_intelligence(db_session, str(foreign.id))
    finally:
        auth_context_var.reset(token)

    assert missing["state"] == "unavailable"
    assert missing["reason"] == "exact_query_evidence_window_not_projected"
    assert search["state"] == "available"
    assert search["datasets"] == []
    assert search["read_only"] is True


@pytest.mark.asyncio
async def test_visibility_source_cursor_rejects_invalid_offsets(
    db_session: AsyncSession,
) -> None:
    caller, _workspace, project = await _account(db_session, "source-cursor")
    token = _caller(caller)
    try:
        for offset in (-1, MCP_MAX_VISIBILITY_SOURCE_OFFSET + 1):
            with pytest.raises(ValueError, match="cursor offset"):
                await read_visibility_sources(
                    db_session,
                    str(project.id),
                    audit_id=str(uuid.uuid4()),
                    cursor=_cursor_encode(offset),
                )
        with pytest.raises(ValueError, match="cursor is invalid"):
            _cursor_decode("a", 1)
    finally:
        auth_context_var.reset(token)


@pytest.mark.asyncio
async def test_site_page_and_issue_references_use_current_owner_ids(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    caller, workspace, project = await _account(db_session, "site-refs")
    crawl_id, site_url_id, analysis_id, issue_id = (uuid.uuid4() for _ in range(4))
    crawl = SimpleNamespace(
        id=crawl_id,
        status="completed",
        inventory_complete=True,
        created_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
        admitted_url_count=1,
        analyzed_url_count=1,
        failed_url_count=0,
    )

    async def selected_crawl(*_args: object, **_kwargs: object) -> object:
        return crawl

    async def pages(*_args: object, **_kwargs: object) -> dict:
        return {
            "items": [{"site_url_id": site_url_id}],
            "next_cursor": None,
            "root_errors": [],
        }

    async def analysis_ids(*_args: object, **_kwargs: object) -> dict:
        return {site_url_id: analysis_id}

    async def page_detail(*_args: object, **_kwargs: object) -> dict:
        return {
            "display_url": "https://site-refs.example/page",
            "issues": [{"occurrence_id": issue_id}],
        }

    monkeypatch.setattr(evidence_readers, "_selected_crawl", selected_crawl)
    monkeypatch.setattr(evidence_readers.site_health_service, "get_pages", pages)
    monkeypatch.setattr(
        evidence_readers.site_health_service,
        "get_current_page_analysis_ids",
        analysis_ids,
    )
    monkeypatch.setattr(retrieval.site_health_service, "get_page_detail", page_detail)

    class AnalysisSession:
        async def scalar(self, _statement: object) -> object:
            return SimpleNamespace(
                workspace_id=workspace.id,
                project_id=project.id,
                crawl_id=crawl_id,
                site_url_id=site_url_id,
                created_at=datetime.now(UTC),
            )

    token = _caller(caller)
    try:
        page_result = await read_site_pages(db_session, str(project.id))
        detail = await retrieval._resolve_site_page(AnalysisSession(), analysis_id)
    finally:
        auth_context_var.reset(token)

    assert (
        page_result["items"][0]["record_uri"] == f"citeladder://site_page/{analysis_id}"
    )
    assert detail is not None
    assert (
        detail.record["issues"][0]["record_uri"]
        == f"citeladder://site_issue/{issue_id}"
    )


@pytest.mark.asyncio
async def test_every_detailed_reader_refuses_a_foreign_project(
    db_session: AsyncSession,
) -> None:
    caller, _workspace, _project = await _account(db_session, "reader")
    _other, _other_workspace, foreign = await _account(db_session, "outside")
    arbitrary_id = str(uuid.uuid4())
    token = _caller(caller)
    try:
        calls = [
            read_prompt_portfolio(db_session, str(foreign.id)),
            read_query_evidence(
                db_session,
                str(foreign.id),
                window_start="2026-09-01",
                window_end="2026-09-07",
            ),
            read_site_pages(db_session, str(foreign.id)),
            read_site_links(db_session, str(foreign.id), crawl_id=arbitrary_id),
            read_visibility_results(db_session, str(foreign.id), audit_id=arbitrary_id),
            read_visibility_sources(db_session, str(foreign.id), audit_id=arbitrary_id),
            read_search_intelligence(db_session, str(foreign.id)),
            read_search_dataset(db_session, str(foreign.id), dataset_id=arbitrary_id),
        ]
        for call in calls:
            with pytest.raises(LookupError, match="not found"):
                await call
    finally:
        auth_context_var.reset(token)


@pytest.mark.asyncio
async def test_generated_tool_reference_matches_registered_catalog() -> None:
    registered = {tool.name: tool for tool in await mcp_server.list_tools()}
    documented = {tool["name"]: tool for tool in TOOL_REFERENCE["tools"]}

    assert documented.keys() == registered.keys()
    assert all(tool["read_only"] for tool in documented.values())
    assert "list_skills" not in documented
    assert "get_skill" not in documented
    for name, tool in registered.items():
        assert documented[name]["description"] == tool.description
        assert documented[name]["input_schema"] == tool.input_schema
