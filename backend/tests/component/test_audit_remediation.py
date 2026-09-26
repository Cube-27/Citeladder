"""PostgreSQL acceptance history and live MCP consent boundaries."""

import uuid

import pytest
from mcp.server.auth.middleware.auth_context import auth_context_var
from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.connectors.web_evidence.contracts import FetchError
from app.core.config import legal
from app.domain.auth.policies import PolicyDecision, accept_policy, policy_status
from app.domain.mcp.connections import list_connections, revoke_connection
from app.domain.mcp.data import list_account_projects
from app.domain.site_health.acquisition_controls import authorize_acquisition
from app.models.mcp import McpOAuthGrant
from app.models.policy_acceptance import PolicyAcceptance
from app.models.project import Project
from app.models.security_event import SecurityEvent
from app.models.user import User
from app.models.web_acquisition_control import WebAcquisitionControl
from app.models.workspace import Workspace, WorkspaceMember
from tests.component.mcp_helpers import read_grant


async def _account(session):
    user = User(email=f"{uuid.uuid4()}@example.test", hashed_password="test")
    spaces = [Workspace(name=name) for name in ("Selected", "Unselected")]
    session.add_all([user, *spaces])
    await session.flush()
    for space in spaces:
        session.add_all(
            [
                WorkspaceMember(workspace_id=space.id, user_id=user.id),
                Project(
                    workspace_id=space.id,
                    name=space.name,
                    brand_name=space.name,
                    website_url="https://example.test",
                ),
            ]
        )
    await session.commit()
    return user, spaces


@pytest.mark.asyncio
async def test_scope_is_live_and_workspace_admin_cannot_see_or_revoke_other_scopes(
    db_session,
):
    user, spaces = await _account(db_session)
    token = await read_grant(db_session, user.id, [str(spaces[0].id)])
    context = auth_context_var.set(AuthenticatedUser(token))
    grant_id = uuid.UUID(token.claims["grant_id"])
    try:
        assert [
            row["name"] for row in (await list_account_projects(db_session))["projects"]
        ] == ["Selected"]
        # Membership alone never expands a connection, even after consent.
        newcomer = Workspace(name="Joined later")
        db_session.add(newcomer)
        await db_session.flush()
        db_session.add_all(
            [
                WorkspaceMember(workspace_id=newcomer.id, user_id=user.id),
                Project(
                    workspace_id=newcomer.id,
                    name="Later",
                    brand_name="Later",
                    website_url="https://later.test",
                ),
            ]
        )
        await db_session.commit()
        assert len((await list_account_projects(db_session))["projects"]) == 1
        assert await list_connections(db_session, workspace_id=spaces[1].id) == []
        assert not await revoke_connection(
            db_session, grant_id=grant_id, actor_id=user.id, workspace_id=spaces[1].id
        )
        assert await revoke_connection(
            db_session, grant_id=grant_id, actor_id=user.id, workspace_id=spaces[0].id
        )
        assert (await list_account_projects(db_session))["projects"] == []
    finally:
        auth_context_var.reset(context)


@pytest.mark.asyncio
async def test_membership_loss_and_account_revocation_apply_to_loaded_token(db_session):
    user, spaces = await _account(db_session)
    token = await read_grant(db_session, user.id)
    context = auth_context_var.set(AuthenticatedUser(token))
    try:
        member = await db_session.scalar(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == spaces[0].id,
                WorkspaceMember.user_id == user.id,
            )
        )
        await db_session.delete(member)
        await db_session.commit()
        assert [
            row["name"] for row in (await list_account_projects(db_session))["projects"]
        ] == ["Unselected"]
        assert await revoke_connection(
            db_session, grant_id=uuid.UUID(token.claims["grant_id"]), actor_id=user.id
        )
        assert (await list_account_projects(db_session))["projects"] == []
    finally:
        auth_context_var.reset(context)


