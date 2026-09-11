"""The four-role matrix, invitations, and ownership transfer (plan §2.3/§2.4).

The role matrix is exercised as a PARAMETERIZED table rather than a suite per
role per endpoint: one representative endpoint per capability, every role, one
assertion each. Owner/Admin parity, Member's billing and member-management
denials, and Viewer's write denials all fall out of the same table.

Everything here uses ordinary seeded password accounts and the real HTTP
surface. No auth bypass, and no admin tenancy shortcut.
"""

from __future__ import annotations

import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.accounts import billing_account_for
from app.domain.workspaces.policy import (
    ASSIGNABLE_WORKSPACE_ROLES,
    WORKSPACE_ROLE_ADMIN,
    WORKSPACE_ROLE_MEMBER,
    WORKSPACE_ROLE_OWNER,
    WORKSPACE_ROLE_VIEWER,
    WorkspaceCapability,
    effective_capabilities,
    role_allows,
)
from app.models.billing import BillingAccount
from app.models.user import User
from app.models.workspace import WorkspaceInvitation, WorkspaceMember
from tests.component.auth_helpers import register_and_login

_PASSWORD = "password123"


async def _login(client: httpx.AsyncClient, email: str) -> None:
    client.cookies.clear()
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": _PASSWORD}
    )
    assert response.status_code == 200, response.text


async def _seed_role(
    session: AsyncSession,
    client: httpx.AsyncClient,
    *,
    workspace_id: uuid.UUID,
    email: str,
    role: str,
) -> uuid.UUID:
    """Register ``email`` and give it ``role`` inside ``workspace_id``."""
    await register_and_login(client, email)
    user_id = await session.scalar(select(User.id).where(User.email == email))
    assert user_id is not None
    session.add(WorkspaceMember(workspace_id=workspace_id, user_id=user_id, role=role))
    await session.commit()
    return user_id


