"""Append-only references to verified signed agreements; no contract publication."""

import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.security_events import record_security_event
from app.domain.workspaces.policy import WorkspaceCapability, role_allows
from app.models.policy_acceptance import EnterpriseAgreementReference
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


class AgreementReferenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    workspace_id: uuid.UUID
    signatory_id: uuid.UUID
    reference: str = Field(
        min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$"
    )
    document_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    signed_at: AwareDatetime
    authority_verified: Literal[True]

    @model_validator(mode="after")
    def signed_in_past(self):
        if self.signed_at > datetime.now(UTC):
            raise ValueError("A signed agreement cannot have a future signature date")
        return self


async def record_agreement_reference(
    session: AsyncSession, *, actor_id: uuid.UUID, payload: AgreementReferenceInput
) -> EnterpriseAgreementReference:
    """Authorize operator and workspace signatory, then append in caller transaction."""
    actor = await session.scalar(
        select(User)
        .where(
            User.id == actor_id,
            User.is_active.is_(True),
            User.role == "admin",
        )
        .with_for_update()
    )
    if actor is None:
        raise PermissionError("An active platform administrator is required")
    workspace = await session.scalar(
        select(Workspace.id)
        .where(
            Workspace.id == payload.workspace_id,
            Workspace.is_system.is_(False),
        )
        .with_for_update()
    )
    member = await session.scalar(
        select(WorkspaceMember)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(
            WorkspaceMember.workspace_id == payload.workspace_id,
            WorkspaceMember.user_id == payload.signatory_id,
            User.is_active.is_(True),
        )
        .with_for_update()
    )
    if (
        workspace is None
        or member is None
        or not role_allows(member.role, WorkspaceCapability.MANAGE_MEMBERS)
    ):
        raise PermissionError(
            "An active authorized signatory in the target workspace is required"
        )
    values = payload.model_dump(exclude={"authority_verified"})
    recorded = await session.scalar(
        insert(EnterpriseAgreementReference)
        .values(
            **values,
            actor_id=actor_id,
        )
        .on_conflict_do_nothing(constraint="uq_enterprise_agreement_reference")
        .returning(EnterpriseAgreementReference.id)
    )
    row = await session.scalar(
        select(EnterpriseAgreementReference).where(
            EnterpriseAgreementReference.workspace_id == payload.workspace_id,
            EnterpriseAgreementReference.reference == payload.reference,
        )
    )
    if row is None:
        raise RuntimeError("Agreement reference was not persisted")
    if any(getattr(row, key) != value for key, value in values.items()):
        raise ValueError("Agreement reference already names different signed evidence")
    if recorded:
        record_security_event(
            session,
            event="policy.enterprise_reference",
            actor_id=actor_id,
            workspace_id=payload.workspace_id,
            target_id=row.id,
        )
    return row
