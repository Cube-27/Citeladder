"""Versioned acceptance for every account creation path at first onboarding."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import legal
from app.domain.auth.security_events import record_security_event
from app.models.policy_acceptance import PolicyAcceptance


class PolicyStatus(BaseModel):
    terms_revision: str
    privacy_notice_revision: str
    accepted_at: datetime | None


class PolicyDecision(BaseModel):
    terms_revision: str = Field(min_length=1, max_length=64)
    accept_terms: Literal[True]


async def policy_status(
    session: AsyncSession, actor_id: uuid.UUID, workspace_id: uuid.UUID
) -> PolicyStatus:
    accepted_at = await session.scalar(
        select(PolicyAcceptance.accepted_at).where(
            PolicyAcceptance.actor_id == actor_id,
            PolicyAcceptance.workspace_id == workspace_id,
            PolicyAcceptance.terms_revision == legal.TERMS_REVISION,
        )
    )
    return PolicyStatus(
        terms_revision=legal.TERMS_REVISION,
        privacy_notice_revision=legal.PRIVACY_NOTICE_REVISION,
        accepted_at=accepted_at,
    )


async def accept_policy(
    session: AsyncSession,
    actor_id: uuid.UUID,
    workspace_id: uuid.UUID,
    decision: PolicyDecision,
) -> PolicyStatus:
    if decision.terms_revision != legal.TERMS_REVISION:
        raise ValueError(
            "The Terms changed. Review the current revision before accepting."
        )
    accepted = await session.scalar(
        insert(PolicyAcceptance)
        .values(
            actor_id=actor_id,
            workspace_id=workspace_id,
            terms_revision=legal.TERMS_REVISION,
            privacy_notice_revision=legal.PRIVACY_NOTICE_REVISION,
            context="authenticated_onboarding",
        )
        .on_conflict_do_nothing(constraint="uq_policy_acceptance_revision")
        .returning(PolicyAcceptance.id)
    )
    if accepted:
        record_security_event(
            session,
            event="policy.accept",
            actor_id=actor_id,
            workspace_id=workspace_id,
            target_id=accepted,
        )
    await session.commit()
    return await policy_status(session, actor_id, workspace_id)
