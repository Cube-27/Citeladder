# Workspace request/response schemas (all ids string UUID).
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.core.config.product_tour import PRODUCT_TOUR_VERSION
from app.domain.workspaces.policy import ASSIGNABLE_WORKSPACE_ROLES
from app.models.workspace import ProductTourStatus

#: The wire vocabulary for an assignable role. Spelled as a Literal so it
#: appears in the OpenAPI contract, and checked against the ONE policy at
#: import time so the two can never drift apart silently.
AssignableRole = Literal["admin", "member", "viewer"]

if set(get_args(AssignableRole)) != set(ASSIGNABLE_WORKSPACE_ROLES):  # pragma: no cover
    raise RuntimeError("AssignableRole drifted from ASSIGNABLE_WORKSPACE_ROLES")


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class WorkspaceResponse(BaseModel):
    """One accessible workspace and what the caller may do inside it.

    ``capabilities`` is the safe effective-capability projection from the ONE
    role policy — capability names only, never a billing profile, a provider
    reference, or another member's identity. It exists so the browser can hide
    controls the caller cannot use; the server still enforces every denial.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str
    capabilities: list[str]
    created_at: datetime
    updated_at: datetime


class ProductTourResponse(BaseModel):
    workspace_id: uuid.UUID
    version: str
    status: ProductTourStatus
    step_id: str | None
    started_at: datetime | None
    completed_at: datetime | None


class ProductTourUpdate(BaseModel):
    version: str = Field(min_length=1, max_length=32)
    status: ProductTourStatus
    step_id: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def validate_step(self) -> ProductTourUpdate:
        if self.version != PRODUCT_TOUR_VERSION:
            raise ValueError("version must match the current product tour")
        if self.status == ProductTourStatus.IN_PROGRESS and not self.step_id:
            raise ValueError("step_id is required while a tour is in progress")
        if self.status in {ProductTourStatus.COMPLETED, ProductTourStatus.SKIPPED}:
            self.step_id = None
        return self


class WorkspaceMemberResponse(BaseModel):
    """One membership. Identity plus role — no billing or private profile."""

    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    role: str
    is_self: bool
    created_at: datetime


class WorkspaceMemberRoleUpdate(BaseModel):
    role: AssignableRole


class WorkspaceOwnershipTransfer(BaseModel):
    """Name the member who becomes Owner. The caller becomes Admin."""

    member_id: uuid.UUID


class WorkspaceInvitationCreate(BaseModel):
    email: EmailStr
    role: AssignableRole


class WorkspaceInvitationResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    email: str
    role: str
    expires_at: datetime
    created_at: datetime


class WorkspaceInvitationIssued(BaseModel):
    """A freshly issued invitation and its ONE-TIME acceptance token.

    The token is never stored in plaintext and never appears in any later
    read: this response is the only time it exists outside the invitee's link.
    """

    invitation: WorkspaceInvitationResponse
    token: str


class WorkspaceInvitationAccept(BaseModel):
    token: str = Field(min_length=16, max_length=256)
