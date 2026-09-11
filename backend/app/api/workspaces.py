# Workspaces router: the caller's workspaces, membership and invitations.
#
# Selecting a workspace is an explicit act (the switcher, or the
# ``X-Workspace-Id`` header) — never inferred from a project. Everything
# administrative here is gated by ``require_workspace_members_admin``, which
# applies the ONE role policy; nothing in this file spells a role set of its
# own.
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, NoReturn

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_current_user,
    get_db,
    require_workspace_member,
    require_workspace_members_admin,
)
from app.core.config.workspaces import (
    CODE_INVITATION_INVALID,
    CODE_WORKSPACE_LIMIT_EXCEEDED,
    CODE_WORKSPACE_OWNER_REQUIRED,
)
from app.core.errors import ApiException
from app.domain.workspaces.invitations import (
    InvitationError,
    accept_invitation,
    create_invitation,
    list_invitations,
    resend_invitation,
    revoke_invitation,
)
from app.domain.workspaces.members import (
    MembershipError,
    change_member_role,
    leave_workspace,
    list_members,
    remove_member,
    transfer_ownership,
)
from app.domain.workspaces.policy import effective_capabilities
from app.domain.workspaces.schemas import (
    ProductTourResponse,
    ProductTourUpdate,
    WorkspaceCreate,
    WorkspaceInvitationAccept,
    WorkspaceInvitationCreate,
    WorkspaceInvitationIssued,
    WorkspaceInvitationResponse,
    WorkspaceMemberResponse,
    WorkspaceMemberRoleUpdate,
    WorkspaceOwnershipTransfer,
    WorkspaceResponse,
)
from app.domain.workspaces.service import (
    WorkspaceLimitExceededError,
    create_workspace,
    list_workspaces_for_user,
    product_tour_response,
    update_product_tour,
)
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceInvitation, WorkspaceMember

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

_CurrentUser = Annotated[User, Depends(get_current_user)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]
_MemberDep = Annotated[WorkspaceContext, Depends(require_workspace_member)]
_AdminDep = Annotated[WorkspaceContext, Depends(require_workspace_members_admin)]

# Membership changes that would strand the workspace are refused with 409:
# they are a state conflict, not a permission failure.
_CONFLICT_CODES = {
    "owner_cannot_be_removed",
    "owner_cannot_leave",
    "owner_role_requires_transfer",
    "already_owner",
    "already_a_member",
    "invitation_already_pending",
    "invitation_limit_exceeded",
    "invitation_not_pending",
}


def _workspace_view(workspace: Workspace, member: WorkspaceMember) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        role=member.role,
        capabilities=list(effective_capabilities(member.role)),
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )


def _invitation_view(invitation: WorkspaceInvitation) -> WorkspaceInvitationResponse:
    return WorkspaceInvitationResponse(
        id=invitation.id,
        workspace_id=invitation.workspace_id,
        email=invitation.email_normalized,
        role=invitation.role,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
    )


def _raise_membership(exc: MembershipError | InvitationError) -> NoReturn:
    if exc.code in {"member_not_found", "invitation_not_found", "workspace_not_found"}:
        raise ApiException.coded(
            status.HTTP_404_NOT_FOUND, CODE_INVITATION_INVALID, exc.code
        ) from exc
    if exc.code in _CONFLICT_CODES:
        raise ApiException.coded(
            status.HTTP_409_CONFLICT, CODE_WORKSPACE_OWNER_REQUIRED, exc.code
        ) from exc
    raise ApiException.coded(
        status.HTTP_400_BAD_REQUEST, CODE_INVITATION_INVALID, exc.code
    ) from exc


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(
    user: _CurrentUser, session: _SessionDep
) -> list[WorkspaceResponse]:
    """Every workspace the caller can select, with their effective capabilities.

    A workspace with zero projects is returned exactly like any other: it is
    selectable and manageable, and its identity never depends on a project.
    """
    rows = await list_workspaces_for_user(session, user)
    return [_workspace_view(workspace, member) for workspace, member in rows]


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace_endpoint(
    payload: WorkspaceCreate, user: _CurrentUser, session: _SessionDep
) -> WorkspaceResponse:
    try:
        workspace, member = await create_workspace(session, user, payload.name)
    except WorkspaceLimitExceededError as exc:
        raise ApiException.coded(
            status.HTTP_403_FORBIDDEN,
            CODE_WORKSPACE_LIMIT_EXCEEDED,
            str(exc),
            details={"limit": exc.limit},
        ) from exc
    return _workspace_view(workspace, member)