@pytest.mark.asyncio
async def test_legacy_grant_never_inherits_account_memberships(db_session):
    user, _spaces = await _account(db_session)
    token = await read_grant(db_session, user.id, [])
    context = auth_context_var.set(AuthenticatedUser(token))
    try:
        assert (await list_account_projects(db_session))["projects"] == []
        assert (await list_connections(db_session, user_id=user.id))[0].requires_consent
    finally:
        auth_context_var.reset(context)


@pytest.mark.asyncio
async def test_suppression_is_live_matches_subdomains_and_global_stop(
    db_session, session_factory
):
    user, _spaces = await _account(db_session)
    await authorize_acquisition(
        "https://shop.example.test/page", session_factory=session_factory
    )
    rule = WebAcquisitionControl(
        domain="example.test",
        blocked=True,
        actor_id=user.id,
        reason="Verified crawler complaint",
    )
    db_session.add(rule)
    await db_session.commit()
    with pytest.raises(FetchError, match="suppressed"):
        await authorize_acquisition(
            "https://shop.example.test/page", session_factory=session_factory
        )
    await authorize_acquisition(
        "https://notexample.test/", session_factory=session_factory
    )
    db_session.add(
        WebAcquisitionControl(
            domain="xn--bcher-kva.test",
            blocked=True,
            actor_id=user.id,
            reason="Verified international domain complaint",
        )
    )
    await db_session.commit()
    with pytest.raises(FetchError, match="suppressed"):
        await authorize_acquisition(
            "https://shop.bücher.test/page", session_factory=session_factory
        )
    rule.blocked = False
    await db_session.commit()
    await authorize_acquisition(
        "https://shop.example.test/page", session_factory=session_factory
    )
    db_session.add(
        WebAcquisitionControl(
            domain="*", blocked=True, actor_id=user.id, reason="Incident stop"
        )
    )
    await db_session.commit()
    with pytest.raises(FetchError, match="suppressed"):
        await authorize_acquisition(
            "https://another.test/", session_factory=session_factory
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url", ["https://[unclosed/page", f"https://{'a' * 70}.example.test/"]
)
async def test_unparseable_hop_fails_closed_as_acquisition_unavailable(
    url, session_factory
):
    # A malformed redirect Location must be refused, never crash the caller.
    with pytest.raises(FetchError) as exc:
        await authorize_acquisition(url, session_factory=session_factory)
    assert exc.value.error_code == "acquisition_unavailable"
    assert isinstance(exc.value.__cause__, ValueError)


@pytest.mark.asyncio
async def test_policy_store_outage_fails_closed_as_typed_fetch_error():
    def unavailable_store():
        raise OperationalError("SELECT 1", {}, OSError("connection refused"))

    with pytest.raises(FetchError) as exc:
        await authorize_acquisition(
            "https://example.test/", session_factory=unavailable_store
        )
    assert exc.value.error_code == "acquisition_unavailable"


@pytest.mark.asyncio
async def test_acceptance_is_idempotent_and_old_revision_survives_renewal(
    db_session, monkeypatch
):
    user, spaces = await _account(db_session)
    decision = PolicyDecision(terms_revision=legal.TERMS_REVISION, accept_terms=True)
    first = await accept_policy(db_session, user.id, spaces[0].id, decision)
    second = await accept_policy(db_session, user.id, spaces[0].id, decision)
    assert first.accepted_at == second.accepted_at
    assert (await policy_status(db_session, user.id, spaces[1].id)).accepted_at is None
    monkeypatch.setattr(legal, "TERMS_REVISION", "approved-material-change")
    assert (await policy_status(db_session, user.id, spaces[0].id)).accepted_at is None
    with pytest.raises(ValueError, match="Terms changed"):
        await accept_policy(db_session, user.id, spaces[0].id, decision)
    await accept_policy(
        db_session,
        user.id,
        spaces[0].id,
        PolicyDecision(terms_revision=legal.TERMS_REVISION, accept_terms=True),
    )
    assert (
        await db_session.scalar(select(func.count()).select_from(PolicyAcceptance)) == 2
    )
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(SecurityEvent)
            .where(SecurityEvent.event == "policy.accept")
        )
        == 2
    )
    assert await db_session.scalar(select(func.count()).select_from(McpOAuthGrant)) == 0
