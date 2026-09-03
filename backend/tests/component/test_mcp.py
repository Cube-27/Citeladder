"""Remote MCP auth, account scope, and discovery contract."""

from __future__ import annotations

import re
import uuid
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from mcp.server.auth.middleware.auth_context import auth_context_var
from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser
from mcp.server.auth.provider import AccessToken, AuthorizationParams
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import AnyUrl
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.config.mcp import MCP_READ_SCOPE, mcp_settings
from app.core.config.opportunities import OPPORTUNITY_TYPE_SITE
from app.core.security import create_access_token
from app.domain.mcp import server as mcp_server_module
from app.domain.mcp.data import (
    fetch_business_record,
    list_account_projects,
    project_business_context,
    read_growth_evidence,
    search_business_context,
)
from app.domain.mcp.oauth_provider import (
    CiteLadderOAuthProvider,
    consent_csrf_token,
    resource_url,
)
from app.domain.mcp.server import mcp_oauth_provider
from app.models.opportunity import Opportunity
from app.models.project import Project
from app.models.prompt import Prompt, PromptSet
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


async def _seed_account(
    session: AsyncSession, email: str
) -> tuple[User, Workspace, Project]:
    user = User(email=email, hashed_password="unused-test-hash")
    workspace = Workspace(name=f"{email} workspace")
    session.add_all([user, workspace])
    await session.flush()
    project = Project(
        workspace_id=workspace.id,
        name=f"{email} project",
        brand_name="Example Brand",
        website_url="https://example.test",
    )
    session.add_all(
        [
            WorkspaceMember(workspace_id=workspace.id, user_id=user.id),
            project,
        ]
    )
    await session.commit()
    return user, workspace, project


def _client_info() -> OAuthClientInformationFull:
    return OAuthClientInformationFull(
        client_id=str(uuid.uuid4()),
        client_name="MCP test client",
        redirect_uris=[AnyUrl("http://127.0.0.1/callback")],
        token_endpoint_auth_method="none",
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
        scope=MCP_READ_SCOPE,
    )