@router.post("/invitations/accept", response_model=WorkspaceResponse)
async def accept_workspace_invitation(
    payload: WorkspaceInvitationAccept, user: _CurrentUser, session: _SessionDep
) -> WorkspaceResponse:
    """Join the invited workspace as the signed-in, matching identity.

    Deliberately NOT workspace-scoped: the acceptor is not yet a member, so
    the token itself names the workspace. It is single-use, expiring, and
    bound to the invited address.
    """
    try:
        workspace, member = await accept_invitation(
            session, token=payload.token, user=user
        )
    except InvitationError as exc:
        await session.rollback()
        # Uniform refusal: an unknown token, a revoked one, an expired one and
        # a mismatched identity are indistinguishable to the caller, so a
        # probe cannot learn which invitations exist.
        raise ApiException.coded(
            status.HTTP_400_BAD_REQUEST,
            CODE_INVITATION_INVALID,
            "invitation_invalid",
        ) from exc
    await session.commit()
    return _workspace_view(workspace, member)


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberResponse])
async def get_workspace_members(
    ctx: _AdminDep, session: _SessionDep
) -> list[WorkspaceMemberResponse]:
    """The workspace roster. Administrative: Owner/Admin only."""
    rows = await list_members(session, ctx.workspace_id)
    return [
        WorkspaceMemberResponse(
            id=member.id,
            user_id=member.user_id,
            email=member_user.email,
            role=member.role,
            is_self=member.user_id == ctx.user.id,
            created_at=member.created_at,
        )
        for member, member_user in rows
    ]


@router.patch(
    "/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberResponse
)
async def patch_workspace_member(
    member_id: uuid.UUID,
    payload: WorkspaceMemberRoleUpdate,
    ctx: _AdminDep,
    session: _SessionDep,
) -> WorkspaceMemberResponse:
    """Change a member's role. ``owner`` is not assignable — transfer instead."""
    try:
        member = await change_member_role(
            session,
            workspace_id=ctx.workspace_id,
            member_id=member_id,
            role=payload.role,
        )
    except MembershipError as exc:
        await session.rollback()
        _raise_membership(exc)
    email = await _member_email(session, member)
    await session.commit()
    return WorkspaceMemberResponse(
        id=member.id,
        user_id=member.user_id,
        email=email,
        role=member.role,
        is_self=member.user_id == ctx.user.id,
        created_at=member.created_at,
    )


@router.delete(
    "/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_workspace_member(
    member_id: uuid.UUID, ctx: _AdminDep, session: _SessionDep
) -> None:
    """Remove a member. The designated Owner cannot be removed."""
    try:
        await remove_member(session, workspace_id=ctx.workspace_id, member_id=member_id)
    except MembershipError as exc:
        await session.rollback()
        _raise_membership(exc)
    await session.commit()