@pytest.fixture
async def owned_workspace(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> uuid.UUID:
    await register_and_login(client, "role-owner@example.com")
    workspaces = (await client.get("/api/v1/workspaces")).json()
    assert len(workspaces) == 1
    return uuid.UUID(workspaces[0]["id"])


# ---------------------------------------------------------------------------
# The static policy itself
# ---------------------------------------------------------------------------


def test_owner_and_admin_have_identical_permissions() -> None:
    """Owner is a continuity designation, not an extra privilege level."""
    assert effective_capabilities(WORKSPACE_ROLE_OWNER) == effective_capabilities(
        WORKSPACE_ROLE_ADMIN
    )


@pytest.mark.parametrize(
    ("role", "capability", "allowed"),
    [
        (WORKSPACE_ROLE_OWNER, WorkspaceCapability.MANAGE_BILLING, True),
        (WORKSPACE_ROLE_ADMIN, WorkspaceCapability.MANAGE_BILLING, True),
        (WORKSPACE_ROLE_MEMBER, WorkspaceCapability.MANAGE_BILLING, False),
        (WORKSPACE_ROLE_VIEWER, WorkspaceCapability.MANAGE_BILLING, False),
        (WORKSPACE_ROLE_MEMBER, WorkspaceCapability.MANAGE_MEMBERS, False),
        (WORKSPACE_ROLE_MEMBER, WorkspaceCapability.MANAGE_CREDENTIALS, False),
        (WORKSPACE_ROLE_MEMBER, WorkspaceCapability.WRITE, True),
        (WORKSPACE_ROLE_MEMBER, WorkspaceCapability.RUN, True),
        (WORKSPACE_ROLE_VIEWER, WorkspaceCapability.WRITE, False),
        (WORKSPACE_ROLE_VIEWER, WorkspaceCapability.RUN, False),
        (WORKSPACE_ROLE_VIEWER, WorkspaceCapability.READ, True),
        ("platform-admin", WorkspaceCapability.READ, False),
    ],
)
def test_role_matrix(role: str, capability: WorkspaceCapability, allowed: bool) -> None:
    """One static matrix, including an unknown role that authorizes nothing."""
    assert role_allows(role, capability) is allowed


def test_owner_is_never_an_assignable_role() -> None:
    """The single designated Owner changes only through a transfer."""
    assert WORKSPACE_ROLE_OWNER not in ASSIGNABLE_WORKSPACE_ROLES


# ---------------------------------------------------------------------------
# The matrix as the API actually enforces it
# ---------------------------------------------------------------------------

# (role, expected status) for each representative endpoint. 403 is a role
# denial; anything else means the role passed the gate and the handler ran.
_BILLING_ROLES = [
    (WORKSPACE_ROLE_OWNER, True),
    (WORKSPACE_ROLE_ADMIN, True),
    (WORKSPACE_ROLE_MEMBER, False),
    (WORKSPACE_ROLE_VIEWER, False),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(("role", "permitted"), _BILLING_ROLES)
async def test_billing_usage_is_administrative(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    owned_workspace: uuid.UUID,
    role: str,
    permitted: bool,
) -> None:
    """Private finance reads are Owner/Admin only, for every workspace role."""
    if role == WORKSPACE_ROLE_OWNER:
        await _login(client, "role-owner@example.com")
    else:
        email = f"billing-{role}@example.com"
        await _seed_role(
            db_session, client, workspace_id=owned_workspace, email=email, role=role
        )
        await _login(client, email)
    response = await client.get(
        "/api/v1/billing/usage", headers={"X-Workspace-Id": str(owned_workspace)}
    )
    assert (response.status_code != 403) is permitted, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(("role", "permitted"), _BILLING_ROLES)
async def test_member_management_is_administrative(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    owned_workspace: uuid.UUID,
    role: str,
    permitted: bool,
) -> None:
    if role == WORKSPACE_ROLE_OWNER:
        await _login(client, "role-owner@example.com")
    else:
        email = f"members-{role}@example.com"
        await _seed_role(
            db_session, client, workspace_id=owned_workspace, email=email, role=role
        )
        await _login(client, email)
    response = await client.get(f"/api/v1/workspaces/{owned_workspace}/members")
    assert (response.status_code != 403) is permitted, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "permitted"),
    [
        (WORKSPACE_ROLE_ADMIN, True),
        (WORKSPACE_ROLE_MEMBER, True),
        (WORKSPACE_ROLE_VIEWER, False),
    ],
)
async def test_project_creation_follows_the_write_capability(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    owned_workspace: uuid.UUID,
    role: str,
    permitted: bool,
) -> None:
    """Viewer is read-only; Member keeps every non-administrative action."""
    email = f"write-{role}@example.com"
    await _seed_role(
        db_session, client, workspace_id=owned_workspace, email=email, role=role
    )
    await _login(client, email)
    response = await client.post(
        "/api/v1/projects",
        json={"name": "Role check"},
        headers={"X-Workspace-Id": str(owned_workspace)},
    )
    assert (response.status_code != 403) is permitted, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(("role", "permitted"), _BILLING_ROLES)
async def test_provider_credentials_stay_administrative(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    owned_workspace: uuid.UUID,
    role: str,
    permitted: bool,
) -> None:
    """Credential management is Owner/Admin, NOT widened to Member."""
    if role == WORKSPACE_ROLE_OWNER:
        await _login(client, "role-owner@example.com")
    else:
        email = f"cred-{role}@example.com"
        await _seed_role(
            db_session, client, workspace_id=owned_workspace, email=email, role=role
        )
        await _login(client, email)
    response = await client.post(
        "/api/v1/provider-connections",
        json={"engine": "chatgpt", "transport": "api", "api_key": "sk-test"},
        headers={"X-Workspace-Id": str(owned_workspace)},
    )
    assert (response.status_code != 403) is permitted, response.text