@pytest.mark.asyncio
async def test_oauth_grant_is_account_scoped_and_revocable(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_settings, "enabled", True)
    monkeypatch.setattr(mcp_settings, "allowed_account_email", "member@example.test")
    async with session_factory() as session:
        user, _workspace, project = await _seed_account(session, "member@example.test")
        _outsider, _outsider_workspace, outsider_project = await _seed_account(
            session, "outsider@example.test"
        )

    provider = CiteLadderOAuthProvider(session_factory)
    oauth_client = _client_info()
    await provider.register_client(oauth_client)
    authorization_url = await provider.authorize(
        oauth_client,
        AuthorizationParams(
            state="client-state",
            scopes=[MCP_READ_SCOPE],
            code_challenge="A" * 43,
            redirect_uri=AnyUrl("http://127.0.0.1/callback"),
            redirect_uri_provided_explicitly=True,
            resource=resource_url(),
        ),
    )
    transaction = parse_qs(urlsplit(authorization_url).query)["transaction"][0]
    callback = await provider.complete_authorization(transaction, user.id)
    callback_params = parse_qs(urlsplit(callback).query)
    assert callback_params["state"] == ["client-state"]

    raw_code = callback_params["code"][0]
    code = await provider.load_authorization_code(oauth_client, raw_code)
    assert code is not None
    tokens = await provider.exchange_authorization_code(oauth_client, code)
    access = await provider.load_access_token(tokens.access_token)
    assert access is not None
    assert access.subject == str(user.id)
    assert access.resource == resource_url()

    context_token = auth_context_var.set(AuthenticatedUser(access))
    try:
        async with session_factory() as session:
            visible = await list_account_projects(session)
            context = await project_business_context(session, str(project.id))
            with pytest.raises(LookupError, match="not found"):
                await project_business_context(session, str(outsider_project.id))
    finally:
        auth_context_var.reset(context_token)
    assert [item["id"] for item in visible["projects"]] == [str(project.id)]
    assert context["project"]["id"] == str(project.id)
    assert set(context["evidence"]) == {
        "site.read_snapshot",
        "demand.read_snapshot",
        "opportunities.read_ranked",
        "audits.read_latest",
    }

    monkeypatch.setattr(mcp_oauth_provider, "_session_factory", session_factory)
    monkeypatch.setattr(mcp_server_module, "SessionLocal", session_factory)
    protocol_headers = {
        "Host": "127.0.0.1:3000",
        "Accept": "application/json, text/event-stream",
        "Authorization": f"Bearer {tokens.access_token}",
    }
    async with mcp_server_module.mcp_server.session_manager.run():
        initialized = await client.post(
            "/mcp",
            headers=protocol_headers,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-11-25",
                    "capabilities": {},
                    "clientInfo": {"name": "test", "version": "1"},
                },
            },
        )
        listed = await client.post(
            "/mcp",
            headers=protocol_headers,
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        )
        called = await client.post(
            "/mcp",
            headers=protocol_headers,
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "list_projects", "arguments": {}},
            },
        )
    assert initialized.status_code == 200
    assert initialized.json()["result"]["serverInfo"]["name"] == "citeladder"
    assert listed.status_code == 200
    assert {tool["name"] for tool in listed.json()["result"]["tools"]} >= {
        "list_projects",
        "get_project_business_context",
        "search",
        "fetch",
        "list_skills",
    }
    assert called.status_code == 200
    assert called.json()["result"]["isError"] is False
    assert str(project.id) in called.text

    refresh = await provider.load_refresh_token(
        oauth_client, tokens.refresh_token or ""
    )
    assert refresh is not None
    rotated = await provider.exchange_refresh_token(oauth_client, refresh, [])
    assert await provider.load_access_token(tokens.access_token) is None
    rotated_access = await provider.load_access_token(rotated.access_token)
    assert rotated_access is not None

    await provider.revoke_token(rotated_access)
    assert await provider.load_access_token(tokens.access_token) is None
    assert await provider.load_access_token(rotated.access_token) is None


@pytest.mark.asyncio
async def test_demo_allowlist_rejects_another_account(
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_settings, "enabled", True)
    monkeypatch.setattr(mcp_settings, "allowed_account_email", "demo@example.test")
    async with session_factory() as session:
        user, _workspace, _project = await _seed_account(session, "other@example.test")
    provider = CiteLadderOAuthProvider(session_factory)
    client = _client_info()
    await provider.register_client(client)
    authorization_url = await provider.authorize(
        client,
        AuthorizationParams(
            state=None,
            scopes=[MCP_READ_SCOPE],
            code_challenge="B" * 43,
            redirect_uri=AnyUrl("http://127.0.0.1/callback"),
            redirect_uri_provided_explicitly=True,
            resource=resource_url(),
        ),
    )
    transaction = parse_qs(urlsplit(authorization_url).query)["transaction"][0]
    with pytest.raises(PermissionError, match="not enabled"):
        await provider.complete_authorization(transaction, user.id)