@router.post("/{workspace_id}/members/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_workspace_endpoint(ctx: _MemberDep, session: _SessionDep) -> None:
    """Drop the caller's own membership. Any role may leave except the Owner."""
    try:
        await leave_workspace(
            session, workspace_id=ctx.workspace_id, user_id=ctx.user.id
        )
    except MembershipError as exc:
        await session.rollback()
        _raise_membership(exc)
    await session.commit()


@router.post("/{workspace_id}/ownership", response_model=list[WorkspaceMemberResponse])
async def transfer_workspace_ownership(
    payload: WorkspaceOwnershipTransfer, ctx: _AdminDep, session: _SessionDep
) -> list[WorkspaceMemberResponse]:
    """Move the Owner designation; the previous Owner becomes Admin.

    Both halves land in one transaction, so the workspace is never ownerless
    and never has two Owners. Owner and Admin may both initiate it. Billing
    identity and accepted terms are untouched.
    """
    try:
        await transfer_ownership(
            session,
            workspace_id=ctx.workspace_id,
            new_owner_member_id=payload.member_id,
        )
    except MembershipError as exc:
        await session.rollback()
        _raise_membership(exc)
    await session.commit()
    rows = await list_members(session, ctx.workspace_id)
    return [
        WorkspaceMemberResponse(
            id=member.id,
            user_id=member.user_id,
            email=member_user.email,
            role=member.role,
            is_self=member.user_id == ctx.user.id,
            created_at=member.created_at,
        )
        for member, member_user in rows
    ]


@router.get(
    "/{workspace_id}/invitations", response_model=list[WorkspaceInvitationResponse]
)
async def get_workspace_invitations(
    ctx: _AdminDep, session: _SessionDep
) -> list[WorkspaceInvitationResponse]:
    """Pending invitations. Tokens are stored hashed and never listed."""
    return [
        _invitation_view(invitation)
        for invitation in await list_invitations(session, ctx.workspace_id)
    ]


@router.post(
    "/{workspace_id}/invitations",
    response_model=WorkspaceInvitationIssued,
    status_code=status.HTTP_201_CREATED,
)
async def post_workspace_invitation(
    payload: WorkspaceInvitationCreate, ctx: _AdminDep, session: _SessionDep
) -> WorkspaceInvitationIssued:
    """Invite an email at Admin, Member or Viewer.

    The response carries the acceptance token ONCE: only its hash is stored,
    and no later read can return it.
    """
    try:
        invitation, token = await create_invitation(
            session,
            workspace_id=ctx.workspace_id,
            email=str(payload.email),
            role=payload.role,
            invited_by=ctx.user,
        )
    except InvitationError as exc:
        await session.rollback()
        _raise_membership(exc)
    view = _invitation_view(invitation)
    await session.commit()
    return WorkspaceInvitationIssued(invitation=view, token=token)


@router.post(
    "/{workspace_id}/invitations/{invitation_id}/resend",
    response_model=WorkspaceInvitationIssued,
)
async def post_workspace_invitation_resend(
    invitation_id: uuid.UUID, ctx: _AdminDep, session: _SessionDep
) -> WorkspaceInvitationIssued:
    """Rotate the token and extend the expiry; the previous link stops working."""
    try:
        invitation, token = await resend_invitation(
            session, workspace_id=ctx.workspace_id, invitation_id=invitation_id
        )
    except InvitationError as exc:
        await session.rollback()
        _raise_membership(exc)
    view = _invitation_view(invitation)
    await session.commit()
    return WorkspaceInvitationIssued(invitation=view, token=token)


@router.delete(
    "/{workspace_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_workspace_invitation(
    invitation_id: uuid.UUID, ctx: _AdminDep, session: _SessionDep
) -> None:
    try:
        await revoke_invitation(
            session,
            workspace_id=ctx.workspace_id,
            invitation_id=invitation_id,
            at=datetime.now(UTC),
        )
    except InvitationError as exc:
        await session.rollback()
        _raise_membership(exc)
    await session.commit()


@router.get("/{workspace_id}/product-tour", response_model=ProductTourResponse)
async def get_product_tour(ctx: _MemberDep) -> ProductTourResponse:
    return product_tour_response(ctx.member)


@router.patch("/{workspace_id}/product-tour", response_model=ProductTourResponse)
async def patch_product_tour(
    payload: ProductTourUpdate, ctx: _MemberDep, session: _SessionDep
) -> ProductTourResponse:
    return await update_product_tour(session, ctx.member, payload)


async def _member_email(session: AsyncSession, member: WorkspaceMember) -> str:
    user = await session.get(User, member.user_id)
    return user.email if user is not None else ""