@pytest.mark.asyncio
async def test_viewer_reads_are_allowed(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    owned_workspace: uuid.UUID,
) -> None:
    """Viewer keeps ordinary read access, including the member-safe projection."""
    await _seed_role(
        db_session,
        client,
        workspace_id=owned_workspace,
        email="viewer-read@example.com",
        role=WORKSPACE_ROLE_VIEWER,
    )
    await _login(client, "viewer-read@example.com")
    headers = {"X-Workspace-Id": str(owned_workspace)}
    assert (await client.get("/api/v1/projects", headers=headers)).status_code == 200
    entitlements = await client.get(
        f"/api/v1/workspaces/{owned_workspace}/entitlements", headers=headers
    )
    assert entitlements.status_code == 200
    body = entitlements.json()
    # Safe allowance hints, and nothing private.
    assert {hint["key"] for hint in body["occupancy"]} <= {
        "project_slots",
        "prompt_slots",
    }
    assert "billing_profile" not in entitlements.text
    assert "invoice" not in entitlements.text


# ---------------------------------------------------------------------------
# Shared budget, separate accounts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_members_spend_the_workspaces_budget_not_their_own(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    owned_workspace: uuid.UUID,
) -> None:
    """A member's own workspace sponsors nothing in somebody else's.

    Both workspaces have their own account, and reading the host workspace
    resolves the HOST's account — never the signed-in user's personal one.
    """
    await _seed_role(
        db_session,
        client,
        workspace_id=owned_workspace,
        email="guest-budget@example.com",
        role=WORKSPACE_ROLE_ADMIN,
    )
    await _login(client, "guest-budget@example.com")
    visible = (await client.get("/api/v1/workspaces")).json()
    guest_workspace = uuid.UUID(
        next(
            workspace
            for workspace in visible
            if workspace["role"] == WORKSPACE_ROLE_OWNER
        )["id"]
    )
    assert guest_workspace != owned_workspace

    host_account = await billing_account_for(db_session, owned_workspace)
    guest_account = await billing_account_for(db_session, guest_workspace)
    assert host_account is not None and guest_account is not None
    assert host_account.id != guest_account.id

    host_usage = await client.get(
        "/api/v1/billing/usage", headers={"X-Workspace-Id": str(owned_workspace)}
    )
    guest_usage = await client.get(
        "/api/v1/billing/usage", headers={"X-Workspace-Id": str(guest_workspace)}
    )
    assert host_usage.status_code == guest_usage.status_code == 200
    assert (
        host_usage.json()["billing_account_id"]
        != guest_usage.json()["billing_account_id"]
    )


@pytest.mark.asyncio
async def test_a_workspace_with_zero_projects_still_bills(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    owned_workspace: uuid.UUID,
) -> None:
    """No project is required to manage a workspace."""
    assert (await client.get("/api/v1/projects")).json() == []
    usage = await client.get(
        "/api/v1/billing/usage", headers={"X-Workspace-Id": str(owned_workspace)}
    )
    assert usage.status_code == 200
    members = await client.get(f"/api/v1/workspaces/{owned_workspace}/members")
    assert members.status_code == 200


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invitation_lifecycle_is_single_use_and_identity_bound(
    client: httpx.AsyncClient, db_session: AsyncSession, owned_workspace: uuid.UUID
) -> None:
    created = await client.post(
        f"/api/v1/workspaces/{owned_workspace}/invitations",
        json={"email": "Invitee@Example.com", "role": "member"},
    )
    assert created.status_code == 201, created.text
    token = created.json()["token"]
    invitation_id = created.json()["invitation"]["id"]
    assert created.json()["invitation"]["email"] == "invitee@example.com"

    # Only the HASH is stored: no later read returns the token.
    stored = await db_session.scalar(
        select(WorkspaceInvitation).where(
            WorkspaceInvitation.id == uuid.UUID(invitation_id)
        )
    )
    assert stored is not None and stored.token_sha256 != token
    listing = await client.get(f"/api/v1/workspaces/{owned_workspace}/invitations")
    assert token not in listing.text

    # A different identity cannot accept it.
    await register_and_login(client, "wrong-identity@example.com")
    refused = await client.post(
        "/api/v1/workspaces/invitations/accept", json={"token": token}
    )
    assert refused.status_code == 400

    # The invited identity can, once, and lands with the invited role.
    await register_and_login(client, "invitee@example.com")
    accepted = await client.post(
        "/api/v1/workspaces/invitations/accept", json={"token": token}
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["role"] == WORKSPACE_ROLE_MEMBER
    # Repeated acceptance never duplicates the membership.
    again = await client.post(
        "/api/v1/workspaces/invitations/accept", json={"token": token}
    )
    assert again.status_code == 200
    memberships = (
        await db_session.scalars(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == owned_workspace
            )
        )
    ).all()
    assert len({member.user_id for member in memberships}) == len(memberships)
    # Accepting never creates a second billing account for the workspace.
    accounts = await db_session.scalar(
        select(func.count(BillingAccount.id)).where(
            BillingAccount.workspace_id == owned_workspace
        )
    )
    assert accounts == 1