@pytest.mark.asyncio
async def test_mcp_discovery_registration_and_bearer_challenge(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_settings, "enabled", True)
    monkeypatch.setattr(mcp_oauth_provider, "_session_factory", session_factory)
    authorization = await client.get("/.well-known/oauth-authorization-server")
    assert authorization.status_code == 200
    assert authorization.json()["registration_endpoint"].endswith("/register")
    assert authorization.json()["code_challenge_methods_supported"] == ["S256"]

    resource = await client.get("/.well-known/oauth-protected-resource/mcp")
    assert resource.status_code == 200
    assert resource.json()["resource"].endswith("/mcp")
    assert resource.json()["scopes_supported"] == [MCP_READ_SCOPE]

    registration = await client.post(
        "/register",
        json={
            "client_name": "Protocol test client",
            "redirect_uris": ["http://127.0.0.1/callback"],
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": MCP_READ_SCOPE,
        },
    )
    assert registration.status_code == 201
    client_id = registration.json()["client_id"]
    uuid.UUID(client_id)

    authorize = await client.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": "http://127.0.0.1/callback",
            "scope": MCP_READ_SCOPE,
            "state": "protocol-state",
            "code_challenge": "C" * 43,
            "code_challenge_method": "S256",
            "resource": resource_url(),
        },
        follow_redirects=False,
    )
    assert authorize.status_code == 302
    assert authorize.headers["location"].startswith(
        f"{resource_url().removesuffix('/mcp')}/mcp/oauth/consent?transaction="
    )

    response = await client.post(
        "/mcp",
        headers={
            "Host": "127.0.0.1:3000",
            "Accept": "application/json, text/event-stream",
        },
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1"},
            },
        },
    )
    assert response.status_code == 401
    assert "resource_metadata=" in response.headers["www-authenticate"]


@pytest.mark.asyncio
async def test_browser_consent_requires_an_explicit_approval(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_settings, "enabled", True)
    monkeypatch.setattr(mcp_settings, "allowed_account_email", "consent@example.test")
    monkeypatch.setattr(mcp_oauth_provider, "_session_factory", session_factory)
    monkeypatch.setattr(mcp_server_module, "SessionLocal", session_factory)
    async with session_factory() as session:
        user, _workspace, _project = await _seed_account(
            session, "consent@example.test"
        )

    oauth_client = _client_info()
    await mcp_oauth_provider.register_client(oauth_client)
    authorization_url = await mcp_oauth_provider.authorize(
        oauth_client,
        AuthorizationParams(
            state="consent-state",
            scopes=[MCP_READ_SCOPE],
            code_challenge="B" * 43,
            redirect_uri=AnyUrl("http://127.0.0.1/callback"),
            redirect_uri_provided_explicitly=True,
            resource=resource_url(),
        ),
    )
    transaction = parse_qs(urlsplit(authorization_url).query)["transaction"][0]
    session_token = create_access_token(
        str(user.id), token_version=user.session_version
    )
    client.cookies.set(settings.session_cookie_name, session_token)

    # A GET only describes the grant; it must not mint a code.
    page = await client.get(
        "/mcp/oauth/consent",
        params={"transaction": transaction},
        follow_redirects=False,
    )
    assert page.status_code == 200
    assert "MCP test client" in page.text
    assert MCP_READ_SCOPE in page.text
    assert "http://127.0.0.1/callback" in page.text
    assert page.headers["cache-control"] == "no-store"

    forged = await client.post(
        "/mcp/oauth/consent",
        data={"transaction": transaction, "csrf_token": "forged"},
        follow_redirects=False,
    )
    assert forged.status_code == 403

    # The rejected POST left the transaction intact for a real approval.
    csrf = re.search(r'name="csrf_token" value="([^"]+)"', page.text)
    assert csrf is not None
    assert csrf.group(1) == consent_csrf_token(session_token, transaction)
    approved = await client.post(
        "/mcp/oauth/consent",
        data={"transaction": transaction, "csrf_token": csrf.group(1)},
        follow_redirects=False,
    )
    assert approved.status_code == 303
    callback_params = parse_qs(urlsplit(approved.headers["location"]).query)
    assert callback_params["state"] == ["consent-state"]
    code = await mcp_oauth_provider.load_authorization_code(
        oauth_client, callback_params["code"][0]
    )
    assert code is not None

    # One approval, one code: the consumed transaction cannot be replayed.
    replay = await client.post(
        "/mcp/oauth/consent",
        data={"transaction": transaction, "csrf_token": csrf.group(1)},
        follow_redirects=False,
    )
    assert replay.status_code == 403