@pytest.mark.asyncio
async def test_invitation_role_choice_is_enforced_server_side(
    client: httpx.AsyncClient, owned_workspace: uuid.UUID
) -> None:
    """A caller cannot invite an Owner, even as an administrator."""
    refused = await client.post(
        f"/api/v1/workspaces/{owned_workspace}/invitations",
        json={"email": "sneaky@example.com", "role": "owner"},
    )
    assert refused.status_code == 422


@pytest.mark.asyncio
async def test_member_cannot_invite_or_promote_itself(
    client: httpx.AsyncClient, db_session: AsyncSession, owned_workspace: uuid.UUID
) -> None:
    """Calling the endpoint directly is refused by the role gate, not the UI."""
    user_id = await _seed_role(
        db_session,
        client,
        workspace_id=owned_workspace,
        email="self-promote@example.com",
        role=WORKSPACE_ROLE_MEMBER,
    )
    await _login(client, "self-promote@example.com")
    membership_id = await db_session.scalar(
        select(WorkspaceMember.id).where(
            WorkspaceMember.workspace_id == owned_workspace,
            WorkspaceMember.user_id == user_id,
        )
    )
    invite = await client.post(
        f"/api/v1/workspaces/{owned_workspace}/invitations",
        json={"email": "friend@example.com", "role": "admin"},
    )
    assert invite.status_code == 403
    promote = await client.patch(
        f"/api/v1/workspaces/{owned_workspace}/members/{membership_id}",
        json={"role": "admin"},
    )
    assert promote.status_code == 403


@pytest.mark.asyncio
async def test_revoked_invitation_stops_working(
    client: httpx.AsyncClient, owned_workspace: uuid.UUID
) -> None:
    created = await client.post(
        f"/api/v1/workspaces/{owned_workspace}/invitations",
        json={"email": "revoked@example.com", "role": "viewer"},
    )
    token = created.json()["token"]
    invitation_id = created.json()["invitation"]["id"]
    assert (
        await client.delete(
            f"/api/v1/workspaces/{owned_workspace}/invitations/{invitation_id}"
        )
    ).status_code == 204

    await register_and_login(client, "revoked@example.com")
    refused = await client.post(
        "/api/v1/workspaces/invitations/accept", json={"token": token}
    )
    assert refused.status_code == 400


@pytest.mark.asyncio
async def test_resend_rotates_the_token_and_invalidates_the_previous_link(
    client: httpx.AsyncClient, owned_workspace: uuid.UUID
) -> None:
    created = await client.post(
        f"/api/v1/workspaces/{owned_workspace}/invitations",
        json={"email": "rotated@example.com", "role": "viewer"},
    )
    first_token = created.json()["token"]
    invitation_id = created.json()["invitation"]["id"]
    resent = await client.post(
        f"/api/v1/workspaces/{owned_workspace}/invitations/{invitation_id}/resend"
    )
    assert resent.status_code == 200
    second_token = resent.json()["token"]
    assert second_token != first_token

    await register_and_login(client, "rotated@example.com")
    assert (
        await client.post(
            "/api/v1/workspaces/invitations/accept", json={"token": first_token}
        )
    ).status_code == 400
    assert (
        await client.post(
            "/api/v1/workspaces/invitations/accept", json={"token": second_token}
        )
    ).status_code == 200


# ---------------------------------------------------------------------------
# Ownership continuity
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transfer_swaps_both_roles_in_one_transaction(
    client: httpx.AsyncClient, db_session: AsyncSession, owned_workspace: uuid.UUID
) -> None:
    """One designated Owner at all times; the previous Owner becomes Admin."""
    await _seed_role(
        db_session,
        client,
        workspace_id=owned_workspace,
        email="successor@example.com",
        role=WORKSPACE_ROLE_ADMIN,
    )
    await _login(client, "role-owner@example.com")
    roster = (await client.get(f"/api/v1/workspaces/{owned_workspace}/members")).json()
    successor = next(
        member for member in roster if member["email"] == "successor@example.com"
    )
    account_before = await billing_account_for(db_session, owned_workspace)
    assert account_before is not None
    cohort_before = account_before.registration_cohort_at

    transferred = await client.post(
        f"/api/v1/workspaces/{owned_workspace}/ownership",
        json={"member_id": successor["id"]},
    )
    assert transferred.status_code == 200, transferred.text
    roles = {member["email"]: member["role"] for member in transferred.json()}
    assert roles["successor@example.com"] == WORKSPACE_ROLE_OWNER
    assert roles["role-owner@example.com"] == WORKSPACE_ROLE_ADMIN
    assert sum(1 for role in roles.values() if role == WORKSPACE_ROLE_OWNER) == 1

    # Billing identity and the frozen cohort are untouched by a role change.
    await db_session.refresh(account_before)
    account_after = await billing_account_for(db_session, owned_workspace)
    assert account_after is not None
    assert account_after.id == account_before.id
    assert account_after.registration_cohort_at == cohort_before


@pytest.mark.asyncio
async def test_a_workspace_can_never_be_left_ownerless(
    client: httpx.AsyncClient, db_session: AsyncSession, owned_workspace: uuid.UUID
) -> None:
    """Removal, demotion and departure of the Owner are all refused."""
    await _seed_role(
        db_session,
        client,
        workspace_id=owned_workspace,
        email="bystander@example.com",
        role=WORKSPACE_ROLE_ADMIN,
    )
    await _login(client, "role-owner@example.com")
    roster = (await client.get(f"/api/v1/workspaces/{owned_workspace}/members")).json()
    owner = next(member for member in roster if member["role"] == WORKSPACE_ROLE_OWNER)

    assert (
        await client.delete(
            f"/api/v1/workspaces/{owned_workspace}/members/{owner['id']}"
        )
    ).status_code == 409
    assert (
        await client.patch(
            f"/api/v1/workspaces/{owned_workspace}/members/{owner['id']}",
            json={"role": "member"},
        )
    ).status_code == 409
    assert (
        await client.post(f"/api/v1/workspaces/{owned_workspace}/members/leave")
    ).status_code == 409

    # The invariant applies equally to Admin, which may also initiate a
    # transfer but may not strand the workspace either.
    await _login(client, "bystander@example.com")
    assert (
        await client.delete(
            f"/api/v1/workspaces/{owned_workspace}/members/{owner['id']}"
        )
    ).status_code == 409


@pytest.mark.asyncio
async def test_removal_takes_effect_on_the_next_request(
    client: httpx.AsyncClient, db_session: AsyncSession, owned_workspace: uuid.UUID
) -> None:
    """A removed member loses server access immediately, not on re-login."""
    await _seed_role(
        db_session,
        client,
        workspace_id=owned_workspace,
        email="removed@example.com",
        role=WORKSPACE_ROLE_MEMBER,
    )
    await _login(client, "role-owner@example.com")
    roster = (await client.get(f"/api/v1/workspaces/{owned_workspace}/members")).json()
    target = next(
        member for member in roster if member["email"] == "removed@example.com"
    )

    await _login(client, "removed@example.com")
    headers = {"X-Workspace-Id": str(owned_workspace)}
    assert (await client.get("/api/v1/projects", headers=headers)).status_code == 200

    await _login(client, "role-owner@example.com")
    assert (
        await client.delete(
            f"/api/v1/workspaces/{owned_workspace}/members/{target['id']}"
        )
    ).status_code == 204

    await _login(client, "removed@example.com")
    assert (await client.get("/api/v1/projects", headers=headers)).status_code == 404