@pytest.mark.asyncio
async def test_browser_consent_without_a_session_bounces_through_login(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_settings, "enabled", True)
    response = await client.get(
        "/mcp/oauth/consent",
        params={"transaction": "anonymous-transaction"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert "/login?return_to=" in response.headers["location"]


@pytest.mark.asyncio
async def test_mcp_protocol_paths_stay_behind_the_request_body_limit(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The dispatcher short-circuits the stack, so the limit wraps the SDK app."""
    monkeypatch.setattr(mcp_settings, "enabled", True)
    response = await client.post(
        "/mcp",
        content=b"{}",
        headers={
            "Host": "127.0.0.1:3000",
            "Content-Length": str(3 * 1024 * 1024),
        },
    )
    assert response.status_code == 413


@pytest.mark.asyncio
async def test_disabled_mcp_exposes_no_protocol_surface(
    client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A deployment that never opted in must not answer as an OAuth server."""
    monkeypatch.setattr(mcp_settings, "enabled", False)
    for path in (
        "/register",
        "/authorize",
        "/mcp",
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-protected-resource/mcp",
    ):
        response = await client.get(path, follow_redirects=False)
        assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_system_workspace_membership_authorizes_no_read_path(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """A stray SYSTEM-workspace membership must authorize nothing (T11).

    System workspaces cannot have memberships, so this row should not exist —
    which is exactly why it is worth pinning. ``list_account_projects`` filtered
    ``is_system`` while the other six reads joined ``WorkspaceMember`` inline
    without it, so the same stray row hid a project from the list and served its
    opportunities, prompts and business context from every other tool. Every
    read path is asserted here, not just the listing, because the bug was the
    two halves disagreeing.
    """
    async with session_factory() as session:
        user = User(email="system-boundary@example.test", hashed_password="unused")
        system_workspace = Workspace(name="system", is_system=True)
        session.add_all([user, system_workspace])
        await session.flush()
        project = Project(
            workspace_id=system_workspace.id,
            name="System project",
            brand_name="System Brand",
            website_url="https://system.test",
        )
        session.add_all(
            [
                WorkspaceMember(workspace_id=system_workspace.id, user_id=user.id),
                project,
            ]
        )
        await session.flush()
        # Prompts reach the workspace through PromptSet -> Project, which is
        # why the MCP prompt reads join that way.
        prompt_set = PromptSet(project_id=project.id, name="Set")
        opportunity = Opportunity(
            workspace_id=system_workspace.id,
            project_id=project.id,
            rule_id="technical.indexable",
            opportunity_type=OPPORTUNITY_TYPE_SITE,
            target_key="https://system.test/",
            severity="critical",
            title="System opportunity",
            remediation="Should never be readable over MCP",
        )
        session.add_all([prompt_set, opportunity])
        await session.flush()
        prompt = Prompt(prompt_set_id=prompt_set.id, text="System prompt text")
        session.add(prompt)
        await session.commit()
        project_id, opportunity_id, prompt_id = project.id, opportunity.id, prompt.id

    access = AccessToken(
        token="unused-in-process-token",
        client_id="test-client",
        scopes=[MCP_READ_SCOPE],
        subject=str(user.id),
        resource=resource_url(),
    )
    context_token = auth_context_var.set(AuthenticatedUser(access))
    try:
        async with session_factory() as session:
            assert (await list_account_projects(session))["projects"] == []

            assert (await search_business_context(session, "System"))["results"] == []

            with pytest.raises(LookupError, match="not found"):
                await project_business_context(session, str(project_id))

            with pytest.raises(LookupError, match="not found"):
                await read_growth_evidence(
                    session, str(project_id), "site.read_snapshot"
                )

            for record_id in (
                f"citeladder://project/{project_id}",
                f"citeladder://opportunity/{opportunity_id}",
                f"citeladder://prompt/{prompt_id}",
            ):
                with pytest.raises(LookupError, match="not found"):
                    await fetch_business_record(session, record_id)
    finally:
        auth_context_var.reset(context_token)
